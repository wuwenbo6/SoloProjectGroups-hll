import { hl7Parser } from './parser.js'
import {
  insertMessage,
  insertPatient,
  insertOrder,
  insertObservation,
  getDb
} from '../db/database.js'
import type { ParsedHL7Message } from '../../shared/types.js'
import { fhirConverter, type FHIRPatient, type FHIRBundle } from '../fhir/converter.js'

export interface ProcessResult {
  success: boolean
  messageId: number
  patientId?: number
  orderId?: number
  error?: string | null
  fhirBundle?: FHIRBundle
  fhirPatient?: FHIRPatient
}

export async function processHL7Message(rawMessage: string, receivedVia: 'tcp' | 'file' = 'tcp') {
  let parsed: ParsedHL7Message | null = null
  let parseError: string | null = null
  let parseStatus: 'success' | 'partial' | 'failed' = 'success'

  try {
    parsed = hl7Parser.parse(rawMessage)
    parsed.receivedVia = receivedVia
  } catch (err) {
    parseError = err instanceof Error ? err.message : 'Unknown error'
    parseStatus = 'failed'
  }

  const messageId = insertMessage({
    rawMessage,
    messageType: parsed?.msh.messageType,
    sendingApp: parsed?.msh.sendingApplication,
    sendingFacility: parsed?.msh.sendingFacility,
    parseStatus,
    parseError,
    receivedVia
  })

  if (!parsed || parseStatus === 'failed') {
    return { success: false, messageId, error: parseError }
  }

  try {
    const patientName = hl7Parser.parsePatientName(parsed.pid)

    const patientId = insertPatient({
      patientId: parsed.pid.patientId || parsed.pid.patientIdList || `UNKNOWN_${messageId}`,
      lastName: patientName.lastName,
      firstName: patientName.firstName,
      birthDate: parsed.pid.dateTimeOfBirth,
      sex: parsed.pid.administrativeSex
    })

    const procedure = hl7Parser.parseProcedureName(parsed.obr.universalServiceIdentifier)

    const orderId = insertOrder({
      patientId,
      messageId,
      orderNumber: parsed.obr.placerOrderNumber || parsed.obr.fillerOrderNumber,
      procedureCode: procedure.code,
      procedureName: procedure.name,
      orderingProvider: parsed.obr.orderingProvider,
      observationDateTime: parsed.obr.observationDateTime
    })

    const observationIds: number[] = []
    for (const obx of parsed.obx) {
      const obsName = hl7Parser.parseObservationName(obx.observationIdentifier)
      const obsCode = hl7Parser.parseObservationCode(obx.observationIdentifier)

      const obsId = insertObservation({
        orderId,
        setValueType: obx.valueType,
        observationIdentifier: obsCode,
        observationName: obsName,
        observationValue: obx.observationValue,
        units: obx.units,
        referenceRange: obx.referenceRange,
        abnormalFlag: obx.abnormalFlags,
        resultStatus: obx.resultStatus
      })
      observationIds.push(obsId)
    }

    const fhirPatient = fhirConverter.toFHIRPatient(parsed.pid, patientId)
    const fhirBundle = fhirConverter.toFHIRBundle(parsed, patientId, orderId, observationIds)

    return {
      success: true,
      messageId,
      patientId,
      orderId,
      fhirPatient,
      fhirBundle
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown storage error'
    const dbHandle = getDb()
    const updateStmt = dbHandle.prepare('UPDATE messages SET parseStatus = ?, parseError = ? WHERE id = ?')
    updateStmt.run('partial', errorMsg, messageId)

    return { success: false, messageId, error: errorMsg }
  }
}

export function convertToFHIRPatient(
  patientId: number,
  patientData: {
    patientId: string
    lastName?: string
    firstName?: string
    birthDate?: string
    sex?: string
  }
): FHIRPatient {
  const pidSegment: any = {
    patientId: patientData.patientId,
    patientIdList: patientData.patientId,
    patientName: `${patientData.lastName || ''}^${patientData.firstName || ''}`,
    dateTimeOfBirth: patientData.birthDate || '',
    administrativeSex: patientData.sex || '',
    patientAddress: ''
  }
  return fhirConverter.toFHIRPatient(pidSegment, patientId)
}

export function convertHL7ToFHIR(rawMessage: string): { success: boolean; fhirBundle?: FHIRBundle; fhirPatient?: FHIRPatient; error?: string } {
  try {
    const parsed = hl7Parser.parse(rawMessage)
    const fhirPatient = fhirConverter.toFHIRPatient(parsed.pid)
    const fhirBundle = fhirConverter.toFHIRBundle(parsed, 0, 0, [])

    return {
      success: true,
      fhirPatient,
      fhirBundle
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error'
    }
  }
}

export default processHL7Message

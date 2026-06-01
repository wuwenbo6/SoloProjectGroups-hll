import { Router, type Request, type Response } from 'express'
import {
  getPatientById,
  getOrdersByPatientId,
  getObservationsByOrderId,
  getMessageById
} from '../db/database.js'
import { convertToFHIRPatient, convertHL7ToFHIR } from '../hl7/processor.js'
import { fhirConverter } from '../fhir/converter.js'
import type { Patient, Order, Observation } from '../../shared/types.js'

const router = Router()

router.get('/Patient/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const patient = getPatientById(id) as Patient | undefined

    if (!patient) {
      res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            details: { text: 'Patient not found' }
          }
        ]
      })
      return
    }

    const fhirPatient = convertToFHIRPatient(id, {
      patientId: patient.patientId,
      lastName: patient.lastName,
      firstName: patient.firstName,
      birthDate: patient.birthDate,
      sex: patient.sex
    })

    res.setHeader('Content-Type', 'application/fhir+json')
    res.json(fhirPatient)
  } catch (err) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: err instanceof Error ? err.message : 'Unknown error' }
        }
      ]
    })
  }
})

router.get('/Patient/:id/$everything', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const patient = getPatientById(id) as Patient | undefined

    if (!patient) {
      res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            details: { text: 'Patient not found' }
          }
        ]
      })
      return
    }

    const orders = getOrdersByPatientId(id) as Order[]
    const fhirPatient = convertToFHIRPatient(id, {
      patientId: patient.patientId,
      lastName: patient.lastName,
      firstName: patient.firstName,
      birthDate: patient.birthDate,
      sex: patient.sex
    })

    const allObservations = []
    for (const order of orders) {
      const observations = getObservationsByOrderId(order.id!) as Observation[]
      allObservations.push(...observations.map(obs => ({ order, obs })))
    }

    const bundle = {
      resourceType: 'Bundle',
      type: 'collection' as const,
      total: 1 + allObservations.length,
      entry: [
        {
          fullUrl: `urn:uuid:patient-${id}`,
          resource: fhirPatient
        },
        ...allObservations.map((item, idx) => {
          const pidSegment: any = {
            patientId: patient.patientId,
            lastName: patient.lastName,
            firstName: patient.firstName,
            dateTimeOfBirth: patient.birthDate,
            administrativeSex: patient.sex,
            patientAddress: ''
          }
          const obrSegment: any = {
            observationDateTime: item.order.observationDateTime,
            universalServiceIdentifier: `${item.order.procedureCode}^${item.order.procedureName}`,
            resultsRptStatusChngDateTime: item.order.createdAt,
            resultStatus: 'F'
          }
          const obxSegment: any = {
            setId: item.obs.id?.toString() || idx.toString(),
            valueType: item.obs.setValueType || 'ST',
            observationIdentifier: `${item.obs.observationIdentifier}^${item.obs.observationName}`,
            observationValue: item.obs.observationValue,
            units: item.obs.units,
            referenceRange: item.obs.referenceRange,
            abnormalFlags: item.obs.abnormalFlag,
            resultStatus: item.obs.resultStatus,
            dateTimeOfTheObservation: item.obs.createdAt
          }

          return {
            fullUrl: `urn:uuid:observation-${item.order.id}-${idx}`,
            resource: fhirConverter.toFHIRObservation(
              obxSegment,
              obrSegment,
              pidSegment,
              id,
              item.order.id!
            )
          }
        })
      ]
    }

    res.setHeader('Content-Type', 'application/fhir+json')
    res.json(bundle)
  } catch (err) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: err instanceof Error ? err.message : 'Unknown error' }
        }
      ]
    })
  }
})

router.post('/$convert', (req: Request, res: Response) => {
  try {
    const { message } = req.body

    if (!message) {
      res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'required',
            details: { text: 'HL7 message is required' }
          }
        ]
      })
      return
    }

    const result = convertHL7ToFHIR(message)

    if (!result.success) {
      res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: result.error || 'Failed to convert HL7 message' }
          }
        ]
      })
      return
    }

    res.setHeader('Content-Type', 'application/fhir+json')
    res.json({
      success: true,
      fhirPatient: result.fhirPatient,
      fhirBundle: result.fhirBundle
    })
  } catch (err) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: err instanceof Error ? err.message : 'Unknown error' }
        }
      ]
    })
  }
})

router.get('/Message/:id/$fhir', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const message = getMessageById(id) as { rawMessage: string } | undefined

    if (!message) {
      res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'not-found',
            details: { text: 'Message not found' }
          }
        ]
      })
      return
    }

    const result = convertHL7ToFHIR(message.rawMessage)

    if (!result.success) {
      res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'invalid',
            details: { text: result.error || 'Failed to convert HL7 message' }
          }
        ]
      })
      return
    }

    res.setHeader('Content-Type', 'application/fhir+json')
    res.json(result.fhirBundle)
  } catch (err) {
    res.status(500).json({
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'error',
          code: 'exception',
          details: { text: err instanceof Error ? err.message : 'Unknown error' }
        }
      ]
    })
  }
})

router.get('/metadata', (req: Request, res: Response) => {
  const capabilityStatement = {
    resourceType: 'CapabilityStatement',
    id: 'hl7-fhir-server',
    name: 'HL7 to FHIR Converter Server',
    status: 'active',
    experimental: true,
    date: new Date().toISOString(),
    publisher: 'HL7 Lab System',
    kind: 'instance',
    software: {
      name: 'HL7-FHIR-Converter',
      version: '1.0.0'
    },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/json'],
    rest: [
      {
        mode: 'server',
        resource: [
          {
            type: 'Patient',
            interaction: [
              { code: 'read' },
              { code: 'search-type' }
            ],
            operation: [
              {
                name: 'everything',
                definition: 'http://hl7.org/fhir/OperationDefinition/Patient-everything'
              }
            ]
          },
          {
            type: 'Observation',
            interaction: [
              { code: 'read' },
              { code: 'search-type' }
            ]
          },
          {
            type: 'DiagnosticReport',
            interaction: [
              { code: 'read' },
              { code: 'search-type' }
            ]
          }
        ],
        operation: [
          {
            name: 'convert',
            definition: 'Custom operation to convert HL7 v2 to FHIR',
            documentation: 'Convert an HL7 v2.x message to FHIR resources'
          }
        ]
      }
    ]
  }

  res.setHeader('Content-Type', 'application/fhir+json')
  res.json(capabilityStatement)
})

export default router

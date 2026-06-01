import type {
  Patient,
  Order,
  Observation,
  MSHSegment,
  PIDSegment,
  OBRSegment,
  OBXSegment,
  ParsedHL7Message
} from '../shared/types.js'

export interface FHIRHumanName {
  use?: string
  family?: string
  given?: string[]
  text?: string
}

export interface FHIRContactPoint {
  system?: string
  value?: string
  use?: string
}

export interface FHIRAddress {
  use?: string
  text?: string
  line?: string[]
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

export interface FHIRPatient {
  resourceType: 'Patient'
  id?: string
  identifier?: Array<{
    system?: string
    value?: string
  }>
  name?: FHIRHumanName[]
  telecom?: FHIRContactPoint[]
  gender?: 'male' | 'female' | 'other' | 'unknown'
  birthDate?: string
  address?: FHIRAddress[]
  active?: boolean
  meta?: {
    lastUpdated?: string
  }
}

export interface FHIRCodeableConcept {
  coding?: Array<{
    system?: string
    code?: string
    display?: string
  }>
  text?: string
}

export interface FHIRObservationReferenceRange {
  low?: { value?: number; unit?: string }
  high?: { value?: number; unit?: string }
  text?: string
}

export interface FHIRObservation {
  resourceType: 'Observation'
  id?: string
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown'
  category?: FHIRCodeableConcept[]
  code: FHIRCodeableConcept
  subject?: { reference: string; display?: string }
  effectiveDateTime?: string
  issued?: string
  performer?: Array<{ reference: string; display?: string }>
  valueQuantity?: {
    value?: number
    unit?: string
    system?: string
    code?: string
  }
  valueString?: string
  valueCodeableConcept?: FHIRCodeableConcept
  dataAbsentReason?: FHIRCodeableConcept
  interpretation?: FHIRCodeableConcept[]
  referenceRange?: FHIRObservationReferenceRange[]
  meta?: {
    lastUpdated?: string
  }
}

export interface FHIRDiagnosticReport {
  resourceType: 'DiagnosticReport'
  id?: string
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown'
  category?: FHIRCodeableConcept[]
  code: FHIRCodeableConcept
  subject?: { reference: string; display?: string }
  effectiveDateTime?: string
  issued?: string
  performer?: Array<{ reference: string; display?: string }>
  result?: Array<{ reference: string; display?: string }>
  meta?: {
    lastUpdated?: string
  }
}

export interface FHIRBundle {
  resourceType: 'Bundle'
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection'
  entry?: Array<{
    fullUrl?: string
    resource: FHIRPatient | FHIRObservation | FHIRDiagnosticReport
  }>
  meta?: {
    lastUpdated?: string
  }
}

interface NameComponents {
  lastName: string
  firstName: string
  middleName?: string
}

class FHIRConverter {
  private readonly oidSystem = 'urn:oid:2.16.840.1.113883.19'
  private readonly loincSystem = 'http://loinc.org'

  parseNameComponents(pid: PIDSegment): NameComponents {
    const nameField = pid.patientName
    if (!nameField) {
      return { lastName: '', firstName: '' }
    }

    const sepIndex = nameField.indexOf('^')
    if (sepIndex === -1) {
      return { lastName: nameField, firstName: '' }
    }

    const lastName = nameField.substring(0, sepIndex)
    const remaining = nameField.substring(sepIndex + 1)
    const parts = remaining.split('^')

    return {
      lastName,
      firstName: parts[0] || '',
      middleName: parts[1] || undefined
    }
  }

  parseAddress(addressStr: string): FHIRAddress {
    const parts = addressStr.split('^')
    const result: FHIRAddress = {
      text: addressStr
    }

    if (parts[0]) result.line = [parts[0]]
    if (parts[1]) result.city = parts[1]
    if (parts[2]) result.state = parts[2]
    if (parts[4]) result.country = parts[4]

    return result
  }

  parseGender(sex: string): 'male' | 'female' | 'other' | 'unknown' {
    switch (sex?.toUpperCase()) {
      case 'M':
        return 'male'
      case 'F':
        return 'female'
      case 'O':
        return 'other'
      case 'U':
      default:
        return 'unknown'
    }
  }

  parseDate(dateStr: string): string | undefined {
    if (!dateStr || dateStr.length < 8) return undefined

    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)

    return `${year}-${month}-${day}`
  }

  parseDateTime(dateStr: string): string | undefined {
    if (!dateStr || dateStr.length < 8) return undefined

    const year = dateStr.substring(0, 4)
    const month = dateStr.substring(4, 6)
    const day = dateStr.substring(6, 8)
    let hour = '00'
    let minute = '00'
    let second = '00'

    if (dateStr.length >= 10) hour = dateStr.substring(8, 10)
    if (dateStr.length >= 12) minute = dateStr.substring(10, 12)
    if (dateStr.length >= 14) second = dateStr.substring(12, 14)

    return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`
  }

  parseObservationValue(obx: OBXSegment) {
    const valueType = obx.valueType?.toUpperCase()
    const valueStr = obx.observationValue

    if (!valueStr) {
      return { dataAbsentReason: { text: 'Missing value' } }
    }

    switch (valueType) {
      case 'NM':
      case 'SN':
        const numValue = parseFloat(valueStr)
        if (!isNaN(numValue)) {
          return {
            valueQuantity: {
              value: numValue,
              unit: obx.units,
              system: 'http://unitsofmeasure.org',
              code: obx.units
            }
          }
        }
        return { valueString: valueStr }

      case 'ST':
      case 'FT':
      case 'TX':
        return { valueString: valueStr }

      case 'CWE':
      case 'CE':
        const parts = valueStr.split('^')
        return {
          valueCodeableConcept: {
            coding: [
              {
                system: this.loincSystem,
                code: parts[0],
                display: parts[1] || parts[0]
              }
            ],
            text: valueStr
          }
        }

      default:
        return { valueString: valueStr }
    }
  }

  parseObservationCode(obx: OBXSegment): FHIRCodeableConcept {
    const identifier = obx.observationIdentifier
    const parts = identifier?.split('^') || []

    return {
      coding: [
        {
          system: this.loincSystem,
          code: parts[0] || identifier,
          display: parts[1] || parts[0] || identifier
        }
      ],
      text: obx.observationName || parts[1] || identifier
    }
  }

  parseObservationStatus(obx: OBXSegment): FHIRObservation['status'] {
    switch (obx.resultStatus) {
      case 'F':
        return 'final'
      case 'P':
        return 'preliminary'
      case 'C':
        return 'corrected'
      case 'X':
        return 'cancelled'
      case 'R':
        return 'registered'
      case 'I':
        return 'registered'
      default:
        return 'final'
    }
  }

  parseAbnormalFlag(flag: string): FHIRCodeableConcept | undefined {
    if (!flag || flag === 'N' || flag === 'n') return undefined

    const mapping: Record<string, { code: string; display: string }> = {
      'L': { code: 'low', display: 'Below low normal' },
      'H': { code: 'high', display: 'Above high normal' },
      'LL': { code: 'critically-low', display: 'Below lower panic limit' },
      'HH': { code: 'critically-high', display: 'Above upper panic limit' },
      '<': { code: 'off-scale-low', display: 'Below low limit of detection' },
      '>': { code: 'off-scale-high', display: 'Above upper limit of detection' },
      'A': { code: 'abnormal', display: 'Abnormal' },
      'AA': { code: 'critically-abnormal', display: 'Critically abnormal' },
      'B': { code: 'better', display: 'Better' },
      'W': { code: 'worse', display: 'Worse' },
      'S': { code: 'susceptible', display: 'Susceptible' },
      'R': { code: 'resistant', display: 'Resistant' },
      'I': { code: 'intermediate', display: 'Intermediate' }
    }

    const info = mapping[flag.toUpperCase()]
    if (!info) {
      return {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
            code: 'abnormal',
            display: 'Abnormal'
          }
        ],
        text: `Flag: ${flag}`
      }
    }

    return {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
          code: info.code,
          display: info.display
        }
      ],
      text: info.display
    }
  }

  parseReferenceRange(obx: OBXSegment): FHIRObservationReferenceRange[] | undefined {
    const rangeStr = obx.referenceRange
    if (!rangeStr) return undefined

    const result: FHIRObservationReferenceRange = {
      text: rangeStr
    }

    const rangeMatch = rangeStr.match(/([\d.]+)\s*[-–]\s*([\d.]+)/)
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1])
      const high = parseFloat(rangeMatch[2])
      if (!isNaN(low)) result.low = { value: low, unit: obx.units }
      if (!isNaN(high)) result.high = { value: high, unit: obx.units }
    }

    const lessThanMatch = rangeStr.match(/<\s*([\d.]+)/)
    if (lessThanMatch) {
      const high = parseFloat(lessThanMatch[1])
      if (!isNaN(high)) result.high = { value: high, unit: obx.units }
    }

    const greaterThanMatch = rangeStr.match(/>\s*([\d.]+)/)
    if (greaterThanMatch) {
      const low = parseFloat(greaterThanMatch[1])
      if (!isNaN(low)) result.low = { value: low, unit: obx.units }
    }

    return [result]
  }

  toFHIRPatient(pid: PIDSegment, patientInternalId?: number): FHIRPatient {
    const name = this.parseNameComponents(pid)
    const birthDate = this.parseDate(pid.dateTimeOfBirth)
    const gender = this.parseGender(pid.administrativeSex)
    const patientId = pid.patientId || pid.patientIdList

    const patient: FHIRPatient = {
      resourceType: 'Patient',
      id: patientInternalId?.toString() || patientId,
      active: true
    }

    if (patientId) {
      patient.identifier = [
        {
          system: this.oidSystem,
          value: patientId
        }
      ]
    }

    if (name.lastName || name.firstName) {
      patient.name = [
        {
          use: 'official',
          family: name.lastName,
          given: name.middleName ? [name.firstName, name.middleName] : name.firstName ? [name.firstName] : undefined,
          text: `${name.lastName}${name.firstName ? '^' + name.firstName : ''}`
        }
      ]
    }

    if (gender) patient.gender = gender
    if (birthDate) patient.birthDate = birthDate

    if (pid.patientAddress) {
      patient.address = [this.parseAddress(pid.patientAddress)]
    }

    const telecom: FHIRContactPoint[] = []

    if (pid.phoneNumberHome) {
      telecom.push({
        system: 'phone',
        value: pid.phoneNumberHome.split('^')[0],
        use: 'home'
      })
    }

    if (pid.phoneNumberBusiness) {
      telecom.push({
        system: 'phone',
        value: pid.phoneNumberBusiness.split('^')[0],
        use: 'work'
      })
    }

    if (telecom.length > 0) {
      patient.telecom = telecom
    }

    return patient
  }

  toFHIRObservation(
    obx: OBXSegment,
    obr: OBRSegment,
    pid: PIDSegment,
    patientId: number,
    orderId: number
  ): FHIRObservation {
    const obsCode = this.parseObservationCode(obx)
    const obsStatus = this.parseObservationStatus(obx)
    const valueResult = this.parseObservationValue(obx)
    const interpretation = this.parseAbnormalFlag(obx.abnormalFlags)
    const referenceRange = this.parseReferenceRange(obx)

    const observation: FHIRObservation = {
      resourceType: 'Observation',
      id: `${orderId}-${obx.setId}`,
      status: obsStatus,
      code: obsCode,
      subject: {
        reference: `Patient/${patientId}`,
        display: `${pid.lastName || ''}${pid.firstName || ''}`
      },
      meta: {
        lastUpdated: new Date().toISOString()
      }
    }

    const effectiveDateTime = this.parseDateTime(obx.dateTimeOfTheObservation || obr.observationDateTime)
    if (effectiveDateTime) observation.effectiveDateTime = effectiveDateTime

    const issued = this.parseDateTime(obr.observationDateTime)
    if (issued) observation.issued = issued

    if ('valueQuantity' in valueResult) observation.valueQuantity = valueResult.valueQuantity
    if ('valueString' in valueResult) observation.valueString = valueResult.valueString
    if ('valueCodeableConcept' in valueResult) observation.valueCodeableConcept = valueResult.valueCodeableConcept
    if ('dataAbsentReason' in valueResult) observation.dataAbsentReason = { text: valueResult.dataAbsentReason.text }

    if (interpretation) observation.interpretation = [interpretation]
    if (referenceRange) observation.referenceRange = referenceRange

    return observation
  }

  toFHIRDiagnosticReport(
    obr: OBRSegment,
    pid: PIDSegment,
    patientId: number,
    orderId: number,
    observations: FHIRObservation[]
  ): FHIRDiagnosticReport {
    const procedureParts = obr.universalServiceIdentifier?.split('^') || []
    const reportStatus = this.parseReportStatus(obr.resultStatus)

    const report: FHIRDiagnosticReport = {
      resourceType: 'DiagnosticReport',
      id: orderId.toString(),
      status: reportStatus,
      code: {
        coding: [
          {
            system: this.loincSystem,
            code: procedureParts[0],
            display: procedureParts[1] || procedureParts[0]
          }
        ],
        text: obr.procedureName || procedureParts[1] || procedureParts[0]
      },
      subject: {
        reference: `Patient/${patientId}`,
        display: `${pid.lastName || ''}${pid.firstName || ''}`
      },
      result: observations.map(obs => ({
        reference: `Observation/${obs.id}`,
        display: obs.code.text
      })),
      meta: {
        lastUpdated: new Date().toISOString()
      }
    }

    const effectiveDateTime = this.parseDateTime(obr.observationDateTime)
    if (effectiveDateTime) report.effectiveDateTime = effectiveDateTime

    const issued = this.parseDateTime(obr.resultsRptStatusChngDateTime)
    if (issued) report.issued = issued

    return report
  }

  private parseReportStatus(status: string): FHIRDiagnosticReport['status'] {
    switch (status) {
      case 'F':
        return 'final'
      case 'P':
        return 'preliminary'
      case 'C':
        return 'corrected'
      case 'A':
        return 'amended'
      case 'X':
        return 'cancelled'
      case 'R':
        return 'registered'
      default:
        return 'final'
    }
  }

  toFHIRBundle(
    parsed: ParsedHL7Message,
    patientId: number,
    orderId: number,
    observationIds: number[]
  ): FHIRBundle {
    const patient = this.toFHIRPatient(parsed.pid, patientId)

    const observations: FHIRObservation[] = parsed.obx.map((obx, idx) =>
      this.toFHIRObservation(obx, parsed.obr, parsed.pid, patientId, orderId)
    )

    const diagnosticReport = this.toFHIRDiagnosticReport(
      parsed.obr,
      parsed.pid,
      patientId,
      orderId,
      observations
    )

    const bundle: FHIRBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          fullUrl: `urn:uuid:patient-${patientId}`,
          resource: patient
        },
        {
          fullUrl: `urn:uuid:diagnosticreport-${orderId}`,
          resource: diagnosticReport
        },
        ...observations.map((obs, idx) => ({
          fullUrl: `urn:uuid:observation-${orderId}-${idx}`,
          resource: obs
        }))
      ],
      meta: {
        lastUpdated: new Date().toISOString()
      }
    }

    return bundle
  }
}

export const fhirConverter = new FHIRConverter()
export default FHIRConverter

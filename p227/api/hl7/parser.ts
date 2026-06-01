import type {
  ParsedHL7Message,
  MSHSegment,
  PIDSegment,
  OBRSegment,
  OBXSegment
} from '../shared/types.js'

class HL7Parser {
  private fieldSep = '|'
  private compSep = '^'
  private subCompSep = '&'
  private repSep = '~'
  private escapeChar = '\\'

  parse(message: string): ParsedHL7Message {
    const cleanMessage = message.replace(/\r\n/g, '\r').replace(/\n/g, '\r')
    const segments = cleanMessage.split('\r').filter(s => s.trim().length > 0)

    if (segments.length === 0) {
      throw new Error('Empty HL7 message')
    }

    const mshSegment = segments.find(s => s.startsWith('MSH'))
    if (!mshSegment) {
      throw new Error('MSH segment not found')
    }

    this.extractSeparators(mshSegment)

    const msh = this.parseMSH(mshSegment)
    const pid = this.parsePID(segments.find(s => s.startsWith('PID')))
    const obr = this.parseOBR(segments.find(s => s.startsWith('OBR')))
    const obx = segments.filter(s => s.startsWith('OBX')).map(s => this.parseOBX(s))

    return {
      msh,
      pid,
      obr,
      obx,
      raw: message,
      receivedVia: 'tcp'
    }
  }

  private extractSeparators(msh: string) {
    this.fieldSep = msh.charAt(3)
    const encodingChars = msh.substring(4, 9)
    this.compSep = encodingChars.charAt(0)
    this.repSep = encodingChars.charAt(1)
    this.escapeChar = encodingChars.charAt(2)
    this.subCompSep = encodingChars.charAt(3)
  }

  private getFields(segment: string): string[] {
    return segment.split(this.fieldSep)
  }

  private getField(segment: string, index: number): string {
    const fields = this.getFields(segment)
    return this.decodeEscapeSequences(fields[index] || '')
  }

  private getComponents(field: string): string[] {
    return field.split(this.compSep).map(f => this.decodeEscapeSequences(f))
  }

  private getComponent(field: string, index: number): string {
    const components = this.getComponents(field)
    return components[index] || ''
  }

  private decodeEscapeSequences(value: string): string {
    if (!value) return value

    const escapeChar = this.escapeChar

    const result = value.replace(
      new RegExp(`${escapeChar}([FSTRE]|X[0-9A-Fa-f]+|H|N)${escapeChar}`, 'g'),
      (match, code) => {
        switch (code) {
          case 'F':
            return this.fieldSep
          case 'S':
            return this.compSep
          case 'T':
            return this.subCompSep
          case 'R':
            return this.repSep
          case 'E':
            return this.escapeChar
          case 'H':
            return ''
          case 'N':
            return ''
          default:
            if (code.startsWith('X')) {
              const hex = code.substring(1)
              let decoded = ''
              for (let i = 0; i < hex.length; i += 2) {
                decoded += String.fromCharCode(parseInt(hex.substring(i, i + 2), 16))
              }
              return decoded
            }
            return match
        }
      }
    )

    return result
  }

  private parseMSH(segment: string): MSHSegment {
    const fields = this.getFields(segment)
    let messageType = this.getComponent(fields[8] || '', 0)
    if (!messageType) {
      messageType = 'ORU^R01'
    }
    return {
      fieldSeparator: this.fieldSep,
      encodingCharacters: fields[1] || '',
      sendingApplication: fields[2] || '',
      sendingFacility: fields[3] || '',
      receivingApplication: fields[4] || '',
      receivingFacility: fields[5] || '',
      dateTimeOfMessage: fields[6] || '',
      security: fields[7] || '',
      messageType,
      messageControlId: fields[9] || '',
      processingId: this.getComponent(fields[10] || '', 0),
      versionId: this.getComponent(fields[11] || '', 0),
      sequenceNumber: fields[12] || '',
      continuationPointer: fields[13] || '',
      acceptAcknowledgementType: fields[14] || '',
      applicationAcknowledgementType: fields[15] || '',
      countryCode: fields[16] || '',
      characterSet: fields[17] || '',
      principalLanguageOfMessage: fields[18] || ''
    }
  }

  private parsePID(segment?: string): PIDSegment {
    if (!segment) {
      return this.emptyPID()
    }
    const fields = this.getFields(segment)
    return {
      setId: fields[1] || '',
      patientId: this.getComponent(fields[2] || '', 0),
      patientIdList: this.getComponent(fields[3] || '', 0) || this.getComponent(fields[2] || '', 0),
      alternatePatientId: fields[4] || '',
      patientName: fields[5] || '',
      motherMaidenName: fields[6] || '',
      dateTimeOfBirth: fields[7] || '',
      administrativeSex: fields[8] || '',
      patientAlias: fields[9] || '',
      race: fields[10] || '',
      patientAddress: fields[11] || '',
      countyCode: fields[12] || '',
      phoneNumberHome: fields[13] || '',
      phoneNumberBusiness: fields[14] || '',
      primaryLanguage: fields[15] || '',
      maritalStatus: fields[16] || '',
      religion: fields[17] || '',
      patientAccountNumber: fields[18] || '',
      ssnNumberPatient: fields[19] || '',
      driversLicenseNumberPatient: fields[20] || '',
      mothersIdentifier: fields[21] || '',
      ethnicGroup: fields[22] || '',
      birthPlace: fields[23] || '',
      multipleBirthIndicator: fields[24] || '',
      birthOrder: fields[25] || '',
      citizenship: fields[26] || '',
      veteransMilitaryStatus: fields[27] || '',
      nationality: fields[28] || '',
      patientDeathDateAndTime: fields[29] || '',
      patientDeathIndicator: fields[30] || ''
    }
  }

  private emptyPID(): PIDSegment {
    return {
      setId: '',
      patientId: '',
      patientIdList: '',
      alternatePatientId: '',
      patientName: '',
      motherMaidenName: '',
      dateTimeOfBirth: '',
      administrativeSex: '',
      patientAlias: '',
      race: '',
      patientAddress: '',
      countyCode: '',
      phoneNumberHome: '',
      phoneNumberBusiness: '',
      primaryLanguage: '',
      maritalStatus: '',
      religion: '',
      patientAccountNumber: '',
      ssnNumberPatient: '',
      driversLicenseNumberPatient: '',
      mothersIdentifier: '',
      ethnicGroup: '',
      birthPlace: '',
      multipleBirthIndicator: '',
      birthOrder: '',
      citizenship: '',
      veteransMilitaryStatus: '',
      nationality: '',
      patientDeathDateAndTime: '',
      patientDeathIndicator: ''
    }
  }

  private parseOBR(segment?: string): OBRSegment {
    if (!segment) {
      return this.emptyOBR()
    }
    const fields = this.getFields(segment)
    return {
      setId: fields[1] || '',
      placerOrderNumber: this.getComponent(fields[2] || '', 0),
      fillerOrderNumber: this.getComponent(fields[3] || '', 0),
      universalServiceIdentifier: fields[4] || '',
      priority: fields[5] || '',
      requestedDateTime: fields[6] || '',
      observationDateTime: fields[7] || '',
      observationEndDateTime: fields[8] || '',
      collectionVolume: fields[9] || '',
      collectorIdentifier: fields[10] || '',
      specimenActionCode: fields[11] || '',
      dangerCode: fields[12] || '',
      relevantClinicalInfo: fields[13] || '',
      specimenReceivedDateTime: fields[14] || '',
      specimenSource: fields[15] || '',
      orderingProvider: fields[16] || '',
      orderCallbackPhoneNumber: fields[17] || '',
      placerField1: fields[18] || '',
      placerField2: fields[19] || '',
      fillerField1: fields[20] || '',
      fillerField2: fields[21] || '',
      resultsRptStatusChngDateTime: fields[22] || '',
      chargeToPractice: fields[23] || '',
      diagnosticServSectId: fields[24] || '',
      resultStatus: fields[25] || '',
      parentResult: fields[26] || '',
      quantityTiming: fields[27] || '',
      specimen: fields[28] || '',
      specimenType: fields[29] || '',
      preferredSpecimenCharacteristics: fields[30] || '',
      specimenCondition: fields[31] || '',
      specimenCollectionMethod: fields[32] || '',
      specimenHandlingProcedure: fields[33] || '',
      specimenRejectReason: fields[34] || '',
      specimenQuality: fields[35] || '',
      specimenAppropriateness: fields[36] || '',
      specimenConditionCode: fields[37] || '',
      specimenConditionDescription: fields[38] || '',
      transportingArrangementResponsibility: fields[39] || '',
      transportingArrangement: fields[40] || '',
      escortRequired: fields[41] || '',
      plannedPatientTransportComment: fields[42] || '',
      specimenProcessingPriority: fields[43] || '',
      otherObrInformation: fields[44] || '',
      specimenTreatment: fields[45] || '',
      specimenTransportMode: fields[46] || ''
    }
  }

  private emptyOBR(): OBRSegment {
    return {
      setId: '',
      placerOrderNumber: '',
      fillerOrderNumber: '',
      universalServiceIdentifier: '',
      priority: '',
      requestedDateTime: '',
      observationDateTime: '',
      observationEndDateTime: '',
      collectionVolume: '',
      collectorIdentifier: '',
      specimenActionCode: '',
      dangerCode: '',
      relevantClinicalInfo: '',
      specimenReceivedDateTime: '',
      specimenSource: '',
      orderingProvider: '',
      orderCallbackPhoneNumber: '',
      placerField1: '',
      placerField2: '',
      fillerField1: '',
      fillerField2: '',
      resultsRptStatusChngDateTime: '',
      chargeToPractice: '',
      diagnosticServSectId: '',
      resultStatus: '',
      parentResult: '',
      quantityTiming: '',
      specimen: '',
      specimenType: '',
      preferredSpecimenCharacteristics: '',
      specimenCondition: '',
      specimenCollectionMethod: '',
      specimenHandlingProcedure: '',
      specimenRejectReason: '',
      specimenQuality: '',
      specimenAppropriateness: '',
      specimenConditionCode: '',
      specimenConditionDescription: '',
      transportingArrangementResponsibility: '',
      transportingArrangement: '',
      escortRequired: '',
      plannedPatientTransportComment: '',
      specimenProcessingPriority: '',
      otherObrInformation: '',
      specimenTreatment: '',
      specimenTransportMode: ''
    }
  }

  private parseOBX(segment: string): OBXSegment {
    const fields = this.getFields(segment)
    return {
      setId: fields[1] || '',
      valueType: fields[2] || '',
      observationIdentifier: fields[3] || '',
      observationSubId: fields[4] || '',
      observationValue: fields[5] || '',
      units: fields[6] || '',
      referenceRange: fields[7] || '',
      abnormalFlags: fields[8] || '',
      probability: fields[9] || '',
      natureOfAbnormalTest: fields[10] || '',
      resultStatus: fields[11] || '',
      effectiveDateOfReferenceRange: fields[12] || '',
      userDefinedAccessChecks: fields[13] || '',
      dateTimeOfTheObservation: fields[14] || '',
      producersId: fields[15] || '',
      responsibleObserver: fields[16] || '',
      observationMethod: fields[17] || '',
      equipmentInstanceIdentifier: fields[18] || '',
      analysisDateTime: fields[19] || ''
    }
  }

  parsePatientName(pid: PIDSegment): { lastName: string; firstName: string } {
    const nameComponents = this.getComponents(pid.patientName)
    return {
      lastName: nameComponents[0] || '',
      firstName: nameComponents[1] || ''
    }
  }

  parseObservationName(obxIdentifier: string): string {
    const components = this.getComponents(obxIdentifier)
    return components[1] || components[0] || ''
  }

  parseObservationCode(obxIdentifier: string): string {
    const components = this.getComponents(obxIdentifier)
    return components[0] || ''
  }

  parseProcedureName(obrIdentifier: string): { code: string; name: string } {
    const components = this.getComponents(obrIdentifier)
    return {
      code: components[0] || '',
      name: components[1] || ''
    }
  }
}

export const hl7Parser = new HL7Parser()
export default HL7Parser

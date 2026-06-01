export interface MSHSegment {
  fieldSeparator: string
  encodingCharacters: string
  sendingApplication: string
  sendingFacility: string
  receivingApplication: string
  receivingFacility: string
  dateTimeOfMessage: string
  security: string
  messageType: string
  messageControlId: string
  processingId: string
  versionId: string
  sequenceNumber: string
  continuationPointer: string
  acceptAcknowledgementType: string
  applicationAcknowledgementType: string
  countryCode: string
  characterSet: string
  principalLanguageOfMessage: string
}

export interface PIDSegment {
  setId: string
  patientId: string
  patientIdList: string
  alternatePatientId: string
  patientName: string
  motherMaidenName: string
  dateTimeOfBirth: string
  administrativeSex: string
  patientAlias: string
  race: string
  patientAddress: string
  countyCode: string
  phoneNumberHome: string
  phoneNumberBusiness: string
  primaryLanguage: string
  maritalStatus: string
  religion: string
  patientAccountNumber: string
  ssnNumberPatient: string
  driversLicenseNumberPatient: string
  mothersIdentifier: string
  ethnicGroup: string
  birthPlace: string
  multipleBirthIndicator: string
  birthOrder: string
  citizenship: string
  veteransMilitaryStatus: string
  nationality: string
  patientDeathDateAndTime: string
  patientDeathIndicator: string
}

export interface OBRSegment {
  setId: string
  placerOrderNumber: string
  fillerOrderNumber: string
  universalServiceIdentifier: string
  priority: string
  requestedDateTime: string
  observationDateTime: string
  observationEndDateTime: string
  collectionVolume: string
  collectorIdentifier: string
  specimenActionCode: string
  dangerCode: string
  relevantClinicalInfo: string
  specimenReceivedDateTime: string
  specimenSource: string
  orderingProvider: string
  orderCallbackPhoneNumber: string
  placerField1: string
  placerField2: string
  fillerField1: string
  fillerField2: string
  resultsRptStatusChngDateTime: string
  chargeToPractice: string
  diagnosticServSectId: string
  resultStatus: string
  parentResult: string
  quantityTiming: string
  specimen: string
  specimenType: string
  preferredSpecimenCharacteristics: string
  specimenCondition: string
  specimenCollectionMethod: string
  specimenHandlingProcedure: string
  specimenRejectReason: string
  specimenQuality: string
  specimenAppropriateness: string
  specimenConditionCode: string
  specimenConditionDescription: string
  transportingArrangementResponsibility: string
  transportingArrangement: string
  escortRequired: string
  plannedPatientTransportComment: string
  specimenProcessingPriority: string
  otherObrInformation: string
  specimenTreatment: string
  specimenTransportMode: string
}

export interface OBXSegment {
  setId: string
  valueType: string
  observationIdentifier: string
  observationSubId: string
  observationValue: string
  units: string
  referenceRange: string
  abnormalFlags: string
  probability: string
  natureOfAbnormalTest: string
  resultStatus: string
  effectiveDateOfReferenceRange: string
  userDefinedAccessChecks: string
  dateTimeOfTheObservation: string
  producersId: string
  responsibleObserver: string
  observationMethod: string
  equipmentInstanceIdentifier: string
  analysisDateTime: string
}

export interface ParsedHL7Message {
  msh: MSHSegment
  pid: PIDSegment
  obr: OBRSegment
  obx: OBXSegment[]
  raw: string
  receivedVia: 'tcp' | 'file'
}

export interface Patient {
  id?: number
  patientId: string
  lastName?: string
  firstName?: string
  birthDate?: string
  sex?: string
  createdAt?: string
}

export interface Order {
  id?: number
  patientId: number
  messageId: number
  orderNumber?: string
  procedureCode?: string
  procedureName?: string
  orderingProvider?: string
  observationDateTime?: string
  createdAt?: string
}

export interface Observation {
  id?: number
  orderId: number
  setValueType?: string
  observationIdentifier?: string
  observationName?: string
  observationValue?: string
  units?: string
  referenceRange?: string
  abnormalFlag?: string
  resultStatus?: string
  createdAt?: string
}

export interface MessageRecord {
  id?: number
  rawMessage: string
  messageType?: string
  sendingApp?: string
  sendingFacility?: string
  parseStatus: 'success' | 'partial' | 'failed'
  parseError?: string | null
  receivedAt?: string
  receivedVia: 'tcp' | 'file'
}

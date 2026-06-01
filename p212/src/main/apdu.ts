import { BacnetObjectType, BacnetPropertyIdentifier } from './npdu';

export enum ApduType {
  ConfirmedRequest = 0,
  UnconfirmedRequest = 1,
  SimpleAck = 2,
  ComplexAck = 3,
  SegmentAck = 4,
  Error = 5,
  Reject = 6,
  Abort = 7,
}

export enum ConfirmedServiceChoice {
  ReadProperty = 0x0C,
  ReadPropertyConditional = 0x0D,
  ReadPropertyMultiple = 0x0E,
  WriteProperty = 0x0F,
  DeviceCommunicationControl = 0x11,
  ConfirmedPrivateTransfer = 0x12,
  ConfirmedTextMessage = 0x13,
  ReadRange = 0x16,
  SubscribeCOV = 0x05,
  AtomicReadFile = 0x06,
  AtomicWriteFile = 0x07,
  AddListElement = 0x08,
  RemoveListElement = 0x09,
  CreateObject = 0x0A,
  DeleteObject = 0x0B,
}

export enum UnconfirmedServiceChoice {
  IAm = 0x00,
  IHave = 0x01,
  WhoIs = 0x08,
  WhoHas = 0x07,
  UnconfirmedCOVNotification = 0x02,
  UnconfirmedEventNotification = 0x03,
  UnconfirmedPrivateTransfer = 0x04,
  UnconfirmedTextMessage = 0x05,
  TimeSynchronization = 0x06,
  UTCRimeSynchronization = 0x09,
}

export interface BacnetObjectIdentifier {
  objectType: number;
  instance: number;
}

export interface ReadPropertyRequest {
  objectType: number;
  objectInstance: number;
  propertyIdentifier: number;
  propertyArrayIndex?: number;
}

export interface WritePropertyRequest {
  objectType: number;
  objectInstance: number;
  propertyIdentifier: number;
  propertyArrayIndex?: number;
  value: any;
  priority?: number;
}

export interface IAmRequest {
  objectType: number;
  objectInstance: number;
  maxApduLength: number;
  segmentationSupported: number;
  vendorId: number;
}

export interface WhoIsRequest {
  lowLimit?: number;
  highLimit?: number;
}

export interface ReadPropertyAck {
  objectType: number;
  objectInstance: number;
  propertyIdentifier: number;
  propertyArrayIndex?: number;
  value: any;
}

export type ParsedApdu = {
  type: ApduType;
  serviceChoice?: number;
  invokeId?: number;
  readProperty?: ReadPropertyRequest;
  writeProperty?: WritePropertyRequest;
  iAm?: IAmRequest;
  whoIs?: WhoIsRequest;
  readPropertyAck?: ReadPropertyAck;
  rawData: Uint8Array;
};

function decodeTag(data: Uint8Array, offset: number): {
  tagNumber: number;
  isContext: boolean;
  length: number;
  tagLength: number;
} | null {
  if (offset >= data.length) return null;

  const firstByte = data[offset];
  const tagNumber = (firstByte >> 4) & 0x0F;
  const isContext = !!(firstByte & 0x08);
  let length = firstByte & 0x07;
  let tagLength = 1;

  if (tagNumber === 0x0F) {
    if (offset + 1 >= data.length) return null;
    const extTag = data[offset + 1];
    tagLength = 2;
    if (length <= 4) {
      length += tagLength;
    } else {
      let lenVal = 0;
      let lenBytes = 0;
      const lenOffset = offset + tagLength;
      if (length === 5) {
        lenVal = data[lenOffset];
        lenBytes = 1;
      } else if (length === 6) {
        lenVal = (data[lenOffset] << 8) | data[lenOffset + 1];
        lenBytes = 2;
      } else if (length === 7) {
        lenVal =
          (data[lenOffset] << 16) |
          (data[lenOffset + 1] << 8) |
          data[lenOffset + 2];
        lenBytes = 3;
      }
      length = lenVal + tagLength + lenBytes;
    }
  } else {
    if (length <= 4) {
      length += tagLength;
    } else {
      let lenVal = 0;
      let lenBytes = 0;
      const lenOffset = offset + tagLength;
      if (length === 5) {
        lenVal = data[lenOffset];
        lenBytes = 1;
      } else if (length === 6) {
        lenVal = (data[lenOffset] << 8) | data[lenOffset + 1];
        lenBytes = 2;
      } else if (length === 7) {
        lenVal =
          (data[lenOffset] << 16) |
          (data[lenOffset + 1] << 8) |
          data[lenOffset + 2];
        lenBytes = 3;
      }
      length = lenVal + tagLength + lenBytes;
    }
  }

  return { tagNumber, isContext, length, tagLength };
}

function decodeObjectIdentifier(data: Uint8Array, offset: number): {
  objectId: BacnetObjectIdentifier;
  bytesRead: number;
} | null {
  if (offset + 4 >= data.length) return null;

  const b0 = data[offset + 1];
  const b1 = data[offset + 2];
  const b2 = data[offset + 3];
  const b3 = data[offset + 4];

  const packed = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  const objectType = (packed >> 22) & 0x03FF;
  const instance = packed & 0x003FFFFF;

  return {
    objectId: { objectType, instance },
    bytesRead: 5,
  };
}

function decodeUnsigned(data: Uint8Array, offset: number, length: number): number | null {
  if (offset + length > data.length) return null;

  let value = 0;
  for (let i = 0; i < length; i++) {
    value = (value << 8) | data[offset + i];
  }
  return value >>> 0;
}

function decodeApplicationTag(data: Uint8Array, offset: number): {
  value: any;
  bytesRead: number;
} | null {
  if (offset >= data.length) return null;

  const tag = decodeTag(data, offset);
  if (!tag) return null;

  const tagByte = data[offset];
  const appTag = (tagByte >> 4) & 0x0F;
  const lenField = tagByte & 0x07;

  let contentOffset = offset + 1;
  let contentLength = lenField;

  if (lenField === 5) {
    contentLength = data[contentOffset];
    contentOffset++;
  } else if (lenField === 6) {
    contentLength = (data[contentOffset] << 8) | data[contentOffset + 1];
    contentOffset += 2;
  } else if (lenField === 7) {
    contentLength =
      (data[contentOffset] << 16) |
      (data[contentOffset + 1] << 8) |
      data[contentOffset + 2];
    contentOffset += 3;
  }

  let value: any;

  switch (appTag) {
    case 1: {
      if (contentLength === 1) value = data[contentOffset] !== 0;
      else value = data[contentOffset] !== 0;
      break;
    }
    case 2: {
      value = decodeUnsigned(data, contentOffset, contentLength);
      break;
    }
    case 3: {
      let intVal = 0;
      for (let i = 0; i < contentLength; i++) {
        intVal = (intVal << 8) | data[contentOffset + i];
      }
      if (contentLength > 0 && data[contentOffset] & 0x80) {
        intVal = intVal - (1 << (contentLength * 8));
      }
      value = intVal;
      break;
    }
    case 4: {
      let fval = 0;
      for (let i = 0; i < contentLength; i++) {
        fval = (fval * 256 + data[contentOffset + i]);
      }
      if (contentLength === 4) {
        const buf = Buffer.from(data.slice(contentOffset, contentOffset + 4));
        value = buf.readFloatBE(0);
      } else if (contentLength === 8) {
        const buf = Buffer.from(data.slice(contentOffset, contentOffset + 8));
        value = buf.readDoubleBE(0);
      } else {
        value = fval;
      }
      break;
    }
    case 5: {
      value = data.slice(contentOffset, contentOffset + contentLength);
      break;
    }
    case 6: {
      let str = '';
      for (let i = 0; i < contentLength; i++) {
        str += String.fromCharCode(data[contentOffset + i]);
      }
      value = str;
      break;
    }
    case 7: {
      let str = '';
      for (let i = 0; i < contentLength; i += 2) {
        const code = (data[contentOffset + i] << 8) | data[contentOffset + i + 1];
        str += String.fromCharCode(code);
      }
      value = str;
      break;
    }
    case 8: {
      const oidResult = decodeObjectIdentifier(data, offset);
      if (oidResult) {
        value = oidResult.objectId;
      }
      break;
    }
    default: {
      value = data.slice(contentOffset, contentOffset + contentLength);
    }
  }

  return {
    value,
    bytesRead: (contentOffset - offset) + contentLength,
  };
}

function findContextTag(data: Uint8Array, offset: number, endOffset: number, contextTag: number): number | null {
  while (offset < endOffset) {
    if (offset >= data.length) return null;
    const tagByte = data[offset];
    const isContext = !!(tagByte & 0x08);
    const tagNum = (tagByte >> 4) & 0x0F;

    const lenField = tagByte & 0x07;
    let headerLen = 1;
    let contentLen = lenField;

    if (tagNum === 0x0F) {
      headerLen = 2;
    }

    if (lenField >= 5) {
      const lenOffset = offset + headerLen;
      if (lenField === 5 && lenOffset < data.length) {
        contentLen = data[lenOffset];
        headerLen++;
      } else if (lenField === 6 && lenOffset + 1 < data.length) {
        contentLen = (data[lenOffset] << 8) | data[lenOffset + 1];
        headerLen += 2;
      } else if (lenField === 7 && lenOffset + 2 < data.length) {
        contentLen = (data[lenOffset] << 16) | (data[lenOffset + 1] << 8) | data[lenOffset + 2];
        headerLen += 3;
      } else {
        return null;
      }
    }

    if (isContext && tagNum === contextTag) {
      return offset;
    }

    offset += headerLen + contentLen;
  }

  return null;
}

function parseReadPropertyRequest(data: Uint8Array, serviceDataOffset: number): ReadPropertyRequest | null {
  try {
    const endOffset = data.length;
    let offset = serviceDataOffset;

    if (offset >= endOffset) return null;

    const oidResult = decodeObjectIdentifier(data, offset);
    if (!oidResult) return null;
    offset += oidResult.bytesRead;

    const propTag = findContextTag(data, offset, endOffset, 1);
    if (propTag === null) return null;

    const propLenField = data[propTag] & 0x07;
    let propHeaderLen = 1;
    let propContentLen = propLenField;
    if (propLenField >= 5) {
      if (propLenField === 5) {
        propContentLen = data[propTag + 1];
        propHeaderLen = 2;
      }
    }
    const propValueOffset = propTag + propHeaderLen;
    const propertyIdentifier = decodeUnsigned(data, propValueOffset, propContentLen);
    if (propertyIdentifier === null) return null;

    offset = propTag + propHeaderLen + propContentLen;

    let propertyArrayIndex: number | undefined;
    const arrayTag = findContextTag(data, offset, endOffset, 2);
    if (arrayTag !== null) {
      const arrLenField = data[arrayTag] & 0x07;
      let arrHeaderLen = 1;
      let arrContentLen = arrLenField;
      if (arrLenField >= 5) {
        if (arrLenField === 5) {
          arrContentLen = data[arrayTag + 1];
          arrHeaderLen = 2;
        }
      }
      const arrValueOffset = arrayTag + arrHeaderLen;
      const idx = decodeUnsigned(data, arrValueOffset, arrContentLen);
      if (idx !== null) propertyArrayIndex = idx;
    }

    return {
      objectType: oidResult.objectId.objectType,
      objectInstance: oidResult.objectId.instance,
      propertyIdentifier,
      propertyArrayIndex,
    };
  } catch {
    return null;
  }
}

function parseWritePropertyRequest(data: Uint8Array, serviceDataOffset: number): WritePropertyRequest | null {
  try {
    const endOffset = data.length;
    let offset = serviceDataOffset;

    const oidResult = decodeObjectIdentifier(data, offset);
    if (!oidResult) return null;
    offset += oidResult.bytesRead;

    const propTag = findContextTag(data, offset, endOffset, 1);
    if (propTag === null) return null;

    const propLenField = data[propTag] & 0x07;
    let propHeaderLen = 1;
    let propContentLen = propLenField;
    if (propLenField >= 5) {
      if (propLenField === 5) { propContentLen = data[propTag + 1]; propHeaderLen = 2; }
    }
    const propertyIdentifier = decodeUnsigned(data, propTag + propHeaderLen, propContentLen);
    if (propertyIdentifier === null) return null;
    offset = propTag + propHeaderLen + propContentLen;

    let propertyArrayIndex: number | undefined;
    const arrayTag = findContextTag(data, offset, endOffset, 2);
    if (arrayTag !== null) {
      const arrLenField = data[arrayTag] & 0x07;
      let arrHeaderLen = 1;
      let arrContentLen = arrLenField;
      if (arrLenField >= 5) { if (arrLenField === 5) { arrContentLen = data[arrayTag + 1]; arrHeaderLen = 2; } }
      const idx = decodeUnsigned(data, arrayTag + arrHeaderLen, arrContentLen);
      if (idx !== null) propertyArrayIndex = idx;
    }

    const valueTag = findContextTag(data, offset, endOffset, 3);
    let value: any = null;
    if (valueTag !== null) {
      const valResult = decodeApplicationTag(data, valueTag + 1);
      if (valResult) value = valResult.value;
    }

    let priority: number | undefined;
    const prioTag = findContextTag(data, offset, endOffset, 4);
    if (prioTag !== null) {
      const prioLenField = data[prioTag] & 0x07;
      let prioHeaderLen = 1;
      let prioContentLen = prioLenField;
      if (prioLenField >= 5) { if (prioLenField === 5) { prioContentLen = data[prioTag + 1]; prioHeaderLen = 2; } }
      const p = decodeUnsigned(data, prioTag + prioHeaderLen, prioContentLen);
      if (p !== null) priority = p;
    }

    return {
      objectType: oidResult.objectId.objectType,
      objectInstance: oidResult.objectId.instance,
      propertyIdentifier,
      propertyArrayIndex,
      value,
      priority,
    };
  } catch {
    return null;
  }
}

function parseIAmRequest(data: Uint8Array, serviceDataOffset: number): IAmRequest | null {
  try {
    let offset = serviceDataOffset;
    const oidResult = decodeObjectIdentifier(data, offset);
    if (!oidResult) return null;
    offset += oidResult.bytesRead;

    const maxApduResult = decodeApplicationTag(data, offset);
    if (!maxApduResult) return null;
    offset += maxApduResult.bytesRead;

    const segResult = decodeApplicationTag(data, offset);
    if (!segResult) return null;
    offset += segResult.bytesRead;

    const vendorResult = decodeApplicationTag(data, offset);
    if (!vendorResult) return null;

    return {
      objectType: oidResult.objectId.objectType,
      objectInstance: oidResult.objectId.instance,
      maxApduLength: maxApduResult.value as number,
      segmentationSupported: segResult.value as number,
      vendorId: vendorResult.value as number,
    };
  } catch {
    return null;
  }
}

function parseWhoIsRequest(data: Uint8Array, serviceDataOffset: number): WhoIsRequest | null {
  try {
    if (serviceDataOffset >= data.length) return {};

    let offset = serviceDataOffset;
    const lowResult = decodeApplicationTag(data, offset);
    if (!lowResult) return {};

    offset += lowResult.bytesRead;
    const highResult = decodeApplicationTag(data, offset);
    if (!highResult) return { lowLimit: lowResult.value as number };

    return {
      lowLimit: lowResult.value as number,
      highLimit: highResult.value as number,
    };
  } catch {
    return null;
  }
}

function parseReadPropertyAck(data: Uint8Array, serviceDataOffset: number): ReadPropertyAck | null {
  try {
    const endOffset = data.length;
    let offset = serviceDataOffset;

    const oidResult = decodeObjectIdentifier(data, offset);
    if (!oidResult) return null;
    offset += oidResult.bytesRead;

    const propTag = findContextTag(data, offset, endOffset, 1);
    if (propTag === null) return null;

    const propLenField = data[propTag] & 0x07;
    let propHeaderLen = 1;
    let propContentLen = propLenField;
    if (propLenField >= 5) {
      if (propLenField === 5) { propContentLen = data[propTag + 1]; propHeaderLen = 2; }
    }
    const propertyIdentifier = decodeUnsigned(data, propTag + propHeaderLen, propContentLen);
    if (propertyIdentifier === null) return null;
    offset = propTag + propHeaderLen + propContentLen;

    let propertyArrayIndex: number | undefined;
    const arrayTag = findContextTag(data, offset, endOffset, 2);
    if (arrayTag !== null) {
      const arrLenField = data[arrayTag] & 0x07;
      let arrHeaderLen = 1;
      let arrContentLen = arrLenField;
      if (arrLenField >= 5) { if (arrLenField === 5) { arrContentLen = data[arrayTag + 1]; arrHeaderLen = 2; } }
      const idx = decodeUnsigned(data, arrayTag + arrHeaderLen, arrContentLen);
      if (idx !== null) propertyArrayIndex = idx;
    }

    const valueTag = findContextTag(data, offset, endOffset, 3);
    let value: any = null;
    if (valueTag !== null) {
      const valResult = decodeApplicationTag(data, valueTag + 1);
      if (valResult) value = valResult.value;
    }

    return {
      objectType: oidResult.objectId.objectType,
      objectInstance: oidResult.objectId.instance,
      propertyIdentifier,
      propertyArrayIndex,
      value,
    };
  } catch {
    return null;
  }
}

export function parseApdu(data: Uint8Array): ParsedApdu | null {
  if (data.length < 2) return null;

  const pduType = (data[0] >> 4) & 0x0F;
  let offset = 1;

  const result: ParsedApdu = {
    type: pduType as ApduType,
    rawData: data,
  };

  switch (pduType) {
    case ApduType.ConfirmedRequest: {
      const flags = data[0];
      const segmented = !!(flags & 0x08);
      const moreFollows = !!(flags & 0x04);

      result.invokeId = data[1];
      offset = 2;

      if (segmented) {
        offset += 2;
      }

      if (offset >= data.length) return result;
      result.serviceChoice = data[offset];
      offset++;

      switch (result.serviceChoice) {
        case ConfirmedServiceChoice.ReadProperty:
          result.readProperty = parseReadPropertyRequest(data, offset) ?? undefined;
          break;
        case ConfirmedServiceChoice.WriteProperty:
          result.writeProperty = parseWritePropertyRequest(data, offset) ?? undefined;
          break;
      }
      break;
    }

    case ApduType.UnconfirmedRequest: {
      result.serviceChoice = data[1];
      offset = 2;

      switch (result.serviceChoice) {
        case UnconfirmedServiceChoice.IAm:
          result.iAm = parseIAmRequest(data, offset) ?? undefined;
          break;
        case UnconfirmedServiceChoice.WhoIs:
          result.whoIs = parseWhoIsRequest(data, offset) ?? undefined;
          break;
      }
      break;
    }

    case ApduType.SimpleAck: {
      result.invokeId = data[1];
      result.serviceChoice = data[2];
      break;
    }

    case ApduType.ComplexAck: {
      const flags = data[0];
      const segmented = !!(flags & 0x08);

      result.invokeId = data[1];
      offset = 2;

      if (segmented) {
        offset += 2;
      }

      if (offset >= data.length) return result;
      result.serviceChoice = data[offset];
      offset++;

      switch (result.serviceChoice) {
        case ConfirmedServiceChoice.ReadProperty:
          result.readPropertyAck = parseReadPropertyAck(data, offset) ?? undefined;
          break;
      }
      break;
    }

    case ApduType.Error: {
      result.invokeId = data[1];
      result.serviceChoice = data[2];
      break;
    }

    case ApduType.Reject: {
      result.invokeId = data[1];
      break;
    }

    case ApduType.Abort: {
      result.invokeId = data[1];
      break;
    }
  }

  return result;
}

export function getObjectTypeString(type: number): string {
  const names: Record<number, string> = {
    [BacnetObjectType.AnalogInput]: 'AnalogInput',
    [BacnetObjectType.AnalogOutput]: 'AnalogOutput',
    [BacnetObjectType.AnalogValue]: 'AnalogValue',
    [BacnetObjectType.BinaryInput]: 'BinaryInput',
    [BacnetObjectType.BinaryOutput]: 'BinaryOutput',
    [BacnetObjectType.BinaryValue]: 'BinaryValue',
    [BacnetObjectType.Calendar]: 'Calendar',
    [BacnetObjectType.Command]: 'Command',
    [BacnetObjectType.Device]: 'Device',
    [BacnetObjectType.EventEnrollment]: 'EventEnrollment',
    [BacnetObjectType.File]: 'File',
    [BacnetObjectType.Group]: 'Group',
    [BacnetObjectType.Loop]: 'Loop',
    [BacnetObjectType.MultiStateInput]: 'MultiStateInput',
    [BacnetObjectType.MultiStateOutput]: 'MultiStateOutput',
    [BacnetObjectType.NotificationClass]: 'NotificationClass',
    [BacnetObjectType.Program]: 'Program',
    [BacnetObjectType.Schedule]: 'Schedule',
    [BacnetObjectType.Averaging]: 'Averaging',
    [BacnetObjectType.MultiStateValue]: 'MultiStateValue',
    [BacnetObjectType.TrendLog]: 'TrendLog',
    [BacnetObjectType.LifeSafetyPoint]: 'LifeSafetyPoint',
    [BacnetObjectType.LifeSafetyZone]: 'LifeSafetyZone',
    [BacnetObjectType.Accumulator]: 'Accumulator',
    [BacnetObjectType.PulseConverter]: 'PulseConverter',
  };
  return names[type] ?? `Unknown(${type})`;
}

export function getPropertyIdentifierString(id: number): string {
  const names: Record<number, string> = {
    [BacnetPropertyIdentifier.ObjectIdentifier]: 'ObjectIdentifier',
    [BacnetPropertyIdentifier.ObjectName]: 'ObjectName',
    [BacnetPropertyIdentifier.ObjectType]: 'ObjectType',
    [BacnetPropertyIdentifier.PresentValue]: 'PresentValue',
    [BacnetPropertyIdentifier.Description]: 'Description',
    [BacnetPropertyIdentifier.VendorName]: 'VendorName',
    [BacnetPropertyIdentifier.VendorIdentifier]: 'VendorIdentifier',
    [BacnetPropertyIdentifier.ModelName]: 'ModelName',
    [BacnetPropertyIdentifier.FirmwareRevision]: 'FirmwareRevision',
    [BacnetPropertyIdentifier.ApplicationSoftwareVersion]: 'ApplicationSoftwareVersion',
    [BacnetPropertyIdentifier.ProtocolVersion]: 'ProtocolVersion',
    [BacnetPropertyIdentifier.ProtocolRevision]: 'ProtocolRevision',
    [BacnetPropertyIdentifier.MaxApduLengthAccepted]: 'MaxApduLengthAccepted',
    [BacnetPropertyIdentifier.SegmentationSupported]: 'SegmentationSupported',
    [BacnetPropertyIdentifier.ObjectList]: 'ObjectList',
    [BacnetPropertyIdentifier.StatusFlags]: 'StatusFlags',
    [BacnetPropertyIdentifier.EventState]: 'EventState',
    [BacnetPropertyIdentifier.Reliability]: 'Reliability',
    [BacnetPropertyIdentifier.OutOfService]: 'OutOfService',
    [BacnetPropertyIdentifier.Units]: 'Units',
    [BacnetPropertyIdentifier.MinPresValue]: 'MinPresValue',
    [BacnetPropertyIdentifier.MaxPresValue]: 'MaxPresValue',
    [BacnetPropertyIdentifier.Resolution]: 'Resolution',
    [BacnetPropertyIdentifier.PriorityArray]: 'PriorityArray',
    [BacnetPropertyIdentifier.RelinquishDefault]: 'RelinquishDefault',
    [BacnetPropertyIdentifier.CovIncrement]: 'CovIncrement',
  };
  return names[id] ?? `Unknown(${id})`;
}

export enum BvlcFunction {
  Result = 0x00,
  WriteBroadcastDistributionTable = 0x01,
  ReadBroadcastDistributionTable = 0x02,
  ReadBroadcastDistributionTableAck = 0x03,
  ForwardedNPDU = 0x04,
  RegisterForeignDevice = 0x05,
  ReadForeignDeviceTable = 0x06,
  ReadForeignDeviceTableAck = 0x07,
  DeleteForeignDeviceTableEntry = 0x08,
  DistributeBroadcastToNetwork = 0x09,
  OriginalUnicastNPDU = 0x0A,
  OriginalBroadcastNPDU = 0x0B,
}

export enum BacnetObjectType {
  AnalogInput = 0,
  AnalogOutput = 1,
  AnalogValue = 2,
  BinaryInput = 3,
  BinaryOutput = 4,
  BinaryValue = 5,
  Calendar = 6,
  Command = 7,
  Device = 8,
  EventEnrollment = 9,
  File = 10,
  Group = 11,
  Loop = 12,
  MultiStateInput = 13,
  MultiStateOutput = 14,
  NotificationClass = 15,
  Program = 16,
  Schedule = 17,
  Averaging = 18,
  MultiStateValue = 19,
  TrendLog = 20,
  LifeSafetyPoint = 21,
  LifeSafetyZone = 22,
  Accumulator = 23,
  PulseConverter = 24,
  EventLog = 25,
  GlobalGroup = 26,
  TrendLogMultiple = 27,
  LoadControl = 28,
  StructuredView = 29,
  AccessDoor = 30,
}

export enum BacnetPropertyIdentifier {
  ObjectIdentifier = 75,
  ObjectName = 77,
  ObjectType = 79,
  PresentValue = 85,
  Description = 28,
  DeviceType = 31,
  VendorName = 121,
  VendorIdentifier = 120,
  ModelName = 70,
  FirmwareRevision = 44,
  ApplicationSoftwareVersion = 12,
  ProtocolVersion = 139,
  ProtocolRevision = 140,
  MaxApduLengthAccepted = 62,
  SegmentationSupported = 107,
  ObjectList = 76,
  StatusFlags = 111,
  EventState = 36,
  Reliability = 103,
  OutOfService = 81,
  Units = 117,
  MinPresValue = 65,
  MaxPresValue = 60,
  Resolution = 106,
  PriorityArray = 87,
  RelinquishDefault = 98,
  CovIncrement = 22,
}

export interface NpduInfo {
  version: number;
  control: number;
  destinationNetwork?: number;
  destinationLength?: number;
  sourceNetwork?: number;
  sourceLength?: number;
  hopCount?: number;
  messageType?: number;
  vendorId?: number;
  isApdu: boolean;
}

export function parseNpdu(data: Uint8Array): { npdu: NpduInfo; apduOffset: number } | null {
  if (data.length < 2) return null;

  const version = data[0];
  if (version !== 0x01) return null;

  const control = data[1];
  let offset = 2;

  const hasDestination = !!(control & 0x20);
  const hasSource = !!(control & 0x10);
  const isConfirmedRequest = !!(control & 0x04);
  const isNetworkMessage = !!(control & 0x08);

  const npdu: NpduInfo = {
    version,
    control,
    isApdu: !isNetworkMessage,
  };

  if (hasDestination) {
    if (offset + 3 > data.length) return null;
    npdu.destinationNetwork = (data[offset] << 8) | data[offset + 1];
    npdu.destinationLength = data[offset + 2];
    offset += 3;
    if (npdu.destinationLength > 0) {
      offset += npdu.destinationLength;
    }
  }

  if (hasSource) {
    if (offset + 3 > data.length) return null;
    npdu.sourceNetwork = (data[offset] << 8) | data[offset + 1];
    npdu.sourceLength = data[offset + 2];
    offset += 3;
    if (npdu.sourceLength > 0) {
      offset += npdu.sourceLength;
    }
  }

  if (hasDestination || isNetworkMessage) {
    if (offset >= data.length) return null;
    npdu.hopCount = data[offset];
    offset++;
  }

  if (isNetworkMessage) {
    if (offset >= data.length) return null;
    npdu.messageType = data[offset];
    offset++;
    if (npdu.messageType >= 0x80) {
      if (offset >= data.length) return null;
      npdu.vendorId = (data[offset] << 8) | data[offset + 1];
      offset += 2;
    }
  }

  return { npdu, apduOffset: offset };
}

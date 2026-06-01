import { MstpParser, MstpFrame, MstpFrameType, computeCrc8, computeCrc16 } from './mstp';
import { parseNpdu } from './npdu';
import { parseApdu, ApduType, ParsedApdu, ConfirmedServiceChoice, UnconfirmedServiceChoice, getObjectTypeString, getPropertyIdentifierString } from './apdu';
import { SerialPort } from 'serialport';

export interface CapturedFrame {
  id: number;
  timestamp: number;
  sourceAddress: number;
  destinationAddress: number;
  frameType: number;
  frameTypeName: string;
  headerCrcValid: boolean;
  dataCrcValid: boolean;
  crcValid: boolean;
  dataLength: number;
  apdu?: {
    type: string;
    serviceChoice?: number;
    serviceName?: string;
    readProperty?: any;
    writeProperty?: any;
    iAm?: any;
    whoIs?: any;
    readPropertyAck?: any;
  };
  rawHex: string;
}

export interface DeviceInfo {
  address: number;
  objectId: { objectType: number; instance: number };
  vendorId: number;
  maxApduLength: number;
  segmentationSupported: number;
  objects: ObjectInfo[];
  lastSeen: number;
}

export interface ObjectInfo {
  objectType: number;
  objectTypeName: string;
  instance: number;
  properties: PropertyInfo[];
}

export interface PropertyInfo {
  identifier: number;
  identifierName: string;
  value: any;
  lastUpdated: number;
}

function getFrameTypeName(frameType: number): string {
  const names: Record<number, string> = {
    [MstpFrameType.Token]: 'Token',
    [MstpFrameType.PollForMaster]: 'PollForMaster',
    [MstpFrameType.ReplyToPollForMaster]: 'ReplyToPollForMaster',
    [MstpFrameType.TestData]: 'TestData',
    [MstpFrameType.TestRequest]: 'TestRequest',
    [MstpFrameType.DataNoReply]: 'DataNoReply',
    [MstpFrameType.DataReply]: 'DataReply',
    [MstpFrameType.ReplyPostponed]: 'ReplyPostponed',
  };
  return names[frameType] ?? `Unknown(${frameType})`;
}

function getApduTypeName(type: number): string {
  const names: Record<number, string> = {
    [ApduType.ConfirmedRequest]: 'ConfirmedRequest',
    [ApduType.UnconfirmedRequest]: 'UnconfirmedRequest',
    [ApduType.SimpleAck]: 'SimpleAck',
    [ApduType.ComplexAck]: 'ComplexAck',
    [ApduType.SegmentAck]: 'SegmentAck',
    [ApduType.Error]: 'Error',
    [ApduType.Reject]: 'Reject',
    [ApduType.Abort]: 'Abort',
  };
  return names[type] ?? `Unknown(${type})`;
}

function getConfirmedServiceName(choice: number): string {
  const names: Record<number, string> = {
    [ConfirmedServiceChoice.ReadProperty]: 'ReadProperty',
    [ConfirmedServiceChoice.WriteProperty]: 'WriteProperty',
    [ConfirmedServiceChoice.ReadPropertyMultiple]: 'ReadPropertyMultiple',
    [ConfirmedServiceChoice.SubscribeCOV]: 'SubscribeCOV',
    [ConfirmedServiceChoice.AtomicReadFile]: 'AtomicReadFile',
    [ConfirmedServiceChoice.AtomicWriteFile]: 'AtomicWriteFile',
    [ConfirmedServiceChoice.AddListElement]: 'AddListElement',
    [ConfirmedServiceChoice.RemoveListElement]: 'RemoveListElement',
    [ConfirmedServiceChoice.CreateObject]: 'CreateObject',
    [ConfirmedServiceChoice.DeleteObject]: 'DeleteObject',
    [ConfirmedServiceChoice.DeviceCommunicationControl]: 'DeviceCommunicationControl',
    [ConfirmedServiceChoice.ConfirmedPrivateTransfer]: 'ConfirmedPrivateTransfer',
    [ConfirmedServiceChoice.ConfirmedTextMessage]: 'ConfirmedTextMessage',
    [ConfirmedServiceChoice.ReadRange]: 'ReadRange',
  };
  return names[choice] ?? `Unknown(${choice})`;
}

function getUnconfirmedServiceName(choice: number): string {
  const names: Record<number, string> = {
    [UnconfirmedServiceChoice.IAm]: 'IAm',
    [UnconfirmedServiceChoice.IHave]: 'IHave',
    [UnconfirmedServiceChoice.WhoIs]: 'WhoIs',
    [UnconfirmedServiceChoice.WhoHas]: 'WhoHas',
    [UnconfirmedServiceChoice.UnconfirmedCOVNotification]: 'COVNotification',
    [UnconfirmedServiceChoice.UnconfirmedEventNotification]: 'EventNotification',
    [UnconfirmedServiceChoice.UnconfirmedPrivateTransfer]: 'PrivateTransfer',
    [UnconfirmedServiceChoice.UnconfirmedTextMessage]: 'TextMessage',
    [UnconfirmedServiceChoice.TimeSynchronization]: 'TimeSynchronization',
  };
  return names[choice] ?? `Unknown(${choice})`;
}

export class BACnetMonitor {
  private port: SerialPort | null = null;
  private parser: MstpParser;
  private frameId = 0;
  private frames: CapturedFrame[] = [];
  private devices: Map<number, DeviceInfo> = new Map();
  private isCapturing = false;
  private onFrameCallback: ((frame: CapturedFrame) => void) | null = null;
  private onDeviceUpdateCallback: ((devices: DeviceInfo[]) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private maxFrames = 1000;

  constructor() {
    this.parser = new MstpParser();
    this.parser.setOnFrame(this.handleFrame.bind(this));
  }

  onFrame(callback: (frame: CapturedFrame) => void): void {
    this.onFrameCallback = callback;
  }

  onDeviceUpdate(callback: (devices: DeviceInfo[]) => void): void {
    this.onDeviceUpdateCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  async listPorts(): Promise<string[]> {
    const ports = await SerialPort.list();
    return ports.map(p => p.path);
  }

  async connect(portPath: string, baudRate: number = 38400): Promise<void> {
    if (this.port && this.port.isOpen) {
      await this.disconnect();
    }

    this.port = new SerialPort({
      path: portPath,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    });

    return new Promise((resolve, reject) => {
      if (!this.port) {
        reject(new Error('Failed to create serial port'));
        return;
      }

      this.port!.on('open', () => {
        this.isCapturing = true;
        resolve();
      });

      this.port!.on('error', (err) => {
        this.onErrorCallback?.(err.message);
        reject(err);
      });

      this.port!.on('data', (data: Buffer) => {
        if (this.isCapturing) {
          this.parser.feed(new Uint8Array(data));
        }
      });

      this.port!.on('close', () => {
        this.isCapturing = false;
      });
    });
  }

  async disconnect(): Promise<void> {
    this.isCapturing = false;
    if (this.port) {
      return new Promise((resolve) => {
        if (this.port!.isOpen) {
          this.port!.close(() => resolve());
        } else {
          resolve();
        }
        this.port = null;
      });
    }
  }

  isConnected(): boolean {
    return this.port?.isOpen ?? false;
  }

  clearFrames(): void {
    this.frames = [];
    this.frameId = 0;
  }

  getFrames(): CapturedFrame[] {
    return this.frames;
  }

  getDevices(): DeviceInfo[] {
    return Array.from(this.devices.values());
  }

  async sendWhoIs(lowLimit?: number, highLimit?: number): Promise<{ success: boolean; error?: string }> {
    if (!this.port || !this.port.isOpen) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const npdu = this.buildWhoIsNpdu(lowLimit, highLimit);
      const mstpFrame = this.buildMstpDataFrame(
        MstpFrameType.DataNoReply,
        0xFF,
        this.sourceAddress,
        npdu
      );
      this.port.write(mstpFrame);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  private sourceAddress: number = 0;

  setSourceAddress(addr: number): void {
    this.sourceAddress = addr;
  }

  private buildWhoIsNpdu(lowLimit?: number, highLimit?: number): Uint8Array {
    const apdu: number[] = [
      0x10,
      0x08,
    ];

    if (lowLimit !== undefined && highLimit !== undefined) {
      if (lowLimit <= 0xFFFF && highLimit <= 0xFFFF) {
        if (lowLimit <= 255 && highLimit <= 255) {
          apdu.push((4 << 4) | 1, lowLimit);
          apdu.push((4 << 4) | 1, highLimit);
        } else {
          apdu.push((4 << 4) | 2, (lowLimit >> 8) & 0xFF, lowLimit & 0xFF);
          apdu.push((4 << 4) | 2, (highLimit >> 8) & 0xFF, highLimit & 0xFF);
        }
      }
    }

    const npdu: number[] = [
      0x01,
      0x04,
    ];

    const fullPacket = new Uint8Array(npdu.length + apdu.length);
    fullPacket.set(npdu, 0);
    for (let i = 0; i < apdu.length; i++) {
      fullPacket[npdu.length + i] = apdu[i];
    }

    return fullPacket;
  }

  private buildMstpDataFrame(
    frameType: number,
    destination: number,
    source: number,
    data: Uint8Array
  ): Buffer {
    const dataLen = data.length;
    const headerBytes = [
      frameType,
      destination,
      source,
      (dataLen >> 8) & 0xFF,
      dataLen & 0xFF,
    ];
    const headerCrc = computeCrc8(new Uint8Array(headerBytes), 0xFF);

    const crcInput = new Uint8Array(headerBytes.length + data.length);
    crcInput.set(headerBytes, 0);
    crcInput.set(data, headerBytes.length);
    const dataCrc = computeCrc16(crcInput);

    const result: number[] = [
      0x55,
      0xFF,
      ...headerBytes,
      headerCrc,
    ];

    for (let i = 0; i < data.length; i++) {
      result.push(data[i]);
    }

    result.push((dataCrc >> 8) & 0xFF);
    result.push(dataCrc & 0xFF);

    return Buffer.from(result);
  }

  private handleFrame(frame: MstpFrame): void {
    const captured: CapturedFrame = {
      id: this.frameId++,
      timestamp: Date.now(),
      sourceAddress: frame.sourceAddress,
      destinationAddress: frame.destinationAddress,
      frameType: frame.frameType,
      frameTypeName: getFrameTypeName(frame.frameType),
      headerCrcValid: frame.headerCrcValid,
      dataCrcValid: frame.dataCrcValid,
      crcValid: frame.crcValid,
      dataLength: frame.dataLength,
      rawHex: Array.from(frame.raw).map(b => b.toString(16).padStart(2, '0')).join(' '),
    };

    if (frame.data && frame.data.length > 0 && frame.crcValid) {
      this.parseDataPayload(frame.data, captured);
    }

    this.frames.push(captured);
    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }

    this.onFrameCallback?.(captured);
  }

  private parseDataPayload(data: Uint8Array, captured: CapturedFrame): void {
    const npduResult = parseNpdu(data);
    if (!npduResult) return;

    if (!npduResult.npdu.isApdu) return;

    const apduData = data.slice(npduResult.apduOffset);
    const parsed = parseApdu(apduData);
    if (!parsed) return;

    captured.apdu = {
      type: getApduTypeName(parsed.type),
      serviceChoice: parsed.serviceChoice,
      serviceName: this.getServiceName(parsed),
    };

    switch (parsed.type) {
      case ApduType.ConfirmedRequest:
        if (parsed.readProperty) {
          captured.apdu!.readProperty = {
            objectType: getObjectTypeString(parsed.readProperty.objectType),
            objectInstance: parsed.readProperty.objectInstance,
            propertyIdentifier: getPropertyIdentifierString(parsed.readProperty.propertyIdentifier),
            propertyArrayIndex: parsed.readProperty.propertyArrayIndex,
          };
          this.updateDeviceFromReadProperty(captured.sourceAddress, parsed.readProperty);
        }
        if (parsed.writeProperty) {
          captured.apdu!.writeProperty = {
            objectType: getObjectTypeString(parsed.writeProperty.objectType),
            objectInstance: parsed.writeProperty.objectInstance,
            propertyIdentifier: getPropertyIdentifierString(parsed.writeProperty.propertyIdentifier),
            propertyArrayIndex: parsed.writeProperty.propertyArrayIndex,
            value: parsed.writeProperty.value,
            priority: parsed.writeProperty.priority,
          };
          this.updateDeviceFromWriteProperty(captured.sourceAddress, parsed.writeProperty);
        }
        break;

      case ApduType.UnconfirmedRequest:
        if (parsed.iAm) {
          captured.apdu!.iAm = {
            objectType: getObjectTypeString(parsed.iAm.objectType),
            objectInstance: parsed.iAm.objectInstance,
            maxApduLength: parsed.iAm.maxApduLength,
            segmentationSupported: parsed.iAm.segmentationSupported,
            vendorId: parsed.iAm.vendorId,
          };
          this.updateDeviceFromIAm(captured.sourceAddress, parsed.iAm);
        }
        if (parsed.whoIs) {
          captured.apdu!.whoIs = parsed.whoIs;
        }
        break;

      case ApduType.ComplexAck:
        if (parsed.readPropertyAck) {
          captured.apdu!.readPropertyAck = {
            objectType: getObjectTypeString(parsed.readPropertyAck.objectType),
            objectInstance: parsed.readPropertyAck.objectInstance,
            propertyIdentifier: getPropertyIdentifierString(parsed.readPropertyAck.propertyIdentifier),
            value: parsed.readPropertyAck.value,
          };
          this.updateDeviceFromReadPropertyAck(captured.sourceAddress, parsed.readPropertyAck);
        }
        break;
    }

    this.onDeviceUpdateCallback?.(this.getDevices());
  }

  private getServiceName(parsed: ParsedApdu): string | undefined {
    if (parsed.type === ApduType.ConfirmedRequest && parsed.serviceChoice !== undefined) {
      return getConfirmedServiceName(parsed.serviceChoice);
    }
    if (parsed.type === ApduType.UnconfirmedRequest && parsed.serviceChoice !== undefined) {
      return getUnconfirmedServiceName(parsed.serviceChoice);
    }
    if (parsed.type === ApduType.ComplexAck && parsed.serviceChoice !== undefined) {
      return getConfirmedServiceName(parsed.serviceChoice);
    }
    if (parsed.type === ApduType.SimpleAck && parsed.serviceChoice !== undefined) {
      return getConfirmedServiceName(parsed.serviceChoice);
    }
    return undefined;
  }

  private updateDeviceFromIAm(address: number, iAm: any): void {
    let device = this.devices.get(address);
    if (!device) {
      device = {
        address,
        objectId: { objectType: iAm.objectType, instance: iAm.objectInstance },
        vendorId: iAm.vendorId,
        maxApduLength: iAm.maxApduLength,
        segmentationSupported: iAm.segmentationSupported,
        objects: [],
        lastSeen: Date.now(),
      };
      this.devices.set(address, device);
    }

    device.objectId = { objectType: iAm.objectType, instance: iAm.objectInstance };
    device.vendorId = iAm.vendorId;
    device.maxApduLength = iAm.maxApduLength;
    device.segmentationSupported = iAm.segmentationSupported;
    device.lastSeen = Date.now();

    this.ensureDeviceObject(device, iAm.objectType, iAm.objectInstance);
  }

  private updateDeviceFromReadProperty(address: number, rp: any): void {
    let device = this.devices.get(address);
    if (!device) {
      device = {
        address,
        objectId: { objectType: 8, instance: 0 },
        vendorId: 0,
        maxApduLength: 0,
        segmentationSupported: 0,
        objects: [],
        lastSeen: Date.now(),
      };
      this.devices.set(address, device);
    }
    device.lastSeen = Date.now();

    this.ensureDeviceObject(device, rp.objectType, rp.objectInstance);
  }

  private updateDeviceFromWriteProperty(address: number, wp: any): void {
    let device = this.devices.get(address);
    if (!device) {
      device = {
        address,
        objectId: { objectType: 8, instance: 0 },
        vendorId: 0,
        maxApduLength: 0,
        segmentationSupported: 0,
        objects: [],
        lastSeen: Date.now(),
      };
      this.devices.set(address, device);
    }
    device.lastSeen = Date.now();

    this.ensureDeviceObject(device, wp.objectType, wp.objectInstance);
  }

  private updateDeviceFromReadPropertyAck(address: number, ack: any): void {
    let device = this.devices.get(address);
    if (!device) {
      device = {
        address,
        objectId: { objectType: 8, instance: 0 },
        vendorId: 0,
        maxApduLength: 0,
        segmentationSupported: 0,
        objects: [],
        lastSeen: Date.now(),
      };
      this.devices.set(address, device);
    }
    device.lastSeen = Date.now();

    const obj = this.ensureDeviceObject(device, ack.objectType, ack.objectInstance);
    const existingProp = obj.properties.find(p => p.identifier === ack.propertyIdentifier);
    if (existingProp) {
      existingProp.value = ack.value;
      existingProp.lastUpdated = Date.now();
    } else {
      obj.properties.push({
        identifier: ack.propertyIdentifier,
        identifierName: getPropertyIdentifierString(ack.propertyIdentifier),
        value: ack.value,
        lastUpdated: Date.now(),
      });
    }
  }

  private ensureDeviceObject(device: DeviceInfo, objectType: number, instance: number): ObjectInfo {
    let obj = device.objects.find(
      o => o.objectType === objectType && o.instance === instance
    );
    if (!obj) {
      obj = {
        objectType,
        objectTypeName: getObjectTypeString(objectType),
        instance,
        properties: [],
      };
      device.objects.push(obj);
    }
    return obj;
  }
}

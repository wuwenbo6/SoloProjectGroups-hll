export enum MstpFrameType {
  Token = 0,
  PollForMaster = 1,
  ReplyToPollForMaster = 2,
  TestData = 3,
  TestRequest = 4,
  DataNoReply = 5,
  DataReply = 6,
  ReplyPostponed = 7,
  BaudRateX1 = 8,
  BaudRateX2 = 9,
  BaudRateX4 = 10,
  BaudRateX8 = 11,
  BaudRateX16 = 12,
  BaudRateX32 = 13,
  BaudRateX64 = 14,
  BaudRateX128 = 15,
  BaudRateX256 = 16,
  BaudRateX512 = 17,
  BaudRateX1024 = 18,
  BaudRateX2048 = 19,
  BaudRateX4096 = 20,
  BaudRateX8192 = 21,
  BaudRateX16384 = 22,
  BaudRateX32768 = 23,
  BaudRateX65536 = 24,
}

const MSTP_PREAMBLE_1 = 0x55;
const MSTP_PREAMBLE_2 = 0xFF;

const CRC8_POLY = 0x9E;

function buildCrc8Table(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ CRC8_POLY;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc;
  }
  return table;
}

const CRC8_TABLE = buildCrc8Table();

const CRC16_POLY_ANSI = 0x3D65;

function buildCrc16Table(): Uint16Array {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ CRC16_POLY_ANSI;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc;
  }
  return table;
}

const CRC16_TABLE = buildCrc16Table();

export function computeCrc8(data: Uint8Array, seed: number = 0xFF): number {
  let crc = seed;
  for (let i = 0; i < data.length; i++) {
    crc = CRC8_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (~crc) & 0xFF;
}

export function computeCrc16(data: Uint8Array, seed: number = 0xFFFF): number {
  let crc = seed;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC16_TABLE[(crc ^ data[i]) & 0xFF];
  }
  return (~crc) & 0xFFFF;
}

export interface MstpFrame {
  frameType: number;
  destinationAddress: number;
  sourceAddress: number;
  dataLength: number;
  data?: Uint8Array;
  headerCrcValid: boolean;
  dataCrcValid: boolean;
  crcValid: boolean;
  raw: Uint8Array;
}

const VALID_FRAME_TYPES = new Set([
  MstpFrameType.Token,
  MstpFrameType.PollForMaster,
  MstpFrameType.ReplyToPollForMaster,
  MstpFrameType.TestData,
  MstpFrameType.TestRequest,
  MstpFrameType.DataNoReply,
  MstpFrameType.DataReply,
  MstpFrameType.ReplyPostponed,
]);

function isValidFrameType(ft: number): boolean {
  return VALID_FRAME_TYPES.has(ft);
}

function isDataFrame(ft: number): boolean {
  return (
    ft === MstpFrameType.DataNoReply ||
    ft === MstpFrameType.DataReply ||
    ft === MstpFrameType.TestData ||
    ft === MstpFrameType.TestRequest
  );
}

const MAX_DATA_LENGTH = 501;

export class MstpParser {
  private state:
    | 'IDLE'
    | 'PREAMBLE_1'
    | 'HEADER'
    | 'DATA' = 'IDLE';
  private headerBuffer: number[] = [];
  private dataBuffer: number[] = [];
  private dataLength = 0;
  private frameType = 0;
  private destinationAddress = 0;
  private sourceAddress = 0;
  private rawBuffer: number[] = [];
  private onFrame: ((frame: MstpFrame) => void) | null = null;

  constructor(onFrame?: (frame: MstpFrame) => void) {
    this.onFrame = onFrame ?? null;
  }

  setOnFrame(callback: (frame: MstpFrame) => void): void {
    this.onFrame = callback;
  }

  feed(data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.processByte(data[i]);
    }
  }

  reset(): void {
    this.state = 'IDLE';
    this.headerBuffer = [];
    this.dataBuffer = [];
    this.rawBuffer = [];
  }

  private processByte(byte: number): void {
    this.rawBuffer.push(byte);

    switch (this.state) {
      case 'IDLE':
        if (byte === MSTP_PREAMBLE_1) {
          this.state = 'PREAMBLE_1';
          this.rawBuffer = [byte];
        } else {
          this.rawBuffer = [];
        }
        break;

      case 'PREAMBLE_1':
        if (byte === MSTP_PREAMBLE_2) {
          this.state = 'HEADER';
          this.headerBuffer = [];
        } else if (byte === MSTP_PREAMBLE_1) {
          this.rawBuffer = [byte];
        } else {
          this.state = 'IDLE';
          this.rawBuffer = [];
        }
        break;

      case 'HEADER':
        this.headerBuffer.push(byte);

        if (this.headerBuffer.length === 1) {
          this.frameType = byte;
          if (!isValidFrameType(this.frameType)) {
            this.state = 'IDLE';
            this.rawBuffer = [];
            this.headerBuffer = [];
          }
        } else if (this.headerBuffer.length === 6) {
          this.destinationAddress = this.headerBuffer[1];
          this.sourceAddress = this.headerBuffer[2];
          const lengthMsb = this.headerBuffer[3];
          const lengthLsb = this.headerBuffer[4];
          const headerCrc = this.headerBuffer[5];

          const computedHeaderCrc = computeCrc8(
            new Uint8Array(this.headerBuffer.slice(0, 5)),
            0xFF
          );

          if (computedHeaderCrc !== headerCrc) {
            this.emitFrame(true, false);
            this.state = 'IDLE';
            break;
          }

          this.dataLength = (lengthMsb << 8) | lengthLsb;

          if (this.dataLength > MAX_DATA_LENGTH) {
            this.emitFrame(true, false);
            this.state = 'IDLE';
            break;
          }

          if (this.dataLength === 0 || !isDataFrame(this.frameType)) {
            this.emitFrame(true, true);
            this.state = 'IDLE';
          } else {
            this.dataBuffer = [];
            this.state = 'DATA';
          }
        }
        break;

      case 'DATA':
        this.dataBuffer.push(byte);

        if (this.dataBuffer.length === this.dataLength + 2) {
          const dataPayload = this.dataBuffer.slice(0, this.dataLength);
          const crcMsb = this.dataBuffer[this.dataLength];
          const crcLsb = this.dataBuffer[this.dataLength + 1];
          const receivedCrc = (crcMsb << 8) | crcLsb;

          const headerForDataCrc = new Uint8Array([
            this.frameType,
            this.destinationAddress,
            this.sourceAddress,
            (this.dataLength >> 8) & 0xFF,
            this.dataLength & 0xFF,
          ]);
          const fullDataForCrc = new Uint8Array(
            headerForDataCrc.length + dataPayload.length
          );
          fullDataForCrc.set(headerForDataCrc, 0);
          fullDataForCrc.set(dataPayload, headerForDataCrc.length);

          const computedDataCrc = computeCrc16(fullDataForCrc);
          const dataCrcValid = receivedCrc === computedDataCrc;

          this.emitFrame(true, dataCrcValid);
          this.state = 'IDLE';
        }
        break;
    }
  }

  private emitFrame(headerCrcValid: boolean, dataCrcValid: boolean): void {
    if (!this.onFrame) return;

    const frame: MstpFrame = {
      frameType: this.frameType,
      destinationAddress: this.destinationAddress,
      sourceAddress: this.sourceAddress,
      dataLength: this.dataLength,
      headerCrcValid,
      dataCrcValid,
      crcValid: headerCrcValid && dataCrcValid,
      raw: new Uint8Array(this.rawBuffer),
    };

    if (this.dataBuffer.length > 0 && this.dataLength > 0) {
      frame.data = new Uint8Array(this.dataBuffer.slice(0, this.dataLength));
    }

    this.onFrame(frame);
    this.rawBuffer = [];
    this.headerBuffer = [];
    this.dataBuffer = [];
  }
}

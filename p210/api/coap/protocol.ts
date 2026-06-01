export const COAP_VERSION = 1;

export enum MessageType {
  CON = 0,
  NON = 1,
  ACK = 2,
  RST = 3,
}

export enum MethodCode {
  GET = 1,
  POST = 2,
  PUT = 3,
  DELETE = 4,
}

export enum ResponseCode {
  Created = 0x41,
  Deleted = 0x42,
  Valid = 0x43,
  Changed = 0x44,
  Content = 0x45,
  Continue = 0x5F,
  BadRequest = 0x80,
  Unauthorized = 0x81,
  BadOption = 0x82,
  Forbidden = 0x83,
  NotFound = 0x84,
  MethodNotAllowed = 0x85,
  NotAcceptable = 0x86,
  RequestEntityIncomplete = 0x88,
  PreconditionFailed = 0x8C,
  RequestEntityTooLarge = 0x8D,
  UnsupportedContentFormat = 0x8F,
  InternalServerError = 0xA0,
  NotImplemented = 0xA1,
  BadGateway = 0xA2,
  ServiceUnavailable = 0xA3,
  GatewayTimeout = 0xA4,
  ProxyingNotSupported = 0xA5,
}

export enum OptionNumber {
  IfMatch = 1,
  UriHost = 3,
  ETag = 4,
  IfNoneMatch = 5,
  UriPort = 7,
  LocationPath = 8,
  UriPath = 11,
  ContentFormat = 12,
  MaxAge = 14,
  UriQuery = 15,
  Accept = 17,
  LocationQuery = 20,
  Block2 = 23,
  Block1 = 27,
  Size2 = 28,
  Size1 = 29,
  Observe = 6,
}

export interface CoapOption {
  number: number;
  value: Buffer;
}

export interface CoapMessage {
  version: number;
  type: MessageType;
  tokenLength: number;
  code: number;
  messageId: number;
  token: Buffer;
  options: CoapOption[];
  payload: Buffer;
}

export interface BlockOptionValue {
  szx: number;
  more: boolean;
  num: number;
}

export function blockSizeFromSzx(szx: number): number {
  return Math.pow(2, szx + 4);
}

export function szxFromBlockSize(blockSize: number): number {
  if (blockSize < 16) return 0;
  const exp = Math.floor(Math.log2(blockSize));
  return Math.min(exp - 4, 6);
}

export function encodeBlockOption(block: BlockOptionValue): Buffer {
  const szx = block.szx & 0x07;
  const m = block.more ? 1 : 0;
  const num = block.num & 0xFFFFF;

  if (num < 1 << 4) {
    return Buffer.from([(num << 4) | (m << 3) | szx]);
  } else if (num < 1 << 12) {
    const buf = Buffer.alloc(2);
    buf[0] = (num >> 4) & 0xFF;
    buf[1] = ((num & 0x0F) << 4) | (m << 3) | szx;
    return buf;
  } else {
    const buf = Buffer.alloc(3);
    buf[0] = (num >> 12) & 0xFF;
    buf[1] = (num >> 4) & 0xFF;
    buf[2] = ((num & 0x0F) << 4) | (m << 3) | szx;
    return buf;
  }
}

export function decodeBlockOption(buf: Buffer): BlockOptionValue {
  if (buf.length === 1) {
    return {
      szx: buf[0] & 0x07,
      more: (buf[0] & 0x08) !== 0,
      num: (buf[0] >> 4) & 0x0F,
    };
  } else if (buf.length === 2) {
    return {
      szx: buf[1] & 0x07,
      more: (buf[1] & 0x08) !== 0,
      num: ((buf[0] << 4) | ((buf[1] >> 4) & 0x0F)) & 0xFFF,
    };
  } else if (buf.length === 3) {
    return {
      szx: buf[2] & 0x07,
      more: (buf[2] & 0x08) !== 0,
      num: ((buf[0] << 12) | (buf[1] << 4) | ((buf[2] >> 4) & 0x0F)) & 0xFFFFF,
    };
  }
  return { szx: 0, more: false, num: 0 };
}

export function encodeMessage(msg: CoapMessage): Buffer {
  const header = Buffer.alloc(4);
  header[0] = ((msg.version & 0x03) << 6) | ((msg.type & 0x03) << 4) | (msg.tokenLength & 0x0F);
  header[1] = msg.code;
  header[2] = (msg.messageId >> 8) & 0xFF;
  header[3] = msg.messageId & 0xFF;

  const parts: Buffer[] = [header, msg.token];

  const sortedOptions = [...msg.options].sort((a, b) => a.number - b.number);
  let prevOptionNum = 0;
  for (const opt of sortedOptions) {
    const delta = opt.number - prevOptionNum;
    prevOptionNum = opt.number;

    const optionBuf = encodeOptionHeader(delta, opt.value.length);
    parts.push(optionBuf);
    if (opt.value.length > 0) {
      parts.push(opt.value);
    }
  }

  if (msg.payload.length > 0) {
    parts.push(Buffer.from([0xFF]));
    parts.push(msg.payload);
  }

  return Buffer.concat(parts);
}

function encodeOptionHeader(delta: number, length: number): Buffer {
  let extDelta = 0;
  let extLength = 0;
  let baseDelta = delta;
  let baseLength = length;

  if (delta >= 13 && delta <= 268) {
    baseDelta = 13;
    extDelta = delta - 13;
  } else if (delta > 268) {
    baseDelta = 14;
    extDelta = delta - 269;
  }

  if (length >= 13 && length <= 268) {
    baseLength = 13;
    extLength = length - 13;
  } else if (length > 268) {
    baseLength = 14;
    extLength = length - 269;
  }

  const parts: Buffer[] = [Buffer.from([(baseDelta << 4) | baseLength])];

  if (baseDelta === 13) {
    parts.push(Buffer.from([extDelta]));
  } else if (baseDelta === 14) {
    parts.push(Buffer.from([(extDelta >> 8) & 0xFF, extDelta & 0xFF]));
  }

  if (baseLength === 13) {
    parts.push(Buffer.from([extLength]));
  } else if (baseLength === 14) {
    parts.push(Buffer.from([(extLength >> 8) & 0xFF, extLength & 0xFF]));
  }

  return Buffer.concat(parts);
}

export function decodeMessage(buf: Buffer): CoapMessage {
  if (buf.length < 4) {
    throw new Error('CoAP message too short');
  }

  const version = (buf[0] >> 6) & 0x03;
  const type: MessageType = (buf[0] >> 4) & 0x03;
  const tokenLength = buf[0] & 0x0F;
  const code = buf[1];
  const messageId = (buf[2] << 8) | buf[3];

  let offset = 4;

  if (offset + tokenLength > buf.length) {
    throw new Error('Token extends beyond message');
  }
  const token = buf.subarray(offset, offset + tokenLength);
  offset += tokenLength;

  const options: CoapOption[] = [];
  let prevOptionNum = 0;

  while (offset < buf.length) {
    if (buf[offset] === 0xFF) {
      offset++;
      break;
    }

    const firstByte = buf[offset];
    let delta = (firstByte >> 4) & 0x0F;
    let length = firstByte & 0x0F;
    offset++;

    if (delta === 13) {
      delta = buf[offset] + 13;
      offset++;
    } else if (delta === 14) {
      delta = ((buf[offset] << 8) | buf[offset + 1]) + 269;
      offset += 2;
    } else if (delta === 15) {
      throw new Error('Invalid option delta');
    }

    if (length === 13) {
      length = buf[offset] + 13;
      offset++;
    } else if (length === 14) {
      length = ((buf[offset] << 8) | buf[offset + 1]) + 269;
      offset += 2;
    } else if (length === 15) {
      throw new Error('Invalid option length');
    }

    const optionNum = prevOptionNum + delta;
    prevOptionNum = optionNum;

    if (offset + length > buf.length) {
      throw new Error('Option value extends beyond message');
    }

    const optionValue = Buffer.from(buf.subarray(offset, offset + length));
    options.push({ number: optionNum, value: optionValue });
    offset += length;
  }

  const payload = offset < buf.length ? Buffer.from(buf.subarray(offset)) : Buffer.alloc(0);

  return { version, type, tokenLength, code, messageId, token, options, payload };
}

export function findOption(options: CoapOption[], number: number): CoapOption | undefined {
  return options.find(o => o.number === number);
}

export function responseCodeToString(code: number): string {
  const cls = (code >> 5) & 0x07;
  const detail = code & 0x1F;
  return `${cls}.${detail.toString().padStart(2, '0')}`;
}

export function isResponseCode(code: number): boolean {
  return (code >> 5) > 0;
}

export function codeToString(code: number): string {
  if (code === 0) return '0.00';
  if (code === MethodCode.GET) return '0.01 GET';
  if (code === MethodCode.POST) return '0.02 POST';
  if (code === MethodCode.PUT) return '0.03 PUT';
  if (code === MethodCode.DELETE) return '0.04 DELETE';
  return responseCodeToString(code);
}

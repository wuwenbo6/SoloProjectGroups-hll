export type CborValue =
  | { type: 'uint'; value: number | bigint }
  | { type: 'negint'; value: number | bigint }
  | { type: 'bytes'; value: Uint8Array; indefinite?: boolean }
  | { type: 'text'; value: string; indefinite?: boolean }
  | { type: 'array'; value: CborValue[]; indefinite?: boolean }
  | { type: 'map'; value: [CborValue, CborValue][]; indefinite?: boolean }
  | { type: 'tag'; tag: number | bigint; value: CborValue }
  | { type: 'float'; value: number }
  | { type: 'simple'; value: number }
  | { type: 'false' }
  | { type: 'true' }
  | { type: 'null' }
  | { type: 'undefined' };

export interface TreeNode {
  label: string;
  type: string;
  value?: string;
  children?: TreeNode[];
  expanded?: boolean;
}

export function hexToUint8Array(hex: string): Uint8Array {
  const cleaned = hex.replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error('Hex string must have an even number of characters');
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const result = decodeCborItem(bytes, 0);
  if (result.bytesRead < bytes.length) {
    throw new Error(
      `Extra bytes after CBOR data: ${bytes.length - result.bytesRead} bytes remaining`
    );
  }
  return result.value;
}

interface DecodeResult {
  value: CborValue;
  bytesRead: number;
}

function decodeCborItem(bytes: Uint8Array, offset: number): DecodeResult {
  if (offset >= bytes.length) {
    throw new Error('Unexpected end of CBOR data');
  }

  const initialByte = bytes[offset];
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;

  let infoOffset = offset + 1;

  let argument: number | bigint;
  if (additionalInfo < 24) {
    argument = additionalInfo;
  } else if (additionalInfo === 24) {
    if (infoOffset >= bytes.length) throw new Error('Unexpected end of CBOR data');
    argument = bytes[infoOffset];
    infoOffset += 1;
  } else if (additionalInfo === 25) {
    if (infoOffset + 2 > bytes.length) throw new Error('Unexpected end of CBOR data');
    argument = (bytes[infoOffset] << 8) | bytes[infoOffset + 1];
    infoOffset += 2;
  } else if (additionalInfo === 26) {
    if (infoOffset + 4 > bytes.length) throw new Error('Unexpected end of CBOR data');
    argument =
      (bytes[infoOffset] << 24) |
      (bytes[infoOffset + 1] << 16) |
      (bytes[infoOffset + 2] << 8) |
      bytes[infoOffset + 3];
    infoOffset += 4;
  } else if (additionalInfo === 27) {
    if (infoOffset + 8 > bytes.length) throw new Error('Unexpected end of CBOR data');
    argument =
      (BigInt(bytes[infoOffset]) << 56n) |
      (BigInt(bytes[infoOffset + 1]) << 48n) |
      (BigInt(bytes[infoOffset + 2]) << 40n) |
      (BigInt(bytes[infoOffset + 3]) << 32n) |
      (BigInt(bytes[infoOffset + 4]) << 24n) |
      (BigInt(bytes[infoOffset + 5]) << 16n) |
      (BigInt(bytes[infoOffset + 6]) << 8n) |
      BigInt(bytes[infoOffset + 7]);
    infoOffset += 8;
  } else if (additionalInfo === 31) {
    argument = -1;
  } else {
    throw new Error(`Reserved additional info value: ${additionalInfo}`);
  }

  switch (majorType) {
    case 0: {
      return { value: { type: 'uint', value: argument }, bytesRead: infoOffset - offset };
    }
    case 1: {
      const negVal = typeof argument === 'bigint' ? -(argument + 1n) : -(argument + 1);
      return { value: { type: 'negint', value: negVal }, bytesRead: infoOffset - offset };
    }
    case 2: {
      if (argument === -1) {
        return decodeIndefiniteBytes(bytes, infoOffset, false);
      }
      const len = Number(argument);
      if (infoOffset + len > bytes.length) throw new Error('Unexpected end of byte string');
      const data = bytes.slice(infoOffset, infoOffset + len);
      return { value: { type: 'bytes', value: data }, bytesRead: infoOffset + len - offset };
    }
    case 3: {
      if (argument === -1) {
        return decodeIndefiniteBytes(bytes, infoOffset, true);
      }
      const len = Number(argument);
      if (infoOffset + len > bytes.length) throw new Error('Unexpected end of text string');
      const textBytes = bytes.slice(infoOffset, infoOffset + len);
      const text = new TextDecoder().decode(textBytes);
      return { value: { type: 'text', value: text }, bytesRead: infoOffset + len - offset };
    }
    case 4: {
      if (argument === -1) {
        return decodeIndefiniteArray(bytes, infoOffset);
      }
      const len = Number(argument);
      const items: CborValue[] = [];
      let currentOffset = infoOffset;
      for (let i = 0; i < len; i++) {
        const result = decodeCborItem(bytes, currentOffset);
        items.push(result.value);
        currentOffset += result.bytesRead;
      }
      return { value: { type: 'array', value: items }, bytesRead: currentOffset - offset };
    }
    case 5: {
      if (argument === -1) {
        return decodeIndefiniteMap(bytes, infoOffset);
      }
      const len = Number(argument);
      const entries: [CborValue, CborValue][] = [];
      let currentOffset = infoOffset;
      for (let i = 0; i < len; i++) {
        const keyResult = decodeCborItem(bytes, currentOffset);
        currentOffset += keyResult.bytesRead;
        const valResult = decodeCborItem(bytes, currentOffset);
        currentOffset += valResult.bytesRead;
        entries.push([keyResult.value, valResult.value]);
      }
      return { value: { type: 'map', value: entries }, bytesRead: currentOffset - offset };
    }
    case 6: {
      const tagNum = argument;
      const contentResult = decodeCborItem(bytes, infoOffset);
      return {
        value: { type: 'tag', tag: tagNum, value: contentResult.value },
        bytesRead: infoOffset + contentResult.bytesRead - offset,
      };
    }
    case 7: {
      if (argument === 20) {
        return { value: { type: 'false' }, bytesRead: infoOffset - offset };
      } else if (argument === 21) {
        return { value: { type: 'true' }, bytesRead: infoOffset - offset };
      } else if (argument === 22) {
        return { value: { type: 'null' }, bytesRead: infoOffset - offset };
      } else if (argument === 23) {
        return { value: { type: 'undefined' }, bytesRead: infoOffset - offset };
      } else if (argument === 25) {
        const halfOffset = offset + 1;
        const f16 = decodeFloat16(bytes, halfOffset);
        return { value: { type: 'float', value: f16 }, bytesRead: infoOffset + 2 - offset };
      } else if (argument === 26) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + infoOffset, 4);
        const f32 = view.getFloat32(0);
        return { value: { type: 'float', value: f32 }, bytesRead: infoOffset + 4 - offset };
      } else if (argument === 27) {
        const view = new DataView(bytes.buffer, bytes.byteOffset + infoOffset, 8);
        const f64 = view.getFloat64(0);
        return { value: { type: 'float', value: f64 }, bytesRead: infoOffset + 8 - offset };
      } else if (typeof argument === 'number' && argument >= 0 && argument <= 19) {
        return { value: { type: 'simple', value: argument }, bytesRead: infoOffset - offset };
      } else {
        return { value: { type: 'simple', value: Number(argument) }, bytesRead: infoOffset - offset };
      }
    }
    default:
      throw new Error(`Unknown major type: ${majorType}`);
  }
}

function decodeFloat16(bytes: Uint8Array, offset: number): number {
  const half = (bytes[offset] << 8) | bytes[offset + 1];
  const sign = (half >> 15) & 1;
  const exp = (half >> 10) & 0x1f;
  const frac = half & 0x3ff;
  if (exp === 0) {
    const val = Math.pow(-1, sign) * Math.pow(2, -14) * (frac / 1024);
    return val;
  } else if (exp === 31) {
    if (frac === 0) return sign ? -Infinity : Infinity;
    return NaN;
  } else {
    const val = Math.pow(-1, sign) * Math.pow(2, exp - 15) * (1 + frac / 1024);
    return val;
  }
}

function decodeIndefiniteBytes(bytes: Uint8Array, offset: number, isText: boolean): DecodeResult {
  const chunks: Uint8Array[] = [];
  let currentOffset = offset;
  while (currentOffset < bytes.length) {
    const breakByte = bytes[currentOffset];
    if (breakByte === 0xff) {
      currentOffset += 1;
      break;
    }
    const result = decodeCborItem(bytes, currentOffset);
    if (isText) {
      if (result.value.type !== 'text') throw new Error('Expected text chunk in indefinite text string');
    } else {
      if (result.value.type !== 'bytes') throw new Error('Expected byte chunk in indefinite byte string');
    }
    if (result.value.type === 'text') {
      chunks.push(new TextEncoder().encode(result.value.value));
    } else if (result.value.type === 'bytes') {
      chunks.push(result.value.value);
    }
    currentOffset += result.bytesRead;
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const combined = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    combined.set(chunk, pos);
    pos += chunk.length;
  }
  if (isText) {
    return { value: { type: 'text', value: new TextDecoder().decode(combined), indefinite: true }, bytesRead: currentOffset - (offset - 1) };
  }
  return { value: { type: 'bytes', value: combined, indefinite: true }, bytesRead: currentOffset - (offset - 1) };
}

function decodeIndefiniteArray(bytes: Uint8Array, offset: number): DecodeResult {
  const items: CborValue[] = [];
  let currentOffset = offset;
  while (currentOffset < bytes.length) {
    if (bytes[currentOffset] === 0xff) {
      currentOffset += 1;
      break;
    }
    const result = decodeCborItem(bytes, currentOffset);
    items.push(result.value);
    currentOffset += result.bytesRead;
  }
  return { value: { type: 'array', value: items, indefinite: true }, bytesRead: currentOffset - (offset - 1) };
}

function decodeIndefiniteMap(bytes: Uint8Array, offset: number): DecodeResult {
  const entries: [CborValue, CborValue][] = [];
  let currentOffset = offset;
  while (currentOffset < bytes.length) {
    if (bytes[currentOffset] === 0xff) {
      currentOffset += 1;
      break;
    }
    const keyResult = decodeCborItem(bytes, currentOffset);
    currentOffset += keyResult.bytesRead;
    const valResult = decodeCborItem(bytes, currentOffset);
    currentOffset += valResult.bytesRead;
    entries.push([keyResult.value, valResult.value]);
  }
  return { value: { type: 'map', value: entries, indefinite: true }, bytesRead: currentOffset - (offset - 1) };
}

export function encodeCbor(value: CborValue): Uint8Array {
  const chunks: Uint8Array[] = [];
  encodeCborValue(value, chunks);
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

function encodeHead(majorType: number, argument: number | bigint, chunks: Uint8Array[]): void {
  const mt = majorType << 5;
  if (typeof argument === 'bigint') {
    if (argument < 0x18n) {
      chunks.push(new Uint8Array([mt | Number(argument)]));
    } else if (argument < 0x100n) {
      chunks.push(new Uint8Array([mt | 24, Number(argument)]));
    } else if (argument < 0x10000n) {
      const v = Number(argument);
      chunks.push(new Uint8Array([mt | 25, (v >> 8) & 0xff, v & 0xff]));
    } else if (argument < 0x100000000n) {
      const v = Number(argument);
      chunks.push(
        new Uint8Array([mt | 26, (v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff])
      );
    } else {
      chunks.push(
        new Uint8Array([
          mt | 27,
          Number((argument >> 56n) & 0xffn),
          Number((argument >> 48n) & 0xffn),
          Number((argument >> 40n) & 0xffn),
          Number((argument >> 32n) & 0xffn),
          Number((argument >> 24n) & 0xffn),
          Number((argument >> 16n) & 0xffn),
          Number((argument >> 8n) & 0xffn),
          Number(argument & 0xffn),
        ])
      );
    }
    return;
  }
  if (argument < 24) {
    chunks.push(new Uint8Array([mt | argument]));
  } else if (argument < 0x100) {
    chunks.push(new Uint8Array([mt | 24, argument]));
  } else if (argument < 0x10000) {
    chunks.push(new Uint8Array([mt | 25, (argument >> 8) & 0xff, argument & 0xff]));
  } else if (argument < 0x100000000) {
    chunks.push(
      new Uint8Array([
        mt | 26,
        (argument >> 24) & 0xff,
        (argument >> 16) & 0xff,
        (argument >> 8) & 0xff,
        argument & 0xff,
      ])
    );
  } else {
    const big = BigInt(argument);
    chunks.push(
      new Uint8Array([
        mt | 27,
        Number((big >> 56n) & 0xffn),
        Number((big >> 48n) & 0xffn),
        Number((big >> 40n) & 0xffn),
        Number((big >> 32n) & 0xffn),
        Number((big >> 24n) & 0xffn),
        Number((big >> 16n) & 0xffn),
        Number((big >> 8n) & 0xffn),
        Number(big & 0xffn),
      ])
    );
  }
}

function encodeCborValue(value: CborValue, chunks: Uint8Array[]): void {
  switch (value.type) {
    case 'uint':
      encodeHead(0, value.value, chunks);
      break;
    case 'negint': {
      const arg =
        typeof value.value === 'bigint' ? -(value.value + 1n) : -(value.value + 1);
      encodeHead(1, arg, chunks);
      break;
    }
    case 'bytes':
      encodeHead(2, value.value.length, chunks);
      chunks.push(value.value);
      break;
    case 'text': {
      const encoded = new TextEncoder().encode(value.value);
      encodeHead(3, encoded.length, chunks);
      chunks.push(encoded);
      break;
    }
    case 'array':
      if (value.indefinite) {
        chunks.push(new Uint8Array([0x9f]));
        for (const item of value.value) {
          encodeCborValue(item, chunks);
        }
        chunks.push(new Uint8Array([0xff]));
      } else {
        encodeHead(4, value.value.length, chunks);
        for (const item of value.value) {
          encodeCborValue(item, chunks);
        }
      }
      break;
    case 'map':
      if (value.indefinite) {
        chunks.push(new Uint8Array([0xbf]));
        for (const [k, v] of value.value) {
          encodeCborValue(k, chunks);
          encodeCborValue(v, chunks);
        }
        chunks.push(new Uint8Array([0xff]));
      } else {
        encodeHead(5, value.value.length, chunks);
        for (const [k, v] of value.value) {
          encodeCborValue(k, chunks);
          encodeCborValue(v, chunks);
        }
      }
      break;
    case 'tag':
      encodeHead(6, value.tag, chunks);
      encodeCborValue(value.value, chunks);
      break;
    case 'float': {
      chunks.push(new Uint8Array([0xfb]));
      const f64Buf = new ArrayBuffer(8);
      new DataView(f64Buf).setFloat64(0, value.value);
      chunks.push(new Uint8Array(f64Buf));
      break;
    }
    case 'simple':
      encodeHead(7, value.value, chunks);
      break;
    case 'false':
      chunks.push(new Uint8Array([0xf4]));
      break;
    case 'true':
      chunks.push(new Uint8Array([0xf5]));
      break;
    case 'null':
      chunks.push(new Uint8Array([0xf6]));
      break;
    case 'undefined':
      chunks.push(new Uint8Array([0xf7]));
      break;
  }
}

export function toDiagnosticNotation(value: CborValue, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  switch (value.type) {
    case 'uint':
      return String(value.value);
    case 'negint':
      return String(value.value);
    case 'bytes':
      return `h'${uint8ArrayToHex(value.value)}'`;
    case 'text':
      return `"${escapeString(value.value)}"`;
    case 'array': {
      if (value.value.length === 0) return value.indefinite ? '[_ ]' : '[]';
      const open = value.indefinite ? '[_ ' : '[ ';
      const close = value.indefinite ? '\n' + pad + ' _]' : '\n' + pad + ']';
      const items = value.value.map((v) => innerPad + toDiagnosticNotation(v, indent + 1));
      return open + '\n' + items.join(',\n') + close;
    }
    case 'map': {
      if (value.value.length === 0) return value.indefinite ? '{_ }' : '{}';
      const open = value.indefinite ? '{_ ' : '{ ';
      const close = value.indefinite ? '\n' + pad + ' _}' : '\n' + pad + '}';
      const entries = value.value.map(
        ([k, v]) =>
          innerPad +
          toDiagnosticNotation(k, indent + 1) +
          ': ' +
          toDiagnosticNotation(v, indent + 1)
      );
      return open + '\n' + entries.join(',\n') + close;
    }
    case 'tag': {
      const tagKey: CborValue = { type: 'text', value: '_tag' };
      const tagVal: CborValue = { type: 'uint', value: value.tag };
      const valKey: CborValue = { type: 'text', value: 'value' };
      const entries: [CborValue, CborValue][] = [
        [tagKey, tagVal],
        [valKey, value.value],
      ];
      const mapValue: CborValue = { type: 'map', value: entries };
      return toDiagnosticNotation(mapValue, indent);
    }
    case 'float': {
      if (Number.isNaN(value.value)) return 'NaN';
      if (value.value === Infinity) return 'Infinity';
      if (value.value === -Infinity) return '-Infinity';
      return String(value.value);
    }
    case 'simple':
      return `simple(${value.value})`;
    case 'false':
      return 'false';
    case 'true':
      return 'true';
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
  }
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}

export function toTreeNode(value: CborValue, label?: string): TreeNode {
  switch (value.type) {
    case 'uint':
      return { label: label ?? 'uint', type: 'uint', value: String(value.value) };
    case 'negint':
      return { label: label ?? 'negint', type: 'negint', value: String(value.value) };
    case 'bytes':
      return { label: label ?? (value.indefinite ? 'bytes*' : 'bytes'), type: 'bytes', value: `h'${uint8ArrayToHex(value.value)}'` };
    case 'text':
      return { label: label ?? (value.indefinite ? 'text*' : 'text'), type: 'text', value: `"${value.value}"` };
    case 'array':
      return {
        label: label ?? (value.indefinite ? `array*[_]` : `array[${value.value.length}]`),
        type: 'array',
        children: value.value.map((v, i) => toTreeNode(v, `[${i}]`)),
      };
    case 'map':
      return {
        label: label ?? (value.indefinite ? `map*{_}` : `map{${value.value.length}}`),
        type: 'map',
        children: value.value.map(([k, v], _i) => toTreeNode(v, toDiagnosticNotation(k, 0))),
      };
    case 'tag':
      return {
        label: label ?? `_tag=${value.tag}`,
        type: 'tag',
        children: [toTreeNode(value.value, 'value')],
      };
    case 'float':
      return { label: label ?? 'float', type: 'float', value: String(value.value) };
    case 'simple':
      return { label: label ?? 'simple', type: 'simple', value: String(value.value) };
    case 'false':
      return { label: label ?? 'simple', type: 'false', value: 'false' };
    case 'true':
      return { label: label ?? 'simple', type: 'true', value: 'true' };
    case 'null':
      return { label: label ?? 'simple', type: 'null', value: 'null' };
    case 'undefined':
      return { label: label ?? 'simple', type: 'undefined', value: 'undefined' };
  }
}

export function parseDiagnosticNotation(text: string): CborValue {
  const trimmed = text.trim();
  const result = parseValue(trimmed, 0);
  if (result.position < trimmed.length) {
    throw new Error(`Unexpected character at position ${result.position}: "${trimmed[result.position]}"`);
  }
  return result.value;
}

interface ParseResult {
  value: CborValue;
  position: number;
}

function parseValue(text: string, pos: number): ParseResult {
  pos = skipWhitespace(text, pos);
  if (pos >= text.length) throw new Error('Unexpected end of input');

  const ch = text[pos];

  if (ch === '[') return parseArray(text, pos);
  if (ch === '{') return parseMap(text, pos);
  if (ch === '"') return parseString(text, pos);
  if (ch === 'h' && pos + 1 < text.length && text[pos + 1] === "'") return parseBytes(text, pos);
  if (ch === 't' && text.substring(pos, pos + 4) === 'true') return { value: { type: 'true' }, position: pos + 4 };
  if (ch === 'f' && text.substring(pos, pos + 5) === 'false') return { value: { type: 'false' }, position: pos + 5 };
  if (ch === 'n' && text.substring(pos, pos + 4) === 'null') return { value: { type: 'null' }, position: pos + 4 };
  if (ch === 'u' && text.substring(pos, pos + 9) === 'undefined') return { value: { type: 'undefined' }, position: pos + 9 };
  if (ch === 'N' && text.substring(pos, pos + 3) === 'NaN') return { value: { type: 'float', value: NaN }, position: pos + 3 };
  if (ch === 'I' && text.substring(pos, pos + 8) === 'Infinity') return { value: { type: 'float', value: Infinity }, position: pos + 8 };
  if (ch === '-' && pos + 9 < text.length && text.substring(pos, pos + 9) === '-Infinity') return { value: { type: 'float', value: -Infinity }, position: pos + 9 };

  const tagMatch = text.substring(pos).match(/^(\d+)\(/);
  if (tagMatch) {
    const tagNum = parseInt(tagMatch[1], 10);
    const openParen = pos + tagMatch[0].length - 1;
    const contentResult = parseValue(text, openParen + 1);
    pos = skipWhitespace(text, contentResult.position);
    if (pos >= text.length || text[pos] !== ')') throw new Error('Expected closing ")" for tag');
    return { value: { type: 'tag', tag: tagNum, value: contentResult.value }, position: pos + 1 };
  }

  if (ch === 's' && text.substring(pos, pos + 6) === 'simple') {
    const parenPos = pos + 6;
    if (parenPos < text.length && text[parenPos] === '(') {
      const closePos = text.indexOf(')', parenPos);
      if (closePos === -1) throw new Error('Unclosed simple()');
      const num = parseInt(text.substring(parenPos + 1, closePos).trim(), 10);
      return { value: { type: 'simple', value: num }, position: closePos + 1 };
    }
  }

  return parseNumber(text, pos);
}

function parseArray(text: string, pos: number): ParseResult {
  const isIndefinite = pos + 1 < text.length && text[pos + 1] === '_';
  pos++;
  if (isIndefinite) pos++;
  const items: CborValue[] = [];
  pos = skipWhitespace(text, pos);
  if (pos < text.length && text[pos] === ']') {
    pos++;
    return { value: { type: 'array', value: items, indefinite: isIndefinite || undefined }, position: pos };
  }
  if (isIndefinite && pos < text.length && text[pos] === '_') {
    pos = skipWhitespace(text, pos + 1);
    if (pos < text.length && text[pos] === ']') {
      pos++;
      return { value: { type: 'array', value: items, indefinite: true }, position: pos };
    }
  }

  while (pos < text.length) {
    const result = parseValue(text, pos);
    items.push(result.value);
    pos = skipWhitespace(text, result.position);
    if (isIndefinite && pos < text.length && text[pos] === '_') {
      pos = skipWhitespace(text, pos + 1);
      if (pos < text.length && text[pos] === ']') {
        pos++;
        return { value: { type: 'array', value: items, indefinite: true }, position: pos };
      }
    }
    if (pos < text.length && text[pos] === ']') {
      pos++;
      return { value: { type: 'array', value: items, indefinite: isIndefinite || undefined }, position: pos };
    }
    if (pos < text.length && text[pos] === ',') {
      pos++;
      continue;
    }
    throw new Error(`Expected "," or "]" in array at position ${pos}`);
  }
  throw new Error('Unterminated array');
}

function parseMap(text: string, pos: number): ParseResult {
  const isIndefinite = pos + 1 < text.length && text[pos + 1] === '_';
  pos++;
  if (isIndefinite) pos++;
  const entries: [CborValue, CborValue][] = [];
  pos = skipWhitespace(text, pos);
  if (pos < text.length && text[pos] === '}') {
    pos++;
    return { value: { type: 'map', value: entries, indefinite: isIndefinite || undefined }, position: pos };
  }
  if (isIndefinite && pos < text.length && text[pos] === '_') {
    pos = skipWhitespace(text, pos + 1);
    if (pos < text.length && text[pos] === '}') {
      pos++;
      return { value: { type: 'map', value: entries, indefinite: true }, position: pos };
    }
  }

  while (pos < text.length) {
    const keyResult = parseValue(text, pos);
    pos = skipWhitespace(text, keyResult.position);
    if (pos >= text.length || text[pos] !== ':') throw new Error(`Expected ":" in map at position ${pos}`);
    pos++;
    const valResult = parseValue(text, pos);
    entries.push([keyResult.value, valResult.value]);
    pos = skipWhitespace(text, valResult.position);

    if (isIndefinite && pos < text.length && text[pos] === '_') {
      pos = skipWhitespace(text, pos + 1);
      if (pos < text.length && text[pos] === '}') {
        pos++;
        const tagResult = tryConvertTagMap(entries, isIndefinite);
        if (tagResult) return { value: tagResult, position: pos };
        return { value: { type: 'map', value: entries, indefinite: true }, position: pos };
      }
    }
    if (pos < text.length && text[pos] === '}') {
      pos++;
      const tagResult = tryConvertTagMap(entries, isIndefinite);
      if (tagResult) return { value: tagResult, position: pos };
      return { value: { type: 'map', value: entries, indefinite: isIndefinite || undefined }, position: pos };
    }
    if (pos < text.length && text[pos] === ',') {
      pos++;
      continue;
    }
    throw new Error(`Expected "," or "}" in map at position ${pos}`);
  }
  throw new Error('Unterminated map');
}

function tryConvertTagMap(entries: [CborValue, CborValue][], _isIndefinite: boolean): CborValue | null {
  if (entries.length !== 2) return null;
  const tagEntry = entries.find(([k]) => k.type === 'text' && k.value === '_tag');
  const valEntry = entries.find(([k]) => k.type === 'text' && k.value === 'value');
  if (!tagEntry || !valEntry) return null;
  const tagVal = tagEntry[1];
  if (tagVal.type !== 'uint' && tagVal.type !== 'negint') return null;
  if (typeof tagVal.value === 'bigint' && tagVal.value < 0n) return null;
  if (typeof tagVal.value === 'number' && tagVal.value < 0) return null;
  return { type: 'tag', tag: tagVal.value, value: valEntry[1] };
}

function parseString(text: string, pos: number): ParseResult {
  pos++;
  let result = '';
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === '"') return { value: { type: 'text', value: result }, position: pos + 1 };
    if (ch === '\\') {
      pos++;
      if (pos >= text.length) throw new Error('Unterminated string escape');
      const esc = text[pos];
      if (esc === 'n') result += '\n';
      else if (esc === 'r') result += '\r';
      else if (esc === 't') result += '\t';
      else if (esc === '\\') result += '\\';
      else if (esc === '"') result += '"';
      else result += esc;
    } else {
      result += ch;
    }
    pos++;
  }
  throw new Error('Unterminated string');
}

function parseBytes(text: string, pos: number): ParseResult {
  pos += 2;
  const closePos = text.indexOf("'", pos);
  if (closePos === -1) throw new Error("Unterminated byte string h'...");
  const hexContent = text.substring(pos, closePos).replace(/\s/g, '');
  const bytes = hexToUint8Array(hexContent);
  return { value: { type: 'bytes', value: bytes }, position: closePos + 1 };
}

function parseNumber(text: string, pos: number): ParseResult {
  let start = pos;
  let isNeg = false;
  if (text[pos] === '-') {
    isNeg = true;
    pos++;
  }
  const numStart = pos;
  while (pos < text.length && /[0-9]/.test(text[pos])) pos++;
  if (pos === numStart) throw new Error(`Expected number at position ${start}`);

  if (pos < text.length && (text[pos] === '.' || text[pos] === 'e' || text[pos] === 'E')) {
    while (pos < text.length && /[0-9.eE+\-]/.test(text[pos])) pos++;
    const numStr = text.substring(start, pos);
    const num = parseFloat(numStr);
    if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
    return { value: { type: 'float', value: num }, position: pos };
  }

  const intStr = text.substring(start, pos);
  if (intStr.length > 15) {
    const big = BigInt(intStr);
    if (isNeg) {
      return { value: { type: 'negint', value: big }, position: pos };
    }
    return { value: { type: 'uint', value: big }, position: pos };
  }
  const num = parseInt(intStr, 10);
  if (isNeg) {
    return { value: { type: 'negint', value: num }, position: pos };
  }
  return { value: { type: 'uint', value: num }, position: pos };
}

function skipWhitespace(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos])) pos++;
  return pos;
}

export const EXAMPLES: { name: string; hex: string; diagnostic: string }[] = [
  {
    name: 'Integer 42',
    hex: '182a',
    diagnostic: '42',
  },
  {
    name: 'Text "hello"',
    hex: '6568656c6c6f',
    diagnostic: '"hello"',
  },
  {
    name: 'Array [1, 2, 3]',
    hex: '83010203',
    diagnostic: '[ \n  1,\n  2,\n  3\n]',
  },
  {
    name: 'Map {1: "a", 2: "b"}',
    hex: 'a2016161026162',
    diagnostic: '{ \n  1: "a",\n  2: "b"\n}',
  },
  {
    name: 'Boolean & Null',
    hex: '84f4f5f6f7',
    diagnostic: '[ \n  false,\n  true,\n  null,\n  undefined\n]',
  },
  {
    name: 'Byte String',
    hex: '4401020304',
    diagnostic: "h'01020304'",
  },
  {
    name: 'Tagged Value (epoch)',
    hex: 'c11a514b67b0',
    diagnostic: '{ \n  "_tag": 1,\n  "value": 1363896240\n}',
  },
  {
    name: 'Indefinite Array',
    hex: '9f010203ff',
    diagnostic: '[_ \n  1,\n  2,\n  3\n _]',
  },
  {
    name: 'Indefinite Map',
    hex: 'bf6161016162ff',
    diagnostic: '{_ \n  "a": 1,\n  "b": 2\n _}',
  },
];

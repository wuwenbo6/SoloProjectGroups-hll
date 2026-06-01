import type { CborValue } from './cbor';

// ============================================================
// YAML 导出
// ============================================================

export function cborValueToYaml(value: CborValue, indent: number = 0): string {
  const pad = '  '.repeat(indent);

  switch (value.type) {
    case 'uint':
    case 'negint':
      return String(value.value);
    case 'float': {
      if (Number.isNaN(value.value)) return '.nan';
      if (value.value === Infinity) return '.inf';
      if (value.value === -Infinity) return '-.inf';
      return String(value.value);
    }
    case 'text':
      return yamlQuoteString(value.value);
    case 'bytes':
      return `!!binary ${uint8ArrayToBase64(value.value)}`;
    case 'true':
      return 'true';
    case 'false':
      return 'false';
    case 'null':
      return 'null';
    case 'undefined':
      return '~';
    case 'simple':
      return `!simple ${value.value}`;
    case 'tag': {
      const tagNum = typeof value.tag === 'bigint' ? value.tag.toString() : String(value.tag);
      const innerYaml = cborValueToYaml(value.value, indent);
      if (value.value.type === 'array' || value.value.type === 'map') {
        return `!tag:${tagNum}\n${pad}${innerYaml}`;
      }
      return `!tag:${tagNum} ${innerYaml}`;
    }
    case 'array': {
      if (value.value.length === 0) return '[]';
      const items: string[] = [];
      for (const item of value.value) {
        const childIndent = indent + 1;
        const childYaml = cborValueToYaml(item, childIndent);
        const childPad = '  '.repeat(childIndent);
        if (isMultiline(childYaml)) {
          items.push(`${childPad}-\n${childYaml}`);
        } else {
          items.push(`${childPad}- ${childYaml}`);
        }
      }
      return items.join('\n');
    }
    case 'map': {
      if (value.value.length === 0) return '{}';
      const entries: string[] = [];
      for (const [k, v] of value.value) {
        const keyStr = cborValueToYaml(k, 0);
        const childIndent = indent + 1;
        const childPad = '  '.repeat(childIndent);
        const valYaml = cborValueToYaml(v, childIndent);
        if (isMultiline(valYaml)) {
          entries.push(`${pad}${keyStr}:\n${valYaml}`);
        } else {
          entries.push(`${pad}${keyStr}: ${valYaml}`);
        }
      }
      return entries.join('\n');
    }
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function yamlQuoteString(s: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9_\-]*$/.test(s)) return s;
  if (s.includes('\n')) {
    return `|\n${s.split('\n').map((line) => '  ' + line).join('\n')}`;
  }
  if (s.includes('"') || s.includes("'") || s.includes(':') || s.includes('#')) {
    return `'${s.replace(/'/g, "''")}'`;
  }
  return `'${s}'`;
}

function isMultiline(s: string): boolean {
  return s.includes('\n');
}

// ============================================================
// CDDL 解析器和验证器
// ============================================================

export interface CDDLRule {
  name: string;
  type: CDDLType;
}

export type CDDLType =
  | { kind: 'uint' }
  | { kind: 'nint' }
  | { kind: 'int' }
  | { kind: 'float' }
  | { kind: 'float16' }
  | { kind: 'float32' }
  | { kind: 'float64' }
  | { kind: 'text' }
  | { kind: 'bytes' }
  | { kind: 'bool' }
  | { kind: 'true' }
  | { kind: 'false' }
  | { kind: 'null' }
  | { kind: 'undefined' }
  | { kind: 'any' }
  | { kind: 'literal'; value: CborValue }
  | { kind: 'ref'; name: string }
  | { kind: 'group'; entries: CDDLEntry[] }
  | { kind: 'array'; type: CDDLType; size?: CDDLSize }
  | { kind: 'map'; entries: CDDLEntry[] }
  | { kind: 'choice'; options: CDDLType[] }
  | { kind: 'range'; from: number | bigint; to: number | bigint }
  | { kind: 'tag'; tag: number | bigint; inner: CDDLType }
  | { kind: 'size'; inner: CDDLType; size: CDDLSize };

export interface CDDLSize {
  min?: number | bigint;
  max?: number | bigint;
}

export interface CDDLEntry {
  key?: CDDLType;
  type: CDDLType;
  optional?: boolean;
  occurrence?: '?' | '*' | '+' | string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface CDDLContext {
  rules: Map<string, CDDLType>;
  errors: ValidationError[];
}

// ============================================================
// CDDL 解析器
// ============================================================

class CDDLParser {
  private text: string;
  private pos: number;

  constructor(text: string) {
    this.text = text;
    this.pos = 0;
  }

  parse(): Map<string, CDDLType> {
    const rules = new Map<string, CDDLType>();
    this.skipWhitespaceAndComments();
    while (this.pos < this.text.length) {
      const rule = this.parseRule();
      rules.set(rule.name, rule.type);
      this.skipWhitespaceAndComments();
    }
    return rules;
  }

  private parseRule(): CDDLRule {
    const name = this.parseIdentifier();
    this.skipWhitespaceAndComments();
    this.consume('=');
    this.skipWhitespaceAndComments();
    const type = this.parseType();
    return { name, type };
  }

  private parseIdentifier(): string {
    const start = this.pos;
    if (!this.isIdentStart(this.peek())) {
      throw new Error(`Expected identifier at position ${this.pos}`);
    }
    this.pos++;
    while (this.pos < this.text.length && this.isIdentCont(this.peek())) {
      this.pos++;
    }
    return this.text.substring(start, this.pos);
  }

  private isIdentStart(c: string): boolean {
    return /[a-zA-Z_@]/.test(c);
  }

  private isIdentCont(c: string): boolean {
    return /[a-zA-Z0-9_\-@$.]/.test(c);
  }

  private parseType(): CDDLType {
    return this.parseChoice();
  }

  private parseChoice(): CDDLType {
    const options: CDDLType[] = [this.parseRange()];
    this.skipWhitespaceAndComments();
    while (this.peek() === '/') {
      this.consume('/');
      this.skipWhitespaceAndComments();
      options.push(this.parseRange());
      this.skipWhitespaceAndComments();
    }
    return options.length === 1 ? options[0] : { kind: 'choice', options };
  }

  private parseRange(): CDDLType {
    const left = this.parsePrimary();
    this.skipWhitespaceAndComments();
    if (this.peek() === '.' && this.text[this.pos + 1] === '.') {
      this.pos += 2;
      this.skipWhitespaceAndComments();
      const right = this.parsePrimary();
      const from = this.typeToNumber(left);
      const to = this.typeToNumber(right);
      return { kind: 'range', from, to };
    }
    return left;
  }

  private typeToNumber(t: CDDLType): number | bigint {
    if (t.kind === 'literal') {
      if (t.value.type === 'uint' || t.value.type === 'negint') {
        return t.value.value;
      }
    }
    throw new Error('Expected number in range');
  }

  private parsePrimary(): CDDLType {
    this.skipWhitespaceAndComments();
    const ch = this.peek();

    if (ch === '#') {
      return this.parseSizeOperator();
    }
    if (ch === '$' || ch === '&') {
      this.consume(ch);
      return this.parseType();
    }
    if (ch === '"') {
      return { kind: 'literal', value: this.parseTextLiteral() };
    }
    if (ch === "'") {
      return { kind: 'literal', value: this.parseBytesLiteral() };
    }
    if (ch === 'h' && this.text[this.pos + 1] === "'") {
      this.pos += 2;
      return { kind: 'literal', value: this.parseBytesLiteral() };
    }
    if (ch === '-' || /[0-9]/.test(ch)) {
      return { kind: 'literal', value: this.parseNumberLiteral() };
    }
    if (ch === '(') {
      return this.parseGroup();
    }
    if (ch === '[') {
      return this.parseArrayType();
    }
    if (ch === '{') {
      return this.parseMapType();
    }
    if (ch === '~') {
      this.consume('~');
      return { kind: 'undefined' };
    }

    const id = this.parseIdentifier();
    const upper = id.toLowerCase();

    if (upper === 'uint') return { kind: 'uint' };
    if (upper === 'nint') return { kind: 'nint' };
    if (upper === 'int') return { kind: 'int' };
    if (upper === 'float' || upper === 'float64') return { kind: 'float' };
    if (upper === 'float16') return { kind: 'float16' };
    if (upper === 'float32') return { kind: 'float32' };
    if (upper === 'bstr' || upper === 'bytes') return { kind: 'bytes' };
    if (upper === 'tstr' || upper === 'text') return { kind: 'text' };
    if (upper === 'bool') return { kind: 'bool' };
    if (upper === 'true') return { kind: 'true' };
    if (upper === 'false') return { kind: 'false' };
    if (upper === 'null' || upper === 'nil') return { kind: 'null' };
    if (upper === 'undefined') return { kind: 'undefined' };
    if (upper === 'any' || upper === '*') return { kind: 'any' };

    this.skipWhitespaceAndComments();
    if (this.peek() === '(') {
      this.consume('(');
      const inner = this.parseType();
      this.skipWhitespaceAndComments();
      this.consume(')');
      const tagNum = this.parseTagNumber(id);
      return { kind: 'tag', tag: tagNum, inner };
    }

    return { kind: 'ref', name: id };
  }

  private parseTagNumber(name: string): number | bigint {
    const tagMap: Record<string, number> = {
      'epoch': 1,
      'timestamp': 1,
      'bignum': 2,
      'negbignum': 3,
      'decfrac': 4,
      'bigfloat': 5,
      'base64url': 21,
      'base64': 22,
      'base16': 23,
      'encoded-cbor': 24,
      'uri': 32,
      'base64url-uri': 33,
      'mime': 36,
      'geojson': 38,
      'cbor': 63,
    };
    if (tagMap[name.toLowerCase()] !== undefined) {
      return tagMap[name.toLowerCase()];
    }
    const num = parseInt(name, 10);
    if (!isNaN(num)) return num;
    throw new Error(`Unknown tag type: ${name}`);
  }

  private parseSizeOperator(): CDDLType {
    this.consume('#');
    if (this.peek() === '(') {
      this.consume('(');
      this.skipWhitespaceAndComments();
      if (this.peek() === '6' || this.peek() === '#') {
        this.pos++;
        this.skipWhitespaceAndComments();
        this.consume(')');
        this.skipWhitespaceAndComments();
        const inner = this.parsePrimary();
        return { kind: 'size', inner, size: {} };
      }
      const size = this.parseSize();
      this.skipWhitespaceAndComments();
      this.consume(')');
      this.skipWhitespaceAndComments();
      const inner = this.parsePrimary();
      return { kind: 'size', inner, size };
    }
    const inner = this.parsePrimary();
    return { kind: 'size', inner, size: {} };
  }

  private parseSize(): CDDLSize {
    const size: CDDLSize = {};
    this.skipWhitespaceAndComments();
    if (this.peek() === '*') {
      this.consume('*');
      this.skipWhitespaceAndComments();
      if (/[0-9]/.test(this.peek())) {
        size.max = this.parseRawNumber();
      }
      return size;
    }
    const left = this.parseRawNumber();
    this.skipWhitespaceAndComments();
    if (this.peek() === '.' && this.text[this.pos + 1] === '.') {
      this.pos += 2;
      this.skipWhitespaceAndComments();
      size.min = left;
      if (/[0-9]/.test(this.peek())) {
        size.max = this.parseRawNumber();
      }
      return size;
    }
    size.min = left;
    size.max = left;
    return size;
  }

  private parseRawNumber(): number | bigint {
    const start = this.pos;
    let isNeg = false;
    if (this.peek() === '-') {
      isNeg = true;
      this.pos++;
    }
    while (this.pos < this.text.length && /[0-9]/.test(this.peek())) {
      this.pos++;
    }
    const numStr = this.text.substring(start, this.pos);
    if (numStr.length > 15) {
      return isNeg ? BigInt(numStr) : BigInt(numStr);
    }
    return isNeg ? parseInt(numStr, 10) : parseInt(numStr, 10);
  }

  private parseTextLiteral(): CborValue {
    this.consume('"');
    let result = '';
    while (this.pos < this.text.length && this.peek() !== '"') {
      if (this.peek() === '\\') {
        this.pos++;
        const esc = this.peek();
        if (esc === 'n') result += '\n';
        else if (esc === 'r') result += '\r';
        else if (esc === 't') result += '\t';
        else if (esc === '\\') result += '\\';
        else if (esc === '"') result += '"';
        else result += esc;
        this.pos++;
      } else {
        result += this.peek();
        this.pos++;
      }
    }
    this.consume('"');
    return { type: 'text', value: result };
  }

  private parseBytesLiteral(): CborValue {
    const start = this.pos;
    while (this.pos < this.text.length && this.peek() !== "'") {
      this.pos++;
    }
    const hex = this.text.substring(start, this.pos).replace(/[^0-9a-fA-F]/g, '');
    this.consume("'");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return { type: 'bytes', value: bytes };
  }

  private parseNumberLiteral(): CborValue {
    const start = this.pos;
    let isNeg = false;
    if (this.peek() === '-') {
      isNeg = true;
      this.pos++;
    }
    const numStart = this.pos;
    while (this.pos < this.text.length && /[0-9]/.test(this.peek())) {
      this.pos++;
    }
    if (this.pos < this.text.length && (this.peek() === '.' || this.peek() === 'e' || this.peek() === 'E')) {
      while (this.pos < this.text.length && /[0-9.eE+\-]/.test(this.peek())) {
        this.pos++;
      }
      const numStr = this.text.substring(start, this.pos);
      return { type: 'float', value: parseFloat(numStr) };
    }
    const numStr = this.text.substring(start, this.pos);
    if (numStr.length > 15) {
      const big = BigInt(numStr);
      return isNeg ? { type: 'negint', value: big } : { type: 'uint', value: big };
    }
    const num = parseInt(numStr, 10);
    return isNeg ? { type: 'negint', value: num } : { type: 'uint', value: num };
  }

  private parseGroup(): CDDLType {
    this.consume('(');
    this.skipWhitespaceAndComments();
    const entries = this.parseEntries();
    this.skipWhitespaceAndComments();
    this.consume(')');
    return { kind: 'group', entries };
  }

  private parseArrayType(): CDDLType {
    this.consume('[');
    this.skipWhitespaceAndComments();
    if (this.peek() === ']') {
      this.consume(']');
      return { kind: 'array', type: { kind: 'any' } };
    }
    if (this.peek() === '+' || this.peek() === '*' || this.peek() === '?') {
      const occ = this.peek();
      this.consume(occ);
      this.skipWhitespaceAndComments();
      const inner = this.parseType();
      this.skipWhitespaceAndComments();
      this.consume(']');
      const size: CDDLSize = occ === '?' ? { min: 0, max: 1 } : occ === '*' ? { min: 0 } : { min: 1 };
      return { kind: 'array', type: inner, size };
    }
    const inner = this.parseType();
    this.skipWhitespaceAndComments();
    this.consume(']');
    return { kind: 'array', type: inner };
  }

  private parseMapType(): CDDLType {
    this.consume('{');
    this.skipWhitespaceAndComments();
    if (this.peek() === '}') {
      this.consume('}');
      return { kind: 'map', entries: [] };
    }
    const entries = this.parseEntries();
    this.skipWhitespaceAndComments();
    this.consume('}');
    return { kind: 'map', entries };
  }

  private parseEntries(): CDDLEntry[] {
    const entries: CDDLEntry[] = [];
    this.skipWhitespaceAndComments();
    do {
      const entry = this.parseEntry();
      entries.push(entry);
      this.skipWhitespaceAndComments();
      if (this.peek() === ',') {
        this.consume(',');
        this.skipWhitespaceAndComments();
      } else {
        break;
      }
    } while (this.pos < this.text.length);
    return entries;
  }

  private parseEntry(): CDDLEntry {
    this.skipWhitespaceAndComments();
    let occurrence: '?' | '*' | '+' | string | undefined;
    if (this.peek() === '?' || this.peek() === '*' || this.peek() === '+') {
      occurrence = this.peek() as '?' | '*' | '+';
      this.consume(occurrence);
      this.skipWhitespaceAndComments();
    }

    let key: CDDLType | undefined;
    let type: CDDLType;
    let optional = false;

    const lookAhead = this.pos;
    const possibleKey = this.parseType();
    this.skipWhitespaceAndComments();
    if (this.peek() === ':') {
      this.consume(':');
      this.skipWhitespaceAndComments();
      key = possibleKey;
      type = this.parseType();
    } else {
      this.pos = lookAhead;
      type = this.parseType();
    }

    if (occurrence === '?') optional = true;

    return { key, type, optional, occurrence };
  }

  private peek(): string {
    return this.text[this.pos] || '';
  }

  private consume(expected: string): void {
    if (this.peek() !== expected) {
      throw new Error(`Expected "${expected}" at position ${this.pos}, got "${this.peek()}"`);
    }
    this.pos++;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.text.length) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.pos++;
      } else if (c === ';') {
        while (this.pos < this.text.length && this.peek() !== '\n') {
          this.pos++;
        }
      } else {
        break;
      }
    }
  }
}

export function parseCDDL(cddlText: string): Map<string, CDDLType> {
  const parser = new CDDLParser(cddlText);
  return parser.parse();
}

// ============================================================
// CDDL 验证器
// ============================================================

export function validateCborAgainstCDDL(
  value: CborValue,
  cddlText: string,
  rootRule?: string
): ValidationResult {
  const ctx: CDDLContext = {
    rules: new Map(),
    errors: [],
  };

  try {
    ctx.rules = parseCDDL(cddlText);
  } catch (err) {
    return {
      valid: false,
      errors: [{ path: '/', message: err instanceof Error ? err.message : 'CDDL parse error' }],
    };
  }

  if (ctx.rules.size === 0) {
    return { valid: true, errors: [] };
  }

  let rootType: CDDLType;
  if (rootRule) {
    const found = ctx.rules.get(rootRule);
    if (!found) {
      return { valid: false, errors: [{ path: '/', message: `Root rule "${rootRule}" not found` }] };
    }
    rootType = found;
  } else {
    rootType = Array.from(ctx.rules.values())[0];
  }

  validateType(value, rootType, ctx, '/');

  return {
    valid: ctx.errors.length === 0,
    errors: ctx.errors,
  };
}

function validateType(
  value: CborValue,
  type: CDDLType,
  ctx: CDDLContext,
  path: string
): void {
  switch (type.kind) {
    case 'any':
      return;
    case 'uint':
      if (value.type !== 'uint') {
        ctx.errors.push({ path, message: `Expected uint, got ${value.type}` });
      }
      return;
    case 'nint':
      if (value.type !== 'negint') {
        ctx.errors.push({ path, message: `Expected nint, got ${value.type}` });
      }
      return;
    case 'int':
      if (value.type !== 'uint' && value.type !== 'negint') {
        ctx.errors.push({ path, message: `Expected int, got ${value.type}` });
      }
      return;
    case 'float':
    case 'float16':
    case 'float32':
    case 'float64':
      if (value.type !== 'float' && value.type !== 'uint' && value.type !== 'negint') {
        ctx.errors.push({ path, message: `Expected float, got ${value.type}` });
      }
      return;
    case 'text':
      if (value.type !== 'text') {
        ctx.errors.push({ path, message: `Expected text string, got ${value.type}` });
      }
      return;
    case 'bytes':
      if (value.type !== 'bytes') {
        ctx.errors.push({ path, message: `Expected byte string, got ${value.type}` });
      }
      return;
    case 'bool':
      if (value.type !== 'true' && value.type !== 'false') {
        ctx.errors.push({ path, message: `Expected boolean, got ${value.type}` });
      }
      return;
    case 'true':
      if (value.type !== 'true') {
        ctx.errors.push({ path, message: `Expected true, got ${value.type}` });
      }
      return;
    case 'false':
      if (value.type !== 'false') {
        ctx.errors.push({ path, message: `Expected false, got ${value.type}` });
      }
      return;
    case 'null':
      if (value.type !== 'null') {
        ctx.errors.push({ path, message: `Expected null, got ${value.type}` });
      }
      return;
    case 'undefined':
      if (value.type !== 'undefined') {
        ctx.errors.push({ path, message: `Expected undefined, got ${value.type}` });
      }
      return;
    case 'literal':
      validateLiteral(value, type.value, ctx, path);
      return;
    case 'ref': {
      const refType = ctx.rules.get(type.name);
      if (!refType) {
        ctx.errors.push({ path, message: `Undefined type reference: ${type.name}` });
        return;
      }
      validateType(value, refType, ctx, path);
      return;
    }
    case 'group':
      for (const entry of type.entries) {
        validateEntry(value, entry, ctx, path);
      }
      return;
    case 'array':
      validateArray(value, type, ctx, path);
      return;
    case 'map':
      validateMap(value, type, ctx, path);
      return;
    case 'choice':
      validateChoice(value, type, ctx, path);
      return;
    case 'range':
      validateRange(value, type, ctx, path);
      return;
    case 'tag':
      validateTag(value, type, ctx, path);
      return;
    case 'size':
      validateSize(value, type, ctx, path);
      return;
  }
}

function validateLiteral(
  value: CborValue,
  expected: CborValue,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type !== expected.type) {
    ctx.errors.push({ path, message: `Expected ${expected.type}, got ${value.type}` });
    return;
  }
  switch (value.type) {
    case 'uint':
    case 'negint':
      if (value.value !== (expected as typeof value).value) {
        ctx.errors.push({ path, message: `Expected ${(expected as typeof value).value}, got ${value.value}` });
      }
      return;
    case 'float':
      if (value.value !== (expected as typeof value).value) {
        ctx.errors.push({ path, message: `Expected ${(expected as typeof value).value}, got ${value.value}` });
      }
      return;
    case 'text':
      if (value.value !== (expected as typeof value).value) {
        ctx.errors.push({ path, message: `Expected "${(expected as typeof value).value}", got "${value.value}"` });
      }
      return;
    case 'bytes':
      if (!bytesEqual(value.value, (expected as typeof value).value)) {
        ctx.errors.push({ path, message: `Byte strings do not match` });
      }
      return;
  }
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function validateEntry(
  value: CborValue,
  entry: CDDLEntry,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type === 'map') {
    const mapEntries = value.value;
    let found = false;
    for (const [mapKey, mapVal] of mapEntries) {
      if (entry.key) {
        const keyMatches = checkKeyMatches(mapKey, entry.key, ctx);
        if (keyMatches) {
          const keyPath = entry.key.kind === 'literal' && entry.key.value.type === 'text'
            ? `${path}.${entry.key.value.value}`
            : `${path}[${toDiagnosticNotation(mapKey, 0)}]`;
          validateType(mapVal, entry.type, ctx, keyPath);
          found = true;
          if (!entry.occurrence || entry.occurrence === '?') break;
        }
      } else {
        validateType(mapVal, entry.type, ctx, path);
        found = true;
      }
    }
    if (!found && !entry.optional && entry.occurrence !== '?' && entry.occurrence !== '*') {
      const keyDesc = entry.key ? describeType(entry.key) : '<implicit>';
      ctx.errors.push({ path, message: `Missing required entry: ${keyDesc}` });
    }
  } else if (value.type === 'array') {
    for (let i = 0; i < value.value.length; i++) {
      validateType(value.value[i], entry.type, ctx, `${path}[${i}]`);
    }
  }
}

function validateArray(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'array' }>,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type !== 'array') {
    ctx.errors.push({ path, message: `Expected array, got ${value.type}` });
    return;
  }

  if (type.size) {
    const len = value.value.length;
    if (type.size.min !== undefined) {
      const min = typeof type.size.min === 'bigint' ? Number(type.size.min) : type.size.min;
      if (len < min) {
        ctx.errors.push({ path, message: `Array too short: expected >= ${min}, got ${len}` });
      }
    }
    if (type.size.max !== undefined) {
      const max = typeof type.size.max === 'bigint' ? Number(type.size.max) : type.size.max;
      if (len > max) {
        ctx.errors.push({ path, message: `Array too long: expected <= ${max}, got ${len}` });
      }
    }
  }

  for (let i = 0; i < value.value.length; i++) {
    validateType(value.value[i], type.type, ctx, `${path}[${i}]`);
  }
}

function validateMap(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'map' }>,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type !== 'map') {
    ctx.errors.push({ path, message: `Expected map, got ${value.type}` });
    return;
  }

  const mapEntries = value.value;
  const matchedEntries = new Set<number>();

  for (const entry of type.entries) {
    let matched = false;
    for (let i = 0; i < mapEntries.length; i++) {
      if (matchedEntries.has(i)) continue;
      const [mapKey, mapVal] = mapEntries[i];

      let keyMatches = true;
      if (entry.key) {
        keyMatches = checkKeyMatches(mapKey, entry.key, ctx);
      }

      if (keyMatches) {
        const keyPath = entry.key && entry.key.kind === 'literal' && entry.key.value.type === 'text'
          ? `${path}.${entry.key.value.value}`
          : `${path}[${toDiagnosticNotation(mapKey, 0)}]`;
        validateType(mapVal, entry.type, ctx, keyPath);
        matchedEntries.add(i);
        matched = true;
        if (!entry.occurrence || entry.occurrence === '?') break;
      }
    }

    if (!matched && !entry.optional && entry.occurrence !== '?' && entry.occurrence !== '*') {
      const keyDesc = entry.key ? describeType(entry.key) : '<implicit>';
      ctx.errors.push({ path, message: `Missing required map entry: ${keyDesc}` });
    }
  }
}

function checkKeyMatches(key: CborValue, expected: CDDLType, ctx: CDDLContext): boolean {
  const errorsBefore = ctx.errors.length;
  validateType(key, expected, ctx, '');
  const matches = ctx.errors.length === errorsBefore;
  if (!matches) {
    ctx.errors.splice(errorsBefore);
  }
  return matches;
}

function describeType(type: CDDLType): string {
  switch (type.kind) {
    case 'literal':
      return toDiagnosticNotation(type.value, 0);
    case 'ref':
      return type.name;
    case 'uint':
      return 'uint';
    case 'text':
      return 'tstr';
    default:
      return type.kind;
  }
}

function validateChoice(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'choice' }>,
  ctx: CDDLContext,
  path: string
): void {
  const errorsBefore = ctx.errors.length;
  for (const option of type.options) {
    const optionErrors = ctx.errors.length;
    validateType(value, option, ctx, path);
    if (ctx.errors.length === optionErrors) {
      return;
    }
    ctx.errors.splice(optionErrors);
  }
  if (ctx.errors.length === errorsBefore) {
    ctx.errors.push({ path, message: `Value does not match any alternative in union type` });
  }
}

function validateRange(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'range' }>,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type !== 'uint' && value.type !== 'negint' && value.type !== 'float') {
    ctx.errors.push({ path, message: `Expected number, got ${value.type}` });
    return;
  }
  const v = typeof value.value === 'bigint' ? Number(value.value) : value.value;
  const from = typeof type.from === 'bigint' ? Number(type.from) : type.from;
  const to = typeof type.to === 'bigint' ? Number(type.to) : type.to;
  if (v < from || v > to) {
    ctx.errors.push({ path, message: `Value ${v} out of range ${from}..${to}` });
  }
}

function validateTag(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'tag' }>,
  ctx: CDDLContext,
  path: string
): void {
  if (value.type !== 'tag') {
    ctx.errors.push({ path, message: `Expected tag, got ${value.type}` });
    return;
  }
  const expectedTag = typeof type.tag === 'bigint' ? type.tag : BigInt(type.tag);
  const actualTag = typeof value.tag === 'bigint' ? value.tag : BigInt(value.tag);
  if (expectedTag !== actualTag) {
    ctx.errors.push({ path, message: `Expected tag ${expectedTag}, got ${actualTag}` });
    return;
  }
  validateType(value.value, type.inner, ctx, `${path}@${type.tag}`);
}

function validateSize(
  value: CborValue,
  type: Extract<CDDLType, { kind: 'size' }>,
  ctx: CDDLContext,
  path: string
): void {
  validateType(value, type.inner, ctx, path);

  let size: number;
  switch (value.type) {
    case 'text':
      size = value.value.length;
      break;
    case 'bytes':
      size = value.value.length;
      break;
    case 'array':
      size = value.value.length;
      break;
    case 'map':
      size = value.value.length;
      break;
    default:
      ctx.errors.push({ path, message: `Cannot get size of ${value.type}` });
      return;
  }

  if (type.size.min !== undefined) {
    const min = typeof type.size.min === 'bigint' ? Number(type.size.min) : type.size.min;
    if (size < min) {
      ctx.errors.push({ path, message: `Size too small: expected >= ${min}, got ${size}` });
    }
  }
  if (type.size.max !== undefined) {
    const max = typeof type.size.max === 'bigint' ? Number(type.size.max) : type.size.max;
    if (size > max) {
      ctx.errors.push({ path, message: `Size too large: expected <= ${max}, got ${size}` });
    }
  }
}

function toDiagnosticNotation(value: CborValue, indent: number = 0): string {
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  switch (value.type) {
    case 'uint':
    case 'negint':
      return String(value.value);
    case 'bytes': {
      const hex = Array.from(value.value)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `h'${hex}'`;
    }
    case 'text':
      return `"${value.value.replace(/"/g, '\\"')}"`;
    case 'array': {
      if (value.value.length === 0) return '[]';
      const items = value.value.map((v) => innerPad + toDiagnosticNotation(v, indent + 1));
      return '[\n' + items.join(',\n') + '\n' + pad + ']';
    }
    case 'map': {
      if (value.value.length === 0) return '{}';
      const entries = value.value.map(
        ([k, v]) =>
          innerPad +
          toDiagnosticNotation(k, indent + 1) +
          ': ' +
          toDiagnosticNotation(v, indent + 1)
      );
      return '{\n' + entries.join(',\n') + '\n' + pad + '}';
    }
    case 'tag':
      return `${value.tag}(${toDiagnosticNotation(value.value, indent)})`;
    case 'float':
      return String(value.value);
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

// ============================================================
// CDDL 示例
// ============================================================

export const CDDL_EXAMPLES: { name: string; cddl: string; description: string }[] = [
  {
    name: 'Simple Object',
    description: '包含name和age的简单对象',
    cddl: `; Simple Person Object
person = {
  name: text,
  age: uint
}`,
  },
  {
    name: 'Nested Structure',
    description: '包含嵌套数组和映射的复杂结构',
    cddl: `; Complex Nested Structure
config = {
  version: uint,
  enabled: bool,
  tags: [* text],
  settings: {
    ? timeout: uint,
    ? retries: 1..5
  }
}`,
  },
  {
    name: 'Tagged Epoch Time',
    description: '使用标签1的时间戳',
    cddl: `; Tagged Epoch Time
timestamp = #6.1(uint)

event = {
  id: text,
  time: timestamp,
  payload: bytes
}`,
  },
  {
    name: 'Array with Size',
    description: '带大小限制的数组',
    cddl: `; Array with Size Constraints
coords = [#(2) float]
point3d = [#(3..3) float]
varray = [* [2 float]]
`,
  },
];

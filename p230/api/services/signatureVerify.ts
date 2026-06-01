import * as crypto from 'crypto';
import { DNSKEYRecord, RRSIGRecord, DNSRecord, NSECRecord, NSEC3Record } from '../../shared/types';
import {
  getNodeSigningAlgorithm,
  buildSignedData,
  canonicalizeRRSet,
  domainToWire,
  parseTypeBitmaps,
  isDomainInNSECRange,
  calculateNSEC3Hash,
  isHashInNSEC3Range,
  encodeBase32Hex,
} from '../utils/dnsUtils';

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  details?: string;
}

export interface RRRecord {
  name: string;
  type: number;
  ttl: number;
  rdata: Buffer;
}

export function verifyRRSIG(
  rrsig: RRSIGRecord,
  records: DNSRecord[],
  dnskey: DNSKEYRecord
): VerifyResult {
  try {
    const hashAlgorithm = getNodeSigningAlgorithm(rrsig.algorithm);

    if (!hashAlgorithm) {
      return {
        valid: false,
        reason: `Unsupported algorithm: ${rrsig.algorithm}`,
      };
    }

    const rrRecords: RRRecord[] = records.map(r => ({
      name: r.name,
      type: recordTypeToNumber(r.type),
      ttl: r.ttl,
      rdata: recordDataToBuffer(r),
    }));

    const canonicalized = canonicalizeRRSet(
      rrRecords,
      recordTypeToNumber(rrsig.typeCovered),
      rrsig.originalTTL
    );

    const signedData = buildSignedData(
      {
        typeCovered: recordTypeToNumber(rrsig.typeCovered),
        algorithm: rrsig.algorithm,
        labels: rrsig.labels,
        originalTTL: rrsig.originalTTL,
        signatureExpiration: rrsig.signatureExpiration,
        signatureInception: rrsig.signatureInception,
        keyTag: rrsig.keyTag,
        signerName: rrsig.signerName,
      },
      canonicalized
    );

    const signature = Buffer.from(rrsig.signature, 'base64');
    const publicKey = Buffer.from(dnskey.publicKey, 'base64');

    let isValid = false;

    switch (rrsig.algorithm) {
      case 5:
      case 7:
      case 8:
      case 10: {
        const pemKey = buildRSAKey(publicKey);
        const verifier = crypto.createVerify(hashAlgorithm);
        verifier.update(signedData);
        isValid = verifier.verify(pemKey, signature);
        break;
      }

      case 13:
      case 14: {
        const pemKey = buildECKey(publicKey, rrsig.algorithm);
        const derSignature = ecdsaSigToDER(signature, rrsig.algorithm);
        const verifier = crypto.createVerify(hashAlgorithm);
        verifier.update(signedData);
        isValid = verifier.verify(pemKey, derSignature);
        break;
      }

      case 15: {
        isValid = verifyED25519(publicKey, signedData, signature);
        break;
      }

      default:
        return {
          valid: false,
          reason: `Algorithm ${rrsig.algorithm} not implemented for verification`,
        };
    }

    if (!isValid) {
      return {
        valid: false,
        reason: 'Signature verification failed',
        details: 'The cryptographic signature does not match the expected value',
      };
    }

    return {
      valid: true,
    };
  } catch (e) {
    return {
      valid: false,
      reason: 'Verification error',
      details: e instanceof Error ? e.message : String(e),
    };
  }
}

function recordTypeToNumber(type: string): number {
  const types: Record<string, number> = {
    A: 1,
    NS: 2,
    CNAME: 5,
    SOA: 6,
    PTR: 12,
    MX: 15,
    TXT: 16,
    AAAA: 28,
    SRV: 33,
    DS: 43,
    SSHFP: 44,
    RRSIG: 46,
    NSEC: 47,
    DNSKEY: 48,
    NSEC3: 50,
    TLSA: 52,
    CDS: 59,
    CDNSKEY: 60,
  };
  return types[type] || 0;
}

export function recordDataToBuffer(record: DNSRecord): Buffer {
  switch (record.type) {
    case 'A':
      return ipv4ToBuffer(record.data);
    case 'AAAA':
      return ipv6ToBuffer(record.data);
    case 'NS':
    case 'CNAME':
      return domainToWire(record.data);
    case 'TXT':
      const txtBuffer = Buffer.from(record.data);
      const txtBuffers: Buffer[] = [];
      const chunkSize = 255;
      for (let i = 0; i < txtBuffer.length; i += chunkSize) {
        const chunk = txtBuffer.slice(i, i + chunkSize);
        const len = Buffer.alloc(1);
        len.writeUInt8(chunk.length, 0);
        txtBuffers.push(len);
        txtBuffers.push(chunk);
      }
      return Buffer.concat(txtBuffers);
    case 'DNSKEY': {
      const parts = record.data.split(' ');
      const flags = parseInt(parts[0], 10);
      const protocol = parseInt(parts[1], 10);
      const algorithm = parseInt(parts[2], 10);
      const publicKey = Buffer.from(parts[3], 'base64');
      const header = Buffer.alloc(4);
      header.writeUInt16BE(flags, 0);
      header.writeUInt8(protocol, 2);
      header.writeUInt8(algorithm, 3);
      return Buffer.concat([header, publicKey]);
    }
    case 'DS': {
      const parts = record.data.split(' ');
      const keyTag = parseInt(parts[0], 10);
      const algorithm = parseInt(parts[1], 10);
      const digestType = parseInt(parts[2], 10);
      const digest = Buffer.from(parts[3], 'hex');
      const header = Buffer.alloc(4);
      header.writeUInt16BE(keyTag, 0);
      header.writeUInt8(algorithm, 2);
      header.writeUInt8(digestType, 3);
      return Buffer.concat([header, digest]);
    }
    case 'NSEC': {
      const nsecRecord = record as NSECRecord;
      const nextDomainWire = domainToWire(nsecRecord.nextDomain);
      const bitmapBuffer = buildTypeBitmap(nsecRecord.typeBitmaps);
      return Buffer.concat([nextDomainWire, bitmapBuffer]);
    }
    case 'NSEC3': {
      const nsec3Record = record as NSEC3Record;
      const header = Buffer.alloc(6);
      header.writeUInt8(nsec3Record.hashAlgorithm, 0);
      header.writeUInt8(nsec3Record.flags, 1);
      header.writeUInt16BE(nsec3Record.iterations, 2);
      const saltBuffer = Buffer.from(nsec3Record.salt, 'hex');
      const saltLen = Buffer.alloc(1);
      saltLen.writeUInt8(saltBuffer.length, 0);
      const nextHashBuffer = Buffer.from(nsec3Record.nextHashedOwnerName, 'base64');
      const hashLen = Buffer.alloc(1);
      hashLen.writeUInt8(nextHashBuffer.length, 0);
      const bitmapBuffer = buildTypeBitmap(nsec3Record.typeBitmaps);
      return Buffer.concat([header, saltLen, saltBuffer, hashLen, nextHashBuffer, bitmapBuffer]);
    }
    default:
      return Buffer.from(record.data);
  }
}

export function buildTypeBitmap(types: number[]): Buffer {
  const windows: Map<number, number[]> = new Map();

  for (const typeNum of types) {
    const window = Math.floor(typeNum / 256);
    const offset = typeNum % 256;
    const byteIndex = Math.floor(offset / 8);
    const bitIndex = 7 - (offset % 8);

    if (!windows.has(window)) {
      windows.set(window, []);
    }
    const windowBytes = windows.get(window)!;
    while (windowBytes.length <= byteIndex) {
      windowBytes.push(0);
    }
    windowBytes[byteIndex] |= (1 << bitIndex);
  }

  const parts: Buffer[] = [];
  for (const [windowNum, bytes] of Array.from(windows.entries()).sort((a, b) => a[0] - b[0])) {
    const windowHeader = Buffer.alloc(2);
    windowHeader.writeUInt8(windowNum, 0);
    windowHeader.writeUInt8(bytes.length, 1);
    parts.push(windowHeader, Buffer.from(bytes));
  }

  return Buffer.concat(parts);
}

function ipv4ToBuffer(ip: string): Buffer {
  const parts = ip.split('.').map(Number);
  return Buffer.from(parts);
}

function ipv6ToBuffer(ip: string): Buffer {
  const parts = ip.split(':');
  const fullParts: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '') {
      const missing = 8 - parts.length + 1;
      for (let j = 0; j < missing; j++) {
        fullParts.push('0000');
      }
    } else {
      fullParts.push(parts[i].padStart(4, '0'));
    }
  }
  
  const bytes: number[] = [];
  for (const part of fullParts) {
    bytes.push(parseInt(part.substring(0, 2), 16));
    bytes.push(parseInt(part.substring(2, 4), 16));
  }
  return Buffer.from(bytes);
}

function buildRSAKey(publicKey: Buffer): string {
  let offset = 0;
  const exponentLength = publicKey.readUInt8(offset);
  offset += 1;

  let exponent: Buffer;
  if (exponentLength === 0) {
    const longLength = publicKey.readUInt16BE(offset);
    offset += 2;
    exponent = publicKey.slice(offset, offset + longLength);
    offset += longLength;
  } else {
    exponent = publicKey.slice(offset, offset + exponentLength);
    offset += exponentLength;
  }

  const modulus = publicKey.slice(offset);

  const modulusHex = modulus.toString('hex');
  const exponentHex = exponent.toString('hex');

  const rsaPublicKey = `-----BEGIN PUBLIC KEY-----
${encodeBase64(derEncodeRSAPublicKey(modulusHex, exponentHex))}
-----END PUBLIC KEY-----
`;

  return rsaPublicKey;
}

function derEncodeRSAPublicKey(modulusHex: string, exponentHex: string): Buffer {
  const modulusBuffer = Buffer.from(modulusHex, 'hex');
  const exponentBuffer = Buffer.from(exponentHex, 'hex');

  const modulusDer = encodeDERInteger(modulusBuffer);
  const exponentDer = encodeDERInteger(exponentBuffer);

  const seqContent = Buffer.concat([modulusDer, exponentDer]);
  const seqDer = encodeDERSequence(seqContent);

  const bitStringContent = Buffer.concat([Buffer.from([0x00]), seqDer]);
  const bitStringDer = encodeDERBitString(bitStringContent);

  const oid = Buffer.from('06092a864886f70d010101', 'hex');
  const nullDer = Buffer.from('0500', 'hex');
  const algorithmSeqContent = Buffer.concat([oid, nullDer]);
  const algorithmSeqDer = encodeDERSequence(algorithmSeqContent);

  const spkiContent = Buffer.concat([algorithmSeqDer, bitStringDer]);
  const spkiDer = encodeDERSequence(spkiContent);

  return spkiDer;
}

function encodeDERInteger(buffer: Buffer): Buffer {
  let content = buffer;
  if (content[0] & 0x80) {
    content = Buffer.concat([Buffer.from([0x00]), content]);
  }
  const length = encodeDERLength(content.length);
  return Buffer.concat([Buffer.from([0x02]), length, content]);
}

function encodeDERSequence(content: Buffer): Buffer {
  const length = encodeDERLength(content.length);
  return Buffer.concat([Buffer.from([0x30]), length, content]);
}

function encodeDERBitString(content: Buffer): Buffer {
  const length = encodeDERLength(content.length);
  return Buffer.concat([Buffer.from([0x03]), length, content]);
}

function encodeDERLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  let bytes: number[] = [];
  while (length > 0) {
    bytes.unshift(length & 0xff);
    length >>= 8;
  }
  return Buffer.concat([Buffer.from([0x80 | bytes.length]), Buffer.from(bytes)]);
}

function ecdsaSigToDER(signature: Buffer, algorithm: number): Buffer {
  const halfLen = algorithm === 13 ? 32 : 48;

  let r = signature.slice(0, halfLen);
  let s = signature.slice(halfLen, halfLen * 2);

  if (r[0] & 0x80) {
    r = Buffer.concat([Buffer.from([0x00]), r]);
  }
  if (s[0] & 0x80) {
    s = Buffer.concat([Buffer.from([0x00]), s]);
  }

  const rDer = encodeDERInteger(r);
  const sDer = encodeDERInteger(s);

  return encodeDERSequence(Buffer.concat([rDer, sDer]));
}

export interface NSECVerifyResult extends VerifyResult {
  nameExists?: boolean;
  typeExists?: boolean;
  coveredTypes?: string[];
}

export function verifyNSEC(
  nsec: NSECRecord,
  domain: string,
  recordType: string,
  zone: string
): NSECVerifyResult {
  try {
    const domainLower = domain.toLowerCase();
    const nsecOwnerLower = nsec.name.toLowerCase();

    let nameExists = false;
    if (nsecOwnerLower === domainLower) {
      nameExists = true;
    }

    if (!nameExists && !isDomainInNSECRange(domain, nsec.name, nsec.nextDomain, zone)) {
      return {
        valid: false,
        reason: 'Domain not covered by NSEC range',
        nameExists: false,
        typeExists: false,
      };
    }

    const typeNum = recordTypeToNumber(recordType);
    const typeExists = nsec.typeBitmaps.includes(typeNum);

    return {
      valid: true,
      nameExists,
      typeExists,
      coveredTypes: nsec.coveredTypes,
    };
  } catch (e) {
    return {
      valid: false,
      reason: 'NSEC verification error',
      details: e instanceof Error ? e.message : String(e),
    };
  }
}

export function verifyNSEC3(
  nsec3: NSEC3Record,
  domain: string,
  recordType: string,
  zone: string
): NSECVerifyResult {
  try {
    const ownerHashBase32 = nsec3.name.split('.')[0];
    const nextHashBase32 = nsec3.nextHashedOwnerName;

    let ownerHash: Buffer;
    let nextHash: Buffer;

    try {
      ownerHash = Buffer.from(ownerHashBase32, 'base64');
    } catch {
      return {
        valid: false,
        reason: 'Invalid NSEC3 owner hash format',
        details: `Expected base64, got: ${ownerHashBase32}`,
      };
    }

    try {
      nextHash = Buffer.from(nextHashBase32, 'base64');
    } catch {
      return {
        valid: false,
        reason: 'Invalid NSEC3 next hash format',
        details: `Expected base64, got: ${nextHashBase32}`,
      };
    }

    const computedHash = calculateNSEC3Hash(
      domain,
      nsec3.hashAlgorithm,
      nsec3.iterations,
      Buffer.from(nsec3.salt, 'hex')
    );

    let nameExists = false;
    if (computedHash.compare(ownerHash) === 0) {
      nameExists = true;
    }

    if (!nameExists && !isHashInNSEC3Range(computedHash, ownerHash, nextHash)) {
      return {
        valid: false,
        reason: 'Domain hash not covered by NSEC3 range',
        nameExists: false,
        typeExists: false,
      };
    }

    const typeNum = recordTypeToNumber(recordType);
    const typeExists = nsec3.typeBitmaps.includes(typeNum);

    return {
      valid: true,
      nameExists,
      typeExists,
      coveredTypes: nsec3.coveredTypes,
    };
  } catch (e) {
    return {
      valid: false,
      reason: 'NSEC3 verification error',
      details: e instanceof Error ? e.message : String(e),
    };
  }
}

function buildECKey(publicKey: Buffer, algorithm: number): string {
  const ecPublicKeyOid = '06072a8648ce3d0201';
  const curveOid = algorithm === 13
    ? '06082a8648ce3d030107'
    : '06052b81040022';

  const ecPublicKeyOidBuffer = Buffer.from(ecPublicKeyOid, 'hex');
  const curveOidBuffer = Buffer.from(curveOid, 'hex');
  const algorithmContent = Buffer.concat([ecPublicKeyOidBuffer, curveOidBuffer]);
  const algorithmDer = encodeDERSequence(algorithmContent);

  const bitStringContent = Buffer.concat([Buffer.from([0x00, 0x04]), publicKey]);
  const bitStringDer = encodeDERBitString(bitStringContent);

  const spkiContent = Buffer.concat([algorithmDer, bitStringDer]);
  const spkiDer = encodeDERSequence(spkiContent);

  return `-----BEGIN PUBLIC KEY-----
${encodeBase64(spkiDer)}
-----END PUBLIC KEY-----
`;
}

function verifyED25519(publicKey: Buffer, data: Buffer, signature: Buffer): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        publicKey,
      ]),
      format: 'der',
      type: 'spki',
    });
    return crypto.verify(null, data, key, signature);
  } catch {
    return false;
  }
}

function encodeBase64(buffer: Buffer): string {
  return buffer.toString('base64').match(/.{1,64}/g)?.join('\n') || '';
}

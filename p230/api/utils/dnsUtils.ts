import * as crypto from 'crypto';
import { ALGORITHM_NAMES, DIGEST_TYPE_NAMES } from '../../shared/types';

export function domainToWire(domain: string): Buffer {
  const parts = domain.split('.').filter(Boolean);
  const buffers: Buffer[] = [];

  for (const part of parts) {
    const len = Buffer.alloc(1);
    len.writeUInt8(part.length, 0);
    buffers.push(len);
    buffers.push(Buffer.from(part, 'ascii'));
  }

  buffers.push(Buffer.from([0]));
  return Buffer.concat(buffers);
}

export function wireToDomain(wire: Buffer, offset: number = 0): { domain: string; offset: number } {
  const labels: string[] = [];
  let currentOffset = offset;
  let jumped = false;
  let jumpOffset = 0;

  while (currentOffset < wire.length) {
    const len = wire.readUInt8(currentOffset);

    if (len === 0) {
      currentOffset++;
      break;
    }

    if ((len & 0xc0) === 0xc0) {
      if (!jumped) {
        jumpOffset = currentOffset + 2;
        jumped = true;
      }
      const pointer = ((len & 0x3f) << 8) | wire.readUInt8(currentOffset + 1);
      currentOffset = pointer;
      continue;
    }

    currentOffset++;
    labels.push(wire.slice(currentOffset, currentOffset + len).toString('ascii'));
    currentOffset += len;
  }

  return {
    domain: labels.join('.'),
    offset: jumped ? jumpOffset : currentOffset,
  };
}

export function calculateKeyTag(flags: number, protocol: number, algorithm: number, publicKey: Buffer): number {
  const keyData = Buffer.alloc(4 + publicKey.length);
  keyData.writeUInt16BE(flags, 0);
  keyData.writeUInt8(protocol, 2);
  keyData.writeUInt8(algorithm, 3);
  publicKey.copy(keyData, 4);

  let ac = 0;
  for (let i = 0; i < keyData.length; i++) {
    ac += i & 1 ? keyData[i] : keyData[i] << 8;
  }
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
}

export function calculateDSDigest(
  ownerName: string,
  flags: number,
  protocol: number,
  algorithm: number,
  publicKey: Buffer,
  digestType: number
): string {
  const ownerWire = domainToWire(ownerName);
  const rdata = Buffer.alloc(4 + publicKey.length);
  rdata.writeUInt16BE(flags, 0);
  rdata.writeUInt8(protocol, 2);
  rdata.writeUInt8(algorithm, 3);
  publicKey.copy(rdata, 4);

  const data = Buffer.concat([ownerWire, rdata]);

  let hash: crypto.Hash;
  switch (digestType) {
    case 1:
      hash = crypto.createHash('sha1');
      break;
    case 2:
      hash = crypto.createHash('sha256');
      break;
    case 4:
      hash = crypto.createHash('sha384');
      break;
    default:
      throw new Error(`Unsupported digest type: ${digestType}`);
  }

  return hash.update(data).digest('hex').toUpperCase();
}

export function getAlgorithmName(algorithm: number): string {
  return ALGORITHM_NAMES[algorithm] || `Unknown (${algorithm})`;
}

export function getDigestTypeName(digestType: number): string {
  return DIGEST_TYPE_NAMES[digestType] || `Unknown (${digestType})`;
}

export function getNodeSigningAlgorithm(algorithm: number): string | null {
  switch (algorithm) {
    case 5:
    case 7:
      return 'sha1';
    case 8:
      return 'sha256';
    case 10:
      return 'sha512';
    case 13:
      return 'sha256';
    case 14:
      return 'sha384';
    case 15:
      return null;
    case 16:
      return null;
    default:
      return null;
  }
}

export function canonicalizeRRSet(
  records: Array<{ name: string; type: number; ttl: number; rdata: Buffer }>,
  typeCovered: number,
  originalTTL: number
): Buffer {
  const sorted = [...records]
    .filter(r => r.type === typeCovered)
    .sort((a, b) => {
      const aWire = domainToWire(a.name);
      const bWire = domainToWire(b.name);
      const aData = Buffer.concat([aWire, a.rdata]);
      const bData = Buffer.concat([bWire, b.rdata]);
      return aData.compare(bData);
    });

  const parts: Buffer[] = [];
  for (const record of sorted) {
    const nameWire = domainToWire(record.name);
    const ttlBuffer = Buffer.alloc(4);
    ttlBuffer.writeUInt32BE(originalTTL, 0);
    const rdlenBuffer = Buffer.alloc(2);
    rdlenBuffer.writeUInt16BE(record.rdata.length, 0);
    parts.push(nameWire);
    parts.push(Buffer.from([(typeCovered >> 8) & 0xff, typeCovered & 0xff]));
    parts.push(Buffer.from([0, 1]));
    parts.push(ttlBuffer);
    parts.push(rdlenBuffer);
    parts.push(record.rdata);
  }

  return Buffer.concat(parts);
}

export function buildSignedData(
  rrsig: {
    typeCovered: number;
    algorithm: number;
    labels: number;
    originalTTL: number;
    signatureExpiration: number;
    signatureInception: number;
    keyTag: number;
    signerName: string;
  },
  canonicalizedRRs: Buffer
): Buffer {
  const signerWire = domainToWire(rrsig.signerName);

  const rrsigData = Buffer.alloc(18);
  rrsigData.writeUInt16BE(rrsig.typeCovered, 0);
  rrsigData.writeUInt8(rrsig.algorithm, 2);
  rrsigData.writeUInt8(rrsig.labels, 3);
  rrsigData.writeUInt32BE(rrsig.originalTTL, 4);
  rrsigData.writeUInt32BE(rrsig.signatureExpiration, 8);
  rrsigData.writeUInt32BE(rrsig.signatureInception, 12);
  rrsigData.writeUInt16BE(rrsig.keyTag, 16);

  return Buffer.concat([rrsigData, signerWire, canonicalizedRRs]);
}

const TYPE_MAP: Record<number, string> = {
  1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR',
  15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV',
  43: 'DS', 46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY',
  50: 'NSEC3', 52: 'TLSA',
};

export function parseTypeBitmaps(bitmapData: Buffer): { bitmaps: number[]; types: string[] } {
  const types: string[] = [];
  const bitmaps: number[] = [];
  let offset = 0;

  while (offset < bitmapData.length) {
    const windowNumber = bitmapData.readUInt8(offset);
    offset += 1;
    const bitmapLength = bitmapData.readUInt8(offset);
    offset += 1;
    const bitmap = bitmapData.slice(offset, offset + bitmapLength);
    offset += bitmapLength;

    for (let byteIndex = 0; byteIndex < bitmap.length; byteIndex++) {
      const byte = bitmap[byteIndex];
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (1 << (7 - bit))) {
          const typeNum = windowNumber * 256 + byteIndex * 8 + bit;
          bitmaps.push(typeNum);
          types.push(TYPE_MAP[typeNum] || String(typeNum));
        }
      }
    }
  }

  return { bitmaps, types };
}

export function calculateNSEC3Hash(
  domain: string,
  hashAlgorithm: number,
  iterations: number,
  salt: Buffer
): Buffer {
  if (hashAlgorithm !== 1) {
    throw new Error(`Unsupported NSEC3 hash algorithm: ${hashAlgorithm}`);
  }

  const wire = domainToWire(domain.toLowerCase());
  let hash = Buffer.concat([wire, salt]);

  for (let i = 0; i <= iterations; i++) {
    hash = crypto.createHash('sha1').update(hash).digest();
  }

  return hash;
}

export function encodeBase32Hex(data: Buffer): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  let result = '';
  let buffer = 0;
  let bits = 0;

  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >> bits) & 0x1f];
    }
  }

  if (bits > 0) {
    buffer <<= (5 - bits);
    result += alphabet[buffer & 0x1f];
  }

  return result;
}

export function compareCanonicalNames(a: string, b: string): number {
  const aLabels = a.split('.').reverse();
  const bLabels = b.split('.').reverse();

  const minLen = Math.min(aLabels.length, bLabels.length);
  for (let i = 0; i < minLen; i++) {
    const cmp = aLabels[i].toLowerCase().localeCompare(bLabels[i].toLowerCase());
    if (cmp !== 0) return cmp;
  }

  return aLabels.length - bLabels.length;
}

export function isDomainInNSECRange(
  domain: string,
  nsecOwner: string,
  nsecNext: string,
  zone: string
): boolean {
  const domainLower = domain.toLowerCase();
  const ownerLower = nsecOwner.toLowerCase();
  const nextLower = nsecNext.toLowerCase();
  const zoneLower = zone.toLowerCase();

  if (!domainLower.endsWith('.' + zoneLower) && domainLower !== zoneLower) {
    return false;
  }

  if (ownerLower === nextLower) {
    return true;
  }

  const cmpOwner = compareCanonicalNames(domainLower, ownerLower);
  const cmpNext = compareCanonicalNames(domainLower, nextLower);

  if (compareCanonicalNames(ownerLower, nextLower) < 0) {
    return cmpOwner > 0 && cmpNext < 0;
  } else {
    return cmpOwner > 0 || cmpNext < 0;
  }
}

export function isHashInNSEC3Range(
  hash: Buffer,
  nsec3OwnerHash: Buffer,
  nsec3NextHash: Buffer
): boolean {
  const cmpOwner = hash.compare(nsec3OwnerHash);
  const cmpNext = hash.compare(nsec3NextHash);

  if (nsec3OwnerHash.compare(nsec3NextHash) < 0) {
    return cmpOwner > 0 && cmpNext < 0;
  } else {
    return cmpOwner > 0 || cmpNext < 0;
  }
}

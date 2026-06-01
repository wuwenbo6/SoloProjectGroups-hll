import * as dgram from 'dgram';
import { DNSRecord, DSRecord, DNSKEYRecord, RRSIGRecord, RecordType } from '../../shared/types';
import { calculateKeyTag, wireToDomain, domainToWire, parseTypeBitmaps, encodeBase32Hex, calculateNSEC3Hash } from '../utils/dnsUtils';
import { NSECRecord, NSEC3Record } from '../../shared/types';

const DNS_RECORD_TYPES: Record<string, number> = {
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

const RECORD_TYPE_NAMES: Record<number, string> = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
  33: 'SRV',
  43: 'DS',
  44: 'SSHFP',
  46: 'RRSIG',
  47: 'NSEC',
  48: 'DNSKEY',
  50: 'NSEC3',
  52: 'TLSA',
  59: 'CDS',
  60: 'CDNSKEY',
};

const DNS_RESOLVERS: string[] = [
  '8.8.8.8',
  '1.1.1.1',
  '9.9.9.9',
];

export interface DNSQueryResult {
  records: DNSRecord[];
  rrsig?: RRSIGRecord;
  nsec?: NSECRecord[];
  nsec3?: NSEC3Record[];
  nsecRRSIG?: RRSIGRecord;
}

interface ParsedRR {
  name: string;
  type: number;
  class: number;
  ttl: number;
  rdata: Buffer;
  nextOffset: number;
}

function parseRR(buffer: Buffer, offset: number): ParsedRR {
  let pos = offset;

  const { domain: name, offset: nameEnd } = wireToDomain(buffer, pos);
  pos = nameEnd;

  const type = buffer.readUInt16BE(pos);
  pos += 2;
  const cls = buffer.readUInt16BE(pos);
  pos += 2;
  const ttl = buffer.readUInt32BE(pos);
  pos += 4;
  const rdLength = buffer.readUInt16BE(pos);
  pos += 2;
  const rdata = buffer.slice(pos, pos + rdLength);
  pos += rdLength;

  return {
    name,
    type,
    class: cls,
    ttl,
    rdata,
    nextOffset: pos,
  };
}

function buildDNSQuery(
  domain: string,
  recordType: number,
  dnssecOk: boolean = true
): Buffer {
  const id = Math.floor(Math.random() * 65535);
  const flags = 0x0100;

  const qname = domainToWire(domain);
  const qtype = Buffer.alloc(2);
  qtype.writeUInt16BE(recordType, 0);
  const qclass = Buffer.alloc(2);
  qclass.writeUInt16BE(1, 0);

  const question = Buffer.concat([qname, qtype, qclass]);

  let additions = Buffer.alloc(0);
  let arcount = 0;

  if (dnssecOk) {
    arcount = 1;
    const optName = Buffer.from([0]);
    const optType = Buffer.alloc(2);
    optType.writeUInt16BE(41, 0);
    const optClass = Buffer.alloc(2);
    optClass.writeUInt16BE(4096, 0);
    const optTTL = Buffer.alloc(4);
    optTTL.writeUInt8(0, 0);
    optTTL.writeUInt8(0, 1);
    optTTL.writeUInt16BE(0x8000, 2);
    const optRDLen = Buffer.alloc(2);
    optRDLen.writeUInt16BE(0, 0);
    additions = Buffer.concat([optName, optType, optClass, optTTL, optRDLen]);
  }

  const header = Buffer.alloc(12);
  header.writeUInt16BE(id, 0);
  header.writeUInt16BE(flags, 2);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(0, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(arcount, 10);

  return Buffer.concat([header, question, additions]);
}

function sendDNSQuery(
  domain: string,
  recordType: number,
  resolver: string,
  dnssecOk: boolean = true
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');

    const query = buildDNSQuery(domain, recordType, dnssecOk);

    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('DNS query timeout'));
    }, 10000);

    socket.on('message', (msg) => {
      clearTimeout(timeout);
      socket.close();
      resolve(msg);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      socket.close();
      reject(err);
    });

    socket.send(query, 53, resolver, (err) => {
      if (err) {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      }
    });
  });
}

export async function queryWithFallback(
  domain: string,
  recordType: number,
  dnssecOk: boolean = true
): Promise<{ answers: ParsedRR[]; authority: ParsedRR[] }> {
  let lastError: Error | null = null;

  for (const resolver of DNS_RESOLVERS) {
    try {
      const response = await sendDNSQuery(domain, recordType, resolver, dnssecOk);

      const header = {
        id: response.readUInt16BE(0),
        flags: response.readUInt16BE(2),
        qdCount: response.readUInt16BE(4),
        anCount: response.readUInt16BE(6),
        nsCount: response.readUInt16BE(8),
        arCount: response.readUInt16BE(10),
      };

      let offset = 12;

      for (let i = 0; i < header.qdCount; i++) {
        const { offset: nameEnd } = wireToDomain(response, offset);
        offset = nameEnd + 4;
      }

      const answers: ParsedRR[] = [];
      for (let i = 0; i < header.anCount; i++) {
        const rr = parseRR(response, offset);
        answers.push(rr);
        offset = rr.nextOffset;
      }

      const authority: ParsedRR[] = [];
      for (let i = 0; i < header.nsCount; i++) {
        const rr = parseRR(response, offset);
        authority.push(rr);
        offset = rr.nextOffset;
      }

      return { answers, authority };
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError || new Error('All DNS resolvers failed');
}

export async function queryRecords(
  domain: string,
  recordType: RecordType
): Promise<DNSQueryResult> {
  const typeNum = DNS_RECORD_TYPES[recordType];
  const { answers, authority } = await queryWithFallback(domain, typeNum, true);

  const records: DNSRecord[] = [];
  let rrsig: RRSIGRecord | undefined;
  let nsecRRSIG: RRSIGRecord | undefined;
  const nsec: NSECRecord[] = [];
  const nsec3: NSEC3Record[] = [];

  for (const ans of answers) {
    const typeName = RECORD_TYPE_NAMES[ans.type];
    if (ans.type === DNS_RECORD_TYPES.RRSIG) {
      const parsed = parseRRSIGRecord(ans);
      if (parsed.typeCovered === recordType) {
        rrsig = parsed;
      }
    } else if (ans.type === typeNum) {
      records.push(parseGenericRecord(ans, typeName));
    }
  }

  for (const ans of authority) {
    if (ans.type === DNS_RECORD_TYPES.NSEC) {
      nsec.push(parseNSECRecord(ans));
    } else if (ans.type === DNS_RECORD_TYPES.NSEC3) {
      nsec3.push(parseNSEC3Record(ans));
    } else if (ans.type === DNS_RECORD_TYPES.RRSIG) {
      const parsed = parseRRSIGRecord(ans);
      if (parsed.typeCovered === 'NSEC' || parsed.typeCovered === 'NSEC3') {
        nsecRRSIG = parsed;
      }
    }
  }

  const result: DNSQueryResult = { records, rrsig };
  if (nsec.length > 0) result.nsec = nsec;
  if (nsec3.length > 0) result.nsec3 = nsec3;
  if (nsecRRSIG) result.nsecRRSIG = nsecRRSIG;

  return result;
}

export async function queryDNSKEY(
  domain: string
): Promise<{ records: DNSKEYRecord[]; rrsig?: RRSIGRecord }> {
  const { answers, authority } = await queryWithFallback(domain, DNS_RECORD_TYPES.DNSKEY, true);

  const records: DNSKEYRecord[] = [];
  let rrsig: RRSIGRecord | undefined;

  for (const ans of [...answers, ...authority]) {
    if (ans.type === DNS_RECORD_TYPES.DNSKEY) {
      records.push(parseDNSKEYRecord(ans));
    } else if (ans.type === DNS_RECORD_TYPES.RRSIG) {
      const parsed = parseRRSIGRecord(ans);
      if (parsed.typeCovered === 'DNSKEY') {
        rrsig = parsed;
      }
    }
  }

  return { records, rrsig };
}

export async function queryDS(domain: string): Promise<DSRecord[]> {
  const { answers, authority } = await queryWithFallback(domain, DNS_RECORD_TYPES.DS, true);

  const records: DSRecord[] = [];

  for (const ans of [...answers, ...authority]) {
    if (ans.type === DNS_RECORD_TYPES.DS) {
      records.push(parseDSRecord(ans));
    }
  }

  return records;
}

export async function queryNSEC(
  domain: string
): Promise<{ records: NSECRecord[]; rrsig?: RRSIGRecord }> {
  const { answers, authority } = await queryWithFallback(domain, DNS_RECORD_TYPES.NSEC, true);

  const records: NSECRecord[] = [];
  let rrsig: RRSIGRecord | undefined;

  for (const ans of [...answers, ...authority]) {
    if (ans.type === DNS_RECORD_TYPES.NSEC) {
      records.push(parseNSECRecord(ans));
    } else if (ans.type === DNS_RECORD_TYPES.RRSIG) {
      const parsed = parseRRSIGRecord(ans);
      if (parsed.typeCovered === 'NSEC') {
        rrsig = parsed;
      }
    }
  }

  return { records, rrsig };
}

export async function queryNSEC3(
  domain: string
): Promise<{ records: NSEC3Record[]; rrsig?: RRSIGRecord }> {
  const { answers, authority } = await queryWithFallback(domain, DNS_RECORD_TYPES.NSEC3, true);

  const records: NSEC3Record[] = [];
  let rrsig: RRSIGRecord | undefined;

  for (const ans of [...answers, ...authority]) {
    if (ans.type === DNS_RECORD_TYPES.NSEC3) {
      records.push(parseNSEC3Record(ans));
    } else if (ans.type === DNS_RECORD_TYPES.RRSIG) {
      const parsed = parseRRSIGRecord(ans);
      if (parsed.typeCovered === 'NSEC3') {
        rrsig = parsed;
      }
    }
  }

  return { records, rrsig };
}

function parseGenericRecord(ans: ParsedRR, typeName: string): DNSRecord {
  let data = '';

  switch (ans.type) {
    case DNS_RECORD_TYPES.A:
      data = Array.from(ans.rdata).join('.');
      break;
    case DNS_RECORD_TYPES.AAAA:
      data = parseAAAA(ans.rdata);
      break;
    case DNS_RECORD_TYPES.NS:
    case DNS_RECORD_TYPES.CNAME:
      data = wireToDomain(ans.rdata, 0).domain;
      break;
    case DNS_RECORD_TYPES.TXT: {
      const parts: string[] = [];
      let pos = 0;
      while (pos < ans.rdata.length) {
        const len = ans.rdata.readUInt8(pos);
        pos++;
        parts.push(ans.rdata.slice(pos, pos + len).toString('utf8'));
        pos += len;
      }
      data = parts.join('');
      break;
    }
    case DNS_RECORD_TYPES.MX: {
      const preference = ans.rdata.readUInt16BE(0);
      const exchange = wireToDomain(ans.rdata, 2).domain;
      data = `${preference} ${exchange}`;
      break;
    }
    default:
      data = ans.rdata.toString('hex');
  }

  return {
    name: ans.name,
    type: typeName,
    ttl: ans.ttl,
    data,
  };
}

function parseAAAA(rdata: Buffer): string {
  const parts: string[] = [];
  for (let i = 0; i < rdata.length; i += 2) {
    parts.push(rdata.readUInt16BE(i).toString(16));
  }
  return parts.join(':').replace(/(^|:)0(:0)+(:|$)/, '::');
}

function parseDSRecord(ans: ParsedRR): DSRecord {
  const buffer = ans.rdata;
  let offset = 0;

  const keyTag = buffer.readUInt16BE(offset);
  offset += 2;
  const algorithm = buffer.readUInt8(offset);
  offset += 1;
  const digestType = buffer.readUInt8(offset);
  offset += 1;
  const digest = buffer.slice(offset).toString('hex').toUpperCase();

  return {
    name: ans.name,
    type: 'DS',
    ttl: ans.ttl,
    data: `${keyTag} ${algorithm} ${digestType} ${digest}`,
    keyTag,
    algorithm,
    digestType,
    digest,
  };
}

function parseDNSKEYRecord(ans: ParsedRR): DNSKEYRecord {
  const buffer = ans.rdata;
  let offset = 0;

  const flags = buffer.readUInt16BE(offset);
  offset += 2;
  const protocol = buffer.readUInt8(offset);
  offset += 1;
  const algorithm = buffer.readUInt8(offset);
  offset += 1;
  const publicKeyBuffer = buffer.slice(offset);
  const publicKey = publicKeyBuffer.toString('base64');

  const keyTag = calculateKeyTag(flags, protocol, algorithm, publicKeyBuffer);

  const hasSEP = (flags & 0x001) === 0x001;
  const hasZoneKey = (flags & 0x100) === 0x100;
  const isZSK = hasZoneKey && !hasSEP;
  const isKSK = hasZoneKey && hasSEP;

  return {
    name: ans.name,
    type: 'DNSKEY',
    ttl: ans.ttl,
    data: `${flags} ${protocol} ${algorithm} ${publicKey}`,
    flags,
    protocol,
    algorithm,
    publicKey,
    keyTag,
    isZSK,
    isKSK,
  };
}

export function parseRRSIGRecord(ans: ParsedRR): RRSIGRecord {
  const buffer = ans.rdata;
  let offset = 0;

  const typeCoveredNum = buffer.readUInt16BE(offset);
  offset += 2;
  const algorithm = buffer.readUInt8(offset);
  offset += 1;
  const labels = buffer.readUInt8(offset);
  offset += 1;
  const originalTTL = buffer.readUInt32BE(offset);
  offset += 4;
  const signatureExpiration = buffer.readUInt32BE(offset);
  offset += 4;
  const signatureInception = buffer.readUInt32BE(offset);
  offset += 4;
  const keyTag = buffer.readUInt16BE(offset);
  offset += 2;

  const { domain: signerName, offset: signerOffset } = wireToDomain(buffer, offset);
  offset = signerOffset;

  const signature = buffer.slice(offset).toString('base64');

  const typeCovered = RECORD_TYPE_NAMES[typeCoveredNum] || String(typeCoveredNum);

  return {
    name: ans.name,
    type: 'RRSIG',
    ttl: ans.ttl,
    data: `${typeCovered} ${algorithm} ${labels} ${originalTTL} ${signatureExpiration} ${signatureInception} ${keyTag} ${signerName} ${signature}`,
    typeCovered,
    algorithm,
    labels,
    originalTTL,
    signatureExpiration,
    signatureInception,
    keyTag,
    signerName,
    signature,
  };
}

export function parseNSECRecord(ans: ParsedRR): NSECRecord {
  const buffer = ans.rdata;
  let offset = 0;

  const { domain: nextDomain, offset: nextOffset } = wireToDomain(buffer, offset);
  offset = nextOffset;

  const bitmapData = buffer.slice(offset);
  const { bitmaps, types } = parseTypeBitmaps(bitmapData);

  return {
    name: ans.name,
    type: 'NSEC',
    ttl: ans.ttl,
    data: `${nextDomain} ${types.join(',')}`,
    nextDomain,
    typeBitmaps: bitmaps,
    coveredTypes: types,
  };
}

export function parseNSEC3Record(ans: ParsedRR): NSEC3Record {
  const buffer = ans.rdata;
  let offset = 0;

  const hashAlgorithm = buffer.readUInt8(offset);
  offset += 1;
  const flags = buffer.readUInt8(offset);
  offset += 1;
  const iterations = buffer.readUInt16BE(offset);
  offset += 2;
  const saltLength = buffer.readUInt8(offset);
  offset += 1;
  const salt = buffer.slice(offset, offset + saltLength);
  offset += saltLength;
  const hashLength = buffer.readUInt8(offset);
  offset += 1;
  const nextHashedOwnerName = buffer.slice(offset, offset + hashLength).toString('base64');
  offset += hashLength;
  const bitmapData = buffer.slice(offset);
  const { bitmaps, types } = parseTypeBitmaps(bitmapData);

  const ownerHash = ans.name.split('.')[0];

  return {
    name: ans.name,
    type: 'NSEC3',
    ttl: ans.ttl,
    data: `${hashAlgorithm} ${flags} ${iterations} ${salt.toString('hex').toUpperCase()} ${nextHashedOwnerName} ${types.join(',')}`,
    hashAlgorithm,
    flags,
    iterations,
    salt: salt.toString('hex').toUpperCase(),
    nextHashedOwnerName,
    typeBitmaps: bitmaps,
    coveredTypes: types,
    hash: ownerHash,
  };
}

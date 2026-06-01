export type RecordType = 'A' | 'AAAA' | 'NS' | 'TXT' | 'MX' | 'SOA' | 'CNAME';

export interface NSECRecord extends DNSRecord {
  nextDomain: string;
  typeBitmaps: number[];
  coveredTypes: string[];
}

export interface NSEC3Record extends DNSRecord {
  hashAlgorithm: number;
  flags: number;
  iterations: number;
  salt: string;
  nextHashedOwnerName: string;
  typeBitmaps: number[];
  coveredTypes: string[];
  hash: string;
}

export type VerificationStatus = 'passed' | 'failed' | 'pending' | 'unsigned';

export interface DNSRecord {
  name: string;
  type: string;
  ttl: number;
  data: string;
}

export interface DSRecord extends DNSRecord {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: string;
}

export interface DNSKEYRecord extends DNSRecord {
  flags: number;
  protocol: number;
  algorithm: number;
  publicKey: string;
  keyTag: number;
  isZSK: boolean;
  isKSK: boolean;
}

export interface RRSIGRecord extends DNSRecord {
  typeCovered: string;
  algorithm: number;
  labels: number;
  originalTTL: number;
  signatureExpiration: number;
  signatureInception: number;
  keyTag: number;
  signerName: string;
  signature: string;
}

export interface VerificationStep {
  name: string;
  status: 'passed' | 'failed' | 'pending';
  message: string;
  details?: string;
  durationMs?: number;
}

export interface TrustAnchor {
  id: string;
  domain: string;
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: string;
  description?: string;
  createdAt: string;
}

export interface ChainNode {
  id: 'ds' | 'dnskey' | 'rrsig' | 'nsec' | 'nsec3';
  name: string;
  status: 'passed' | 'failed' | 'pending';
  records: DSRecord[] | DNSKEYRecord[] | RRSIGRecord[] | NSECRecord[] | NSEC3Record[];
}

export interface VerifyRequest {
  domain: string;
  recordType: RecordType;
  trustAnchorId?: string;
}

export interface VerifyResponse {
  success: boolean;
  domain: string;
  recordType: string;
  overallStatus: VerificationStatus;
  timestamp: string;
  duration: number;
  chain: ChainNode[];
  steps: VerificationStep[];
  targetRecords: DNSRecord[];
  timeline?: TimelineEntry[];
  error?: string;
}

export interface TimelineEntry {
  step: string;
  startMs: number;
  durationMs: number;
  status: 'passed' | 'failed' | 'pending';
}

export const ALGORITHM_NAMES: Record<number, string> = {
  1: 'RSAMD5',
  2: 'DH',
  3: 'DSA',
  5: 'RSASHA1',
  6: 'DSA-NSEC3-SHA1',
  7: 'RSASHA1-NSEC3-SHA1',
  8: 'RSASHA256',
  10: 'RSASHA512',
  12: 'ECC-GOST',
  13: 'ECDSAP256SHA256',
  14: 'ECDSAP384SHA384',
  15: 'ED25519',
  16: 'ED448',
};

export const DIGEST_TYPE_NAMES: Record<number, string> = {
  1: 'SHA-1',
  2: 'SHA-256',
  3: 'GOST 34.11-94',
  4: 'SHA-384',
};

export interface EncodeParams {
  smscNumber?: string;
  destinationNumber: string;
  messageText: string;
  encoding: '7bit' | 'ucs2';
  messageType: 'submit' | 'deliver';
  validityPeriod?: number;
  requestStatusReport?: boolean;
}

export interface PduPart {
  name: string;
  hex: string;
  description: string;
  offset: [number, number];
}

export interface EncodeResult {
  success: boolean;
  pdu: string;
  pduLength: number;
  parts: PduPart[];
  error?: string;
  multiPart?: {
    total: number;
    partNumber: number;
    reference: number;
  };
}

export interface MultiEncodeResult {
  success: boolean;
  pdus: EncodeResult[];
  totalParts: number;
  error?: string;
}

export interface UdhInfo {
  hasUdh: boolean;
  udhLength: number;
  concatRef?: number;
  concatTotal?: number;
  concatSeq?: number;
  udhHex?: string;
}

export interface AddressInfo {
  length: number;
  type: number;
  number: string;
}

export interface DecodeResult {
  smsc: AddressInfo;
  pduType: string;
  pduTypeHex: string;
  mr?: number;
  oa?: AddressInfo;
  da?: AddressInfo;
  pid: number;
  dcs: number;
  encoding: '7bit' | 'ucs2';
  scts?: string;
  vp?: string;
  udl: number;
  ud: {
    hex: string;
    text: string;
    length: number;
  };
  rawPdu: string;
  parts: PduPart[];
  udh?: UdhInfo;
}

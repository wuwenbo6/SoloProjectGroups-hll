export type EapDirection =
  | "supplicant_to_auth"
  | "auth_to_supplicant"
  | "auth_to_server"
  | "server_to_auth"
  | "unknown";

export type TlsPhaseName =
  | "ClientHello"
  | "ServerHello"
  | "Certificate"
  | "KeyExchange"
  | "Finished"
  | "ApplicationData"
  | "TLSData"
  | "TLSHandshake"
  | "TLSFragment"
  | "TLSStart";

export interface FragmentInfo {
  isFragment: boolean;
  moreFragments: boolean;
  fragmentSequence: number;
  totalFragments: number;
  totalLength?: number | null;
  reassembledData?: string | null;
}

export interface Md5Info {
  valueSize: number;
  value: string;
  role: "Challenge" | "Response";
  challenge?: string;
  response?: string;
  name?: string;
}

export interface EapMessage {
  id: number;
  frameNumber: number;
  timestamp: number;
  direction: EapDirection;
  eapCode: string;
  eapType: string;
  eapTypeData: string;
  rawData: string;
  tlsPhase?: TlsPhaseName | null;
  identity?: string | null;
  fragmentInfo?: FragmentInfo | null;
  md5Info?: Md5Info | null;
  ethernetHeader?: {
    srcMac: string;
    dstMac: string;
    etherType: string;
  };
  eapolHeader?: {
    version: number;
    type: string;
    length: number;
  };
  eapHeader?: {
    code: number;
    identifier: number;
    length: number;
  };
  decodedFields?: Record<string, string>;
}

export type RadiusDirection = "auth_to_server" | "server_to_auth";

export interface RadiusMessage {
  id: number;
  relatedEapMessageId: number;
  timestamp: number;
  direction: RadiusDirection;
  radiusCode: "Access-Request" | "Access-Accept" | "Access-Reject" | "Access-Challenge";
  radiusAttributes: Record<string, string>;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  san: string[];
  isCA: boolean;
  signatureAlgorithm: string;
  fingerprintSha256: string;
  derBase64: string;
  pem: string;
  sourceMessageId?: number;
  sourceFrame?: number;
}

export interface TlsPhase {
  name: string;
  startMessageId: number;
  endMessageId: number;
  description: string;
}

export interface AnalyzeSummary {
  totalFrames: number;
  eapolFrames: number;
  duration: number;
  identity: string | null;
  authMethod: string;
}

export interface AnalyzeResponse {
  id: string;
  summary: AnalyzeSummary;
  messages: EapMessage[];
  tlsPhases: TlsPhase[];
  radiusMessages: RadiusMessage[];
  certificateChain: CertificateInfo[];
}

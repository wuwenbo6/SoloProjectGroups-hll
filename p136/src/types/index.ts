export interface CertInfo {
  subject: {
    CN: string;
    O: string;
    OU: string;
    C: string;
  };
  issuer: {
    CN: string;
    O: string;
    OU: string;
    C: string;
  };
  validFrom: string;
  validTo: string;
  serialNumber: string;
  signatureAlgorithm: string;
  publicKeyAlgorithm: string;
  keySize: number;
  fingerprintSHA1: string;
  fingerprintSHA256: string;
  pem?: string;
  isCA?: boolean;
}

export interface CertChainInfo {
  certificates: CertInfo[];
  chainLength: number;
  chainValid: boolean;
  rootCA?: CertInfo;
  intermediateCAs: CertInfo[];
  leafCert: CertInfo;
}

export interface VersionInfo {
  firmwareVersion: string;
  packageVersion: string;
  keyVersion: string;
  hardwareVersion?: string;
  buildNumber?: number;
  revision?: string;
  changelog?: string;
}

export interface SignLogEntry {
  id: string;
  timestamp: number;
  operation: 'sign' | 'verify' | 'encrypt' | 'decrypt';
  status: 'success' | 'failed';
  firmwareName: string;
  firmwareSize: number;
  firmwareHash: string;
  certificateCN: string;
  certificateSerial: string;
  signature?: string;
  packageFilename?: string;
  packageSize?: number;
  errorMessage?: string;
  versionInfo?: VersionInfo;
  signAlgorithm: string;
  encryptAlgorithm: string;
  clientIP?: string;
  durationMs?: number;
}

export interface SignLogExport {
  exportTime: number;
  totalEntries: number;
  exportedBy: string;
  entries: SignLogEntry[];
}

export interface EncryptConfig {
  aesKey: string;
  aesIv: string;
}

export interface SignResult {
  success: boolean;
  hash: string;
  signature: string;
  algorithm: string;
}

export interface EncryptResult {
  success: boolean;
  encryptedData: string;
  originalSize: number;
  paddedSize?: number;
  encryptedSize: number;
}

export interface VerifyResult {
  success: boolean;
  valid: boolean;
  message: string;
  firmwareHash?: string;
  certInfo?: CertInfo;
  certChain?: CertChainInfo;
  timestamp?: number;
  firmwareInfo?: {
    originalName: string;
    originalSize: number;
  };
  versionInfo?: VersionInfo;
}

export interface SignEncryptResponse {
  success: boolean;
  data?: {
    packageFilename: string;
    packageSize: number;
    signResult: SignResult;
    encryptResult: EncryptResult;
    certInfo: CertInfo;
    certChain?: CertChainInfo;
    encryptConfig: EncryptConfig;
    versionInfo?: VersionInfo;
    logEntry?: SignLogEntry;
  };
  error?: string;
}

export interface UploadedFile {
  name: string;
  size: number;
  file: File;
}

export interface ProcessState {
  step: number;
  totalSteps: number;
  currentStep: string;
  isProcessing: boolean;
  logs: string[];
}

export type VTPMStatus = 'available' | 'assigned' | 'error' | 'initializing';

export interface VTPM {
  id: string;
  name: string;
  status: VTPMStatus;
  vmId?: string;
  vmName?: string;
  ekCert?: string;
  akCert?: string;
  socketPath?: string;
  statePath?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PCRRegister {
  index: number;
  value: string;
  algorithm: 'SHA1' | 'SHA256';
}

export interface Certificate {
  id: string;
  vtpmId: string;
  type: 'EK' | 'AK' | 'platform';
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  pem: string;
}

export interface VirtualMachine {
  id: string;
  name: string;
  libvirtUuid?: string;
  state: 'running' | 'stopped' | 'paused';
  vtpmId?: string;
  vtpmName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CryptoRequest {
  vtpmId: string;
  data: string;
  keyType?: 'EK' | 'AK';
}

export interface CryptoResponse {
  success: boolean;
  result: string;
  error?: string;
}

export interface Stats {
  totalVtpm: number;
  availableVtpm: number;
  assignedVtpm: number;
  errorVtpm: number;
  totalVms: number;
  vmsWithVtpm: number;
}

export interface OperationLog {
  id: string;
  vtpmId?: string;
  operation: string;
  status: string;
  details?: string;
  createdAt: Date;
}

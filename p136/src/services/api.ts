import axios from 'axios';
import type {
  CertInfo,
  EncryptConfig,
  SignEncryptResponse,
  VerifyResult,
  VersionInfo,
  SignLogEntry,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

export interface SignEncryptParams {
  firmware: File;
  privateKey: File;
  certificate: File;
  caCertificates?: File[];
  aesKey?: string;
  aesIv?: string;
  firmwareVersion?: string;
  packageVersion?: string;
  hardwareVersion?: string;
  changelog?: string;
}

export async function signAndEncrypt(params: SignEncryptParams): Promise<SignEncryptResponse> {
  const formData = new FormData();
  formData.append('firmware', params.firmware);
  formData.append('privateKey', params.privateKey);
  formData.append('certificate', params.certificate);
  
  if (params.caCertificates) {
    for (const cert of params.caCertificates) {
      formData.append('caCertificates', cert);
    }
  }
  
  if (params.aesKey) {
    formData.append('aesKey', params.aesKey);
  }
  if (params.aesIv) {
    formData.append('aesIv', params.aesIv);
  }
  if (params.firmwareVersion) {
    formData.append('firmwareVersion', params.firmwareVersion);
  }
  if (params.packageVersion) {
    formData.append('packageVersion', params.packageVersion);
  }
  if (params.hardwareVersion) {
    formData.append('hardwareVersion', params.hardwareVersion);
  }
  if (params.changelog) {
    formData.append('changelog', params.changelog);
  }
  
  const response = await api.post<SignEncryptResponse>('/firmware/sign-encrypt', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
}

export async function parseCertificate(certificate: File): Promise<{ success: boolean; data?: CertInfo; error?: string }> {
  const formData = new FormData();
  formData.append('certificate', certificate);
  
  const response = await api.post('/firmware/parse-cert', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
}

export async function generateKey(): Promise<{ success: boolean; data?: EncryptConfig }> {
  const response = await api.post('/firmware/generate-key');
  return response.data;
}

export interface VerifyParams {
  package: File;
  certificate?: File;
  aesKey?: string;
}

export async function verifyPackage(params: VerifyParams): Promise<VerifyResult & { success: boolean; error?: string }> {
  const formData = new FormData();
  formData.append('package', params.package);
  
  if (params.certificate) {
    formData.append('certificate', params.certificate);
  }
  
  if (params.aesKey) {
    formData.append('aesKey', params.aesKey);
  }
  
  const response = await api.post('/verify/package', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
}

export function getDownloadUrl(filename: string): string {
  return `/api/firmware/download/${encodeURIComponent(filename)}`;
}

export async function cleanupFiles(): Promise<{ success: boolean; message?: string }> {
  const response = await api.delete('/firmware/files');
  return response.data;
}

export async function checkHealth(): Promise<{ success: boolean; message: string; timestamp: number }> {
  const response = await api.get('/health');
  return response.data;
}

export interface LogListParams {
  limit?: number;
  offset?: number;
}

export interface LogListResponse {
  entries: SignLogEntry[];
  total: number;
  hasMore: boolean;
}

export async function getLogList(params?: LogListParams): Promise<{ success: boolean; data?: LogListResponse; error?: string }> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.offset) queryParams.append('offset', params.offset.toString());
  
  const response = await api.get(`/logs?${queryParams.toString()}`);
  return response.data;
}

export async function getLogStats(): Promise<{
  success: boolean;
  data?: {
    total: number;
    success: number;
    failed: number;
    signOps: number;
    verifyOps: number;
    last24h: number;
  };
  error?: string;
}> {
  const response = await api.get('/logs/stats');
  return response.data;
}

export async function exportLogs(format: 'json' | 'csv' | 'txt', entries?: SignLogEntry[]): Promise<Blob> {
  let response;
  
  if (entries) {
    response = await api.post('/logs/export', { format, entries }, {
      responseType: 'blob',
    });
  } else {
    response = await api.get(`/logs/export/${format}`, {
      responseType: 'blob',
    });
  }
  
  return response.data;
}

export async function deleteLog(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await api.delete(`/logs/${id}`);
  return response.data;
}

export async function clearAllLogs(): Promise<{ success: boolean; message?: string; error?: string }> {
  const response = await api.delete('/logs');
  return response.data;
}

export default api;

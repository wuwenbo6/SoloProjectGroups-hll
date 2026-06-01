import type { VTPM, VirtualMachine, PCRRegister, Certificate, Stats, CryptoResponse } from '../../shared/types';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getStats: () => request<Stats>('/stats'),
  getVTPMs: () => request<VTPM[]>('/vtpm'),
  getVTPM: (id: string) => request<VTPM>(`/vtpm/${id}`),
  createVTPM: (name: string) => request<VTPM>('/vtpm', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  deleteVTPM: (id: string) => request<{ success: boolean }>(`/vtpm/${id}`, {
    method: 'DELETE',
  }),
  assignVTPM: (id: string, vmId: string) => request<VTPM>(`/vtpm/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ vmId }),
  }),
  unassignVTPM: (id: string, reason?: string) => request<VTPM>(`/vtpm/${id}/unassign`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  getPCRs: (id: string) => request<PCRRegister[]>(`/vtpm/${id}/pcrs`),
  updatePCR: (id: string, index: number, value: string) => request<PCRRegister>(`/vtpm/${id}/pcrs/${index}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  }),
  getCertificates: (id: string) => request<Certificate[]>(`/vtpm/${id}/certificates`),
  getAllocations: (id: string) => request<any[]>(`/vtpm/${id}/allocations`),
  exportState: (id: string) => request<any>(`/vtpm/${id}/export`, {
    method: 'POST',
  }),
  importState: (id: string, pcrs: PCRRegister[]) => request<{ success: boolean }>(`/vtpm/${id}/import`, {
    method: 'POST',
    body: JSON.stringify({ pcrs }),
  }),
  getKeys: (id: string) => request<any[]>(`/vtpm/${id}/keys`),
  generateQuote: (id: string, pcrSelection?: number[], nonce?: string) => request<any>(`/vtpm/${id}/quote`, {
    method: 'POST',
    body: JSON.stringify({ pcrSelection, nonce }),
  }),
  verifyQuote: (id: string, quoteId: string, expectedNonce?: string, expectedPCRValues?: PCRRegister[]) => request<any>(`/vtpm/${id}/quote/${quoteId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ expectedNonce, expectedPCRValues }),
  }),
  getQuotes: (id: string) => request<any[]>(`/vtpm/${id}/quotes`),
  getEventLog: (id: string, format?: 'json' | 'tcg') => request<any>(`/vtpm/${id}/log${format ? `?format=${format}` : ''}`),
  exportEventLog: (id: string, download?: boolean) => request<any>(`/vtpm/${id}/log/export${download ? '?download=true' : ''}`, {
    method: 'POST',
  }),
  logEvent: (id: string, eventName: string, details?: any, pcrIndex?: number, eventType?: string) => request<any>(`/vtpm/${id}/log/event`, {
    method: 'POST',
    body: JSON.stringify({ eventName, details, pcrIndex, eventType }),
  }),
  getVMs: () => request<VirtualMachine[]>('/vms'),
  createVM: (name: string) => request<VirtualMachine>('/vms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  deleteVM: (id: string) => request<{ success: boolean }>(`/vms/${id}`, {
    method: 'DELETE',
  }),
  encrypt: (vtpmId: string, data: string, keyType?: 'EK' | 'AK') =>
    request<CryptoResponse>('/crypto/encrypt', {
      method: 'POST',
      body: JSON.stringify({ vtpmId, data, keyType }),
    }),
  decrypt: (vtpmId: string, data: string, keyType?: 'EK' | 'AK') =>
    request<CryptoResponse>('/crypto/decrypt', {
      method: 'POST',
      body: JSON.stringify({ vtpmId, data, keyType }),
    }),
  sign: (vtpmId: string, data: string) =>
    request<CryptoResponse>('/crypto/sign', {
      method: 'POST',
      body: JSON.stringify({ vtpmId, data }),
    }),
  verify: (vtpmId: string, data: string, signature: string) =>
    request<{ success: boolean; valid: boolean }>('/crypto/verify', {
      method: 'POST',
      body: JSON.stringify({ vtpmId, data, signature }),
    }),
};

import type {
  AuthRequest,
  AuthResponse,
  AuthorizeRequest,
  AuthorizeResponse,
  AccountingRequest,
  AccountingResponse,
  SystemConfig,
  User,
  AuthPolicy,
  PacketRecord,
  TacacsSession,
} from './types';

const API_BASE = 'http://localhost:8080/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export const api = {
  auth: (data: AuthRequest) =>
    request<AuthResponse>('/auth', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  authorize: (data: AuthorizeRequest) =>
    request<AuthorizeResponse>('/authorize', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  accounting: (data: AccountingRequest) =>
    request<AccountingResponse>('/accounting', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getConfig: () => request<SystemConfig>('/config'),

  updateConfig: (data: { sharedSecret: string }) =>
    request<void>('/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getUsers: () => request<User[]>('/users'),

  createUser: (data: Partial<User>) =>
    request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateUser: (username: string, data: Partial<User>) =>
    request<User>(`/users/${username}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteUser: (username: string) =>
    request<void>(`/users/${username}`, {
      method: 'DELETE',
    }),

  getPolicies: () => request<AuthPolicy[]>('/policies'),

  createPolicy: (data: Partial<AuthPolicy>) =>
    request<AuthPolicy>('/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePolicy: (id: string, data: Partial<AuthPolicy>) =>
    request<AuthPolicy>(`/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deletePolicy: (id: string) =>
    request<void>(`/policies/${id}`, {
      method: 'DELETE',
    }),

  getSessions: () => request<TacacsSession[]>('/sessions'),

  getPackets: (sessionId?: number) =>
    request<PacketRecord[]>(`/packets${sessionId ? `?sessionId=${sessionId}` : ''}`),

  exportPacketsJSON: (sessionId?: number, type?: string) => {
    const params = new URLSearchParams();
    if (sessionId !== undefined) params.append('sessionId', sessionId.toString());
    if (type) params.append('type', type);
    window.open(`${API_BASE}/packets/export/json?${params.toString()}`, '_blank');
  },

  exportPacketsCSV: (sessionId?: number, type?: string) => {
    const params = new URLSearchParams();
    if (sessionId !== undefined) params.append('sessionId', sessionId.toString());
    if (type) params.append('type', type);
    window.open(`${API_BASE}/packets/export/csv?${params.toString()}`, '_blank');
  },
};

import {
  ChargePoint,
  Transaction,
  BillingDetail,
  DashboardStats,
  PricingRule
} from '../../shared/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  getDashboardStats: () => request<DashboardStats>('/stats/dashboard'),

  getChargePoints: () => request<(ChargePoint & { isOnline: boolean })[]>('/chargepoints'),
  getChargePoint: (id: string) => request<ChargePoint & { isOnline: boolean }>(`/chargepoints/${id}`),

  getTransactions: (options?: { limit?: number; offset?: number; status?: string }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.status) params.set('status', options.status);
    const query = params.toString();
    return request<Transaction[]>(`/transactions${query ? `?${query}` : ''}`);
  },
  getTransaction: (id: number) => request<Transaction & { billing?: BillingDetail }>(`/transactions/${id}`),

  getBillingDetails: (options?: { limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    const query = params.toString();
    return request<(BillingDetail & { transaction?: Transaction })[]>(`/billing${query ? `?${query}` : ''}`);
  },
  getBillingByTransaction: (transactionId: number) =>
    request<BillingDetail>(`/billing/${transactionId}`),

  getPricingRules: () => request<PricingRule[]>('/pricing'),

  getQueueStats: () => request<{
    pendingCount: number;
    messages: any[];
    byChargePoint: Record<string, number>;
  }>('/queue'),

  sendCommand: (chargePointId: string, action: string, payload: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/command/${chargePointId}`, {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    }),

  remoteStartTransaction: (chargePointId: string, connectorId: number, idTag: string) =>
    request<Record<string, unknown>>(`/command/${chargePointId}/remote-start`, {
      method: 'POST',
      body: JSON.stringify({ connectorId, idTag })
    }),

  remoteStopTransaction: (chargePointId: string, transactionId: number) =>
    request<Record<string, unknown>>(`/command/${chargePointId}/remote-stop`, {
      method: 'POST',
      body: JSON.stringify({ transactionId })
    }),

  exportTransactionsCSV: () => {
    window.open('/api/transactions/export/csv', '_blank');
  }
};

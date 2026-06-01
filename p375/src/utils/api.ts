const API_BASE = 'http://localhost:8000/api';

interface FetchOptions extends RequestInit {
  rawResponse?: boolean;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { rawResponse, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...fetchOptions,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  if (rawResponse) {
    return response as unknown as T;
  }

  return response.json();
}

export const api = {
  getStatus: () => fetchAPI('/switch/status'),
  getPorts: () => fetchAPI('/switch/ports'),
  getMacTable: () => fetchAPI('/switch/mac-table'),
  getMirrorRules: () => fetchAPI('/switch/mirror'),
  getPackets: (type?: 'original' | 'mirror', limit = 100) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    params.set('limit', limit.toString());
    return fetchAPI(`/switch/packets?${params.toString()}`);
  },

  startSwitch: () => fetchAPI('/switch/start', { method: 'POST' }),
  stopSwitch: () => fetchAPI('/switch/stop', { method: 'POST' }),
  resetSwitch: () => fetchAPI('/switch/reset', { method: 'POST' }),
  clearMacTable: () => fetchAPI('/switch/mac-table', { method: 'DELETE' }),

  deleteMirrorRule: (ruleId: number) =>
    fetchAPI(`/switch/mirror/${ruleId}`, { method: 'DELETE' }),

  sendTestPacket: (config: {
    srcMac: string;
    dstMac: string;
    srcIp: string;
    dstIp: string;
    srcPort: number;
    dstPort: number;
    inPort: number;
    protocol?: string;
    payload?: string;
  }) =>
    fetchAPI('/switch/send-packet', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getMirrorStats: () => fetchAPI('/switch/mirror/stats'),
  setMirrorRateLimit: (rateMbps: number) =>
    fetchAPI('/switch/mirror/rate-limit', {
      method: 'POST',
      body: JSON.stringify({ rateMbps }),
    }),
  resetMirrorStats: () => fetchAPI('/switch/mirror/reset-stats', { method: 'POST' }),

  getDetailedMirrorStats: (includeEntries = true, limit = 1000) =>
    fetchAPI(`/switch/mirror/stats/detailed?includeEntries=${includeEntries}&limit=${limit}`),
  createMirrorRule: (config: {
    sourcePort: number;
    monitorPort: number;
    direction: string;
    enabled?: boolean;
    match?: {
      protocol?: string;
      srcPort?: number;
      dstPort?: number;
      srcIp?: string;
      dstIp?: string;
      srcMac?: string;
      dstMac?: string;
    };
  }) =>
    fetchAPI('/switch/mirror', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  exportMirrorStatsJson: (includeEntries = true, limit = 1000) =>
    fetchAPI(`/switch/mirror/export/json?includeEntries=${includeEntries}&limit=${limit}`, {
      rawResponse: true,
    }),
  exportMirrorStatsCsv: (includeEntries = true, limit = 1000) =>
    fetchAPI(`/switch/mirror/export/csv?includeEntries=${includeEntries}&limit=${limit}`, {
      rawResponse: true,
    }),
};

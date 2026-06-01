const API_BASE = '/api';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export interface NodeStatus {
  node_id: string;
  address: string;
  known_nodes: number;
  uptime_seconds: number;
  running: boolean;
}

export interface PingResult {
  transaction_id: string;
  node_id: string;
  elapsed_ms: number;
  error: string | null;
}

export interface FindNodeResult {
  transaction_id: string;
  nodes: NodeInfo[];
  elapsed_ms: number;
  error: string | null;
}

export interface NodeInfo {
  node_id: string;
  ip: string;
  port: number;
  last_seen: string;
}

export interface BucketInfo {
  bucket_index: number;
  min_prefix: string;
  max_prefix: string;
  nodes: NodeInfo[];
}

export interface RoutingTableData {
  buckets: BucketInfo[];
}

export interface QueryLogEntry {
  timestamp: string;
  transaction_id: string;
  query_type: 'ping' | 'find_node' | 'get_peers' | 'announce_peer';
  target: string;
  status: 'success' | 'timeout' | 'error';
  elapsed_ms: number;
  result_summary: string;
}

export interface SimulatedNodeInfo {
  node_id: string;
  address: string;
}

export interface BootstrapResult {
  added: SimulatedNodeInfo[];
}

export interface PeerInfo {
  ip: string;
  port: number;
}

export interface GetPeersResult {
  transaction_id: string;
  token: string;
  has_peers: boolean;
  peers: PeerInfo[];
  nodes: NodeInfo[];
  elapsed_ms: number;
  error: string | null;
}

export interface AnnouncePeerResult {
  transaction_id: string;
  success: boolean;
  message: string;
  elapsed_ms: number;
  error: string | null;
}

export interface ExportedNode {
  node_id: string;
  address: string;
  ip: string;
  port: number;
  last_seen: string;
  uptime: string;
}

export interface ExportedBucket {
  bucket_index: number;
  capacity: number;
  node_count: number;
  prefix_range: string;
  nodes: ExportedNode[];
}

export interface ExportedPeerEntry {
  info_hash: string;
  peer_address: string;
  ip: string;
  port: number;
  added_at: string;
}

export interface ExportedRoutingTable {
  self_id: string;
  generated_at: string;
  total_nodes: number;
  total_peers: number;
  total_resources: number;
  buckets: ExportedBucket[];
  peers: ExportedPeerEntry[];
}

export interface ResourceInfo {
  info_hash: string;
  announced_at: string;
  peer_count: number;
  peers: string[];
}

export interface ResourcesData {
  generated_at: string;
  total_resources: number;
  total_peers: number;
  resources: ResourceInfo[];
}

export const api = {
  getNodeStatus: () => fetchAPI<NodeStatus>('/node/status'),

  startNode: () => fetchAPI<{ status: string }>('/node/start', { method: 'POST' }),

  stopNode: () => fetchAPI<{ status: string }>('/node/stop', { method: 'POST' }),

  ping: (targetAddr: string) =>
    fetchAPI<PingResult>('/query/ping', {
      method: 'POST',
      body: JSON.stringify({ target_addr: targetAddr }),
    }),

  findNode: (targetId: string, askAddr: string) =>
    fetchAPI<FindNodeResult>('/query/find_node', {
      method: 'POST',
      body: JSON.stringify({ target_id: targetId, ask_addr: askAddr }),
    }),

  getPeers: (infoHash: string, askAddr: string) =>
    fetchAPI<GetPeersResult>('/query/get_peers', {
      method: 'POST',
      body: JSON.stringify({ info_hash: infoHash, ask_addr: askAddr }),
    }),

  announcePeer: (infoHash: string, askAddr: string, port: number, token: string) =>
    fetchAPI<AnnouncePeerResult>('/query/announce_peer', {
      method: 'POST',
      body: JSON.stringify({ info_hash: infoHash, ask_addr: askAddr, port, token }),
    }),

  getRoutingTable: () => fetchAPI<RoutingTableData>('/routing-table'),

  exportRoutingTable: (format?: 'json' | 'text') =>
    fetch(`/api/routing-table/export${format === 'text' ? '?format=text' : ''}`),

  getResources: () => fetchAPI<ResourcesData>('/resources'),

  getLogs: () => fetchAPI<{ logs: QueryLogEntry[] }>('/query/logs'),

  bootstrap: (count: number) =>
    fetchAPI<BootstrapResult>('/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ count }),
    }),

  getSimulatedNodes: () => fetchAPI<{ nodes: SimulatedNodeInfo[] }>('/simulated-nodes'),
};

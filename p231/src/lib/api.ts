const API_BASE = "http://localhost:5001/api";

export interface CaptureStatus {
  running: boolean;
  interface: string | null;
  stats: {
    total_packets: number;
    ddp_packets: number;
    rip_packets: number;
    aarp_packets: number;
    nbp_packets: number;
  };
  networks_count: number;
  routes_count: number;
  packets_count: number;
  aarp_count: number;
  nbp_count: number;
}

export interface NodeInfo {
  node_id: number;
  sockets: number[];
  first_seen: string;
  last_seen: string;
  device_name?: string;
  device_type?: string;
  device_type_cn?: string;
  device_full_name?: string;
}

export interface NetworkInfo {
  network_number: number;
  nodes: Record<string, NodeInfo>;
  first_seen: string;
  last_seen: string;
}

export interface RouteEntry {
  destination: number;
  next_hop: string;
  hop_count: number;
  status: string;
  last_updated: string;
}

export interface PacketEntry {
  timestamp: string;
  format: string;
  src_net: number;
  src_node: number;
  src_socket: number;
  src_socket_name: string;
  dst_net: number;
  dst_node: number;
  dst_socket: number;
  dst_socket_name: string;
  protocol_type: number;
  protocol_name: string;
  hop_count: number;
  length: number;
  rtmp_routes?: { network: number; hop_count: number }[];
}

export interface InterfacesResponse {
  interfaces: string[];
  error?: string;
}

export interface AarpMapping {
  mac: string;
  atalk_addr: string;
  atalk_net: number;
  atalk_node: number;
  opcode: string;
  first_seen: string;
  last_seen: string;
}

export interface AarpPacketEntry {
  timestamp: string;
  opcode: number;
  opcode_name: string;
  src_mac: string;
  src_atalk_addr: string;
  dst_mac: string;
  dst_atalk_addr: string;
}

export interface AarpResponse {
  mappings: AarpMapping[];
  recent_packets: AarpPacketEntry[];
}

export interface NbpDevice {
  atalk_addr: string;
  atalk_net: number;
  atalk_node: number;
  object_name: string;
  type_name: string;
  zone_name: string;
  full_name: string;
  device_type_cn: string;
  function: string;
  sockets: number[];
  first_seen: string;
  last_seen: string;
}

export interface NbpPacketEntry {
  timestamp: string;
  function_name: string;
  nbp_id: number;
  src_atalk_addr: string;
  entries_count: number;
}

export interface NbpResponse {
  devices: NbpDevice[];
  recent_packets: NbpPacketEntry[];
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getStatus: () => fetchApi<CaptureStatus>("/status"),

  startCapture: (iface: string) =>
    fetchApi<{ status: string; interface: string }>("/capture/start", {
      method: "POST",
      body: JSON.stringify({ interface: iface }),
    }),

  stopCapture: () =>
    fetchApi<{ status: string; interface: string }>("/capture/stop", {
      method: "POST",
    }),

  getNetworks: () => fetchApi<Record<string, NetworkInfo>>("/networks"),

  getRoutes: () => fetchApi<RouteEntry[]>("/routes"),

  getPackets: () => fetchApi<PacketEntry[]>("/packets"),

  getInterfaces: () => fetchApi<InterfacesResponse>("/interfaces"),

  getAarp: () => fetchApi<AarpResponse>("/aarp"),

  getNbp: () => fetchApi<NbpResponse>("/nbp"),
};

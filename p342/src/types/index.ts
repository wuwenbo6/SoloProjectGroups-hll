export interface ConnectRequest {
  host: string;
  port: number;
  username: string;
  password: string;
  namespace?: string;
  ssl_verify?: boolean;
}

export interface ProviderInfo {
  product: string;
  version: string;
  vendor: string;
}

export interface ConnectResponse {
  success: boolean;
  message: string;
  provider_info?: ProviderInfo;
}

export interface StatusResponse {
  connected: boolean;
  provider_info?: ProviderInfo;
  last_sync?: string;
}

export interface StoragePool {
  id: string;
  name: string;
  path: string;
  total_size_gb: number;
  used_size_gb: number;
  free_size_gb: number;
  pool_type: string;
  health_state: string;
  system_name: string;
}

export interface StorageVolume {
  id: string;
  name: string;
  path: string;
  size_gb: number;
  volume_type: string;
  health_state: string;
  pool_id: string;
  system_name: string;
}

export interface MaskingView {
  id: string;
  name: string;
  path: string;
  volume_id: string;
  volume_name: string;
  initiator_ids: string[];
  port_ids: string[];
  system_name: string;
}

export interface TopologyNode {
  id: string;
  label: string;
  type: "system" | "pool" | "volume" | "masking_view" | "initiator" | "port";
  status: string;
  properties: Record<string, string | number>;
}

export interface TopologyEdge {
  source: string;
  target: string;
  relation: "contains" | "allocates" | "exposes" | "maps_to" | "uses";
}

export interface TopologyResponse {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface CreateLUNRequest {
  pool_id: string;
  name: string;
  size_gb: number;
  purpose?: string;
}

export interface CreateLUNResponse {
  success: boolean;
  message: string;
  volume_id: string;
  volume_name: string;
}

export interface CreateMaskingViewRequest {
  volume_id: string;
  view_name: string;
  initiator_wwns: string[];
  port_wwns: string[];
}

export interface CreateMaskingViewResponse {
  success: boolean;
  message: string;
  view_id: string;
  view_name: string;
}

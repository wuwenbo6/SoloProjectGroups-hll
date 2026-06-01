export type RouterType = 'router' | 'source' | 'receiver';
export type MRouteType = 'starg' | 'sg';
export type TreeType = 'rpt' | 'spt';
export type PresetType = 'BASIC_RPT' | 'SPT_SWITCH' | 'MULTI_SOURCE' | 'PRUNE_LEAVE';

export interface Router {
  id: string;
  name: string;
  type: RouterType;
  x: number;
  y: number;
  is_rp: boolean;
}

export interface Link {
  id: string;
  router_a_id: string;
  router_b_id: string;
  interface_a_id: string;
  interface_b_id: string;
  cost: number;
}

export interface MRouteEntry {
  id: string;
  router_id: string;
  entry_type: MRouteType;
  group: string;
  source?: string;
  upstream_if: string | null;
  downstream_ifs: string[];
  expire: number;
}

export interface MulticastGroup {
  group_addr: string;
  rp_id: string | null;
  source_ids: string[];
  receiver_ids: string[];
}

export interface SimEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface Topology {
  routers: Router[];
  links: Link[];
}

export interface TrafficEdge {
  from: string;
  to: string;
  tree_type: TreeType;
}

export interface JoinRequest {
  router_id: string;
  group: string;
  source?: string;
  join_type: 'starg' | 'sg';
}

export interface PruneRequest {
  router_id: string;
  group: string;
  source?: string;
  prune_type: 'starg' | 'sg';
}

export interface SwitchSPTRequest {
  receiver_id: string;
  group: string;
  source_id: string;
}

export interface RegisterRequest {
  source_id: string;
  group: string;
  source_ip?: string;
  packet_source_ip?: string;
}

export interface RouteEntry {
  id: string;
  router_id: string;
  destination: string;
  next_hop: string;
  interface: string;
  metric: number;
  protocol: string;
}

export interface RPFCheckRequest {
  router_id: string;
  source_addr: string;
  incoming_if?: string;
}

export interface RPFCheckResult {
  passed: boolean;
  rpf_interface: string | null;
  source_addr: string;
  router_id: string;
  reason?: string;
}

export interface TopologyNode {
  id: string;
  type: 'switch' | 'host';
  name: string;
  x: number;
  y: number;
  ip?: string;
  mac?: string;
  dpid?: string;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  port1?: number;
  port2?: number;
}

export interface MatchFields {
  in_port?: number;
  eth_src?: string;
  eth_dst?: string;
  eth_type?: number;
  ip_src?: string;
  ip_dst?: string;
  ip_proto?: number;
  tp_src?: number;
  tp_dst?: number;
}

export interface FlowAction {
  type: 'OUTPUT' | 'DROP' | 'MODIFY' | 'FORWARD';
  port?: number;
  field?: string;
  value?: string;
}

export interface FlowRule {
  id: string;
  switchId: string;
  priority: number;
  match: MatchFields;
  actions: FlowAction[];
}

export interface PacketTrace {
  packet_id: string;
  src: string;
  dst: string;
  type: string;
  path: string[];
  hops: Array<{
    node: string;
    type: string;
    rule_matched?: boolean;
  }>;
  matched_rules: Array<{
    switch: string;
    rule: FlowRule;
  }>;
}

export interface SimulationStatus {
  running: boolean;
  stats: {
    nodes: number;
    links: number;
    flow_rules: number;
  };
}

export interface Topology {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  nodes: TopologyNode[];
  links: TopologyLink[];
}

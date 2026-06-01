export type OspfState = "Down" | "Init" | "2-Way" | "ExStart" | "Exchange" | "Loading" | "Full";

export type OspfPacketType = "Hello" | "DBD" | "LSR" | "LSU" | "LSAck";

export type OspfEvent = "send_hello" | "send_dbd" | "send_lsr" | "send_lsu" | "reset_neighbor" | "start_auto";

export interface PacketDetails {
  messageType: OspfPacketType;
  sourceRouter: string;
  destRouter: string;
  fields: Record<string, string | number | boolean>;
}

export interface RouterInfo {
  id: string;
  name: string;
  routerId: string;
  areaId: string;
  x: number;
  y: number;
}

export interface LinkInfo {
  from: string;
  to: string;
  state: OspfState;
  interfaceIp: string;
}

export interface RouterDetail {
  id: string;
  routerId: string;
  areaId: string;
  helloInterval: number;
  deadInterval: number;
  interfaces: InterfaceInfo[];
  lsdb: LsaSummary[];
  neighbors: NeighborInfo[];
  ipv6Prefixes: Ipv6Prefix[];
  routingTable: RouteEntry[];
}

export interface InterfaceInfo {
  name: string;
  address: string;
  state: string;
}

export interface LsaSummary {
  type: string;
  lsId: string;
  advRouter: string;
  sequence: number;
  age: number;
}

export interface NeighborInfo {
  routerId: string;
  state: OspfState;
  priority: number;
  dr: string;
  bdr: string;
  isMaster: boolean;
  ddSequenceNumber: number;
}

export interface Ipv6Prefix {
  prefix: string;
  prefixLen: number;
  metric: number;
  advRouter: string;
  nextHop: string;
  interface: string;
  routeType: string;
  age: number;
  sequence: number;
}

export interface RouteEntry {
  prefix: string;
  prefixLen: number;
  nextHop: string;
  interface: string;
  metric: number;
  routeType: string;
  advRouter: string;
  age: number;
  protocol: string;
}

export interface LogEntry {
  id: string;
  message: string;
  level: "info" | "warn" | "error";
  timestamp: number;
  type?: string;
  details?: PacketDetails;
}

export interface StateChange {
  routerId: string;
  neighborId: string;
  oldState: OspfState;
  newState: OspfState;
}

export const STATE_ORDER: OspfState[] = [
  "Down", "Init", "2-Way", "ExStart", "Exchange", "Loading", "Full"
];

export const STATE_COLORS: Record<OspfState, string> = {
  "Down": "#FF4757",
  "Init": "#FFB020",
  "2-Way": "#00B4D8",
  "ExStart": "#A855F7",
  "Exchange": "#F97316",
  "Loading": "#3B82F6",
  "Full": "#00FF88",
};

export const PACKET_COLORS: Record<OspfPacketType, string> = {
  "Hello": "#00FF88",
  "DBD": "#A855F7",
  "LSR": "#00B4D8",
  "LSU": "#FFB020",
  "LSAck": "#8899AA",
};

export function stateColor(state: OspfState): string {
  return STATE_COLORS[state] || "#8899AA";
}

export function packetColor(type: OspfPacketType): string {
  return PACKET_COLORS[type] || "#8899AA";
}

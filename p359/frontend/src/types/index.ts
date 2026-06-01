export type NodeMode = 'active' | 'passive';
export type LoopbackMode = 'none' | 'local_loopback' | 'remote_loopback';
export type DiscoveryState = 'idle' | 'in_progress' | 'completed' | 'failed';
export type LinkStatus = 'up' | 'down' | 'fault';
export type PDUType = 'discovery' | 'information' | 'event' | 'variable_request' | 'variable_response' | 'loopback_control';
export type EventType = 'info' | 'discovery' | 'pdu' | 'fault' | 'state_change';
export type EventSeverity = 'info' | 'warning' | 'error';
export type CriticalEventCause = 'unknown' | 'power_off' | 'reset' | 'generic_hardware_error' | 'generic_software_error' | 'port_state_change' | 'configuration_change';
export type DyingGaspCause = 'unknown' | 'power_failure' | 'overheating' | 'watchdog_reset' | 'fan_failure' | 'power_supply_failure' | 'hardware_failure' | 'software_crash';
export type ExportFormat = 'json' | 'csv';

export interface NodeConfig {
  id: string;
  name: string;
  mac_address: string;
  mode: NodeMode;
  loopback_mode: LoopbackMode;
}

export interface PDUFields {
  code: number;
  flags: number;
  type: number;
  payload: Record<string, any>;
}

export interface PDUData {
  id: string;
  timestamp: number;
  direction: 'sent' | 'received';
  type: PDUType;
  source_mac: string;
  dest_mac: string;
  source_node?: string;
  dest_node?: string;
  fields: PDUFields;
  raw_hex: string;
}

export interface OAMEvent {
  id: string;
  timestamp: number;
  type: EventType;
  severity: EventSeverity;
  message: string;
  details?: Record<string, any>;
}

export interface OAMState {
  simulation_running: boolean;
  discovery_state: DiscoveryState;
  link_status: LinkStatus;
  nodes: NodeConfig[];
  local_state: string;
  remote_state: string;
  local_mac: string;
  remote_mac: string;
}

export interface ServerMessage {
  type: string;
  timestamp: number;
  payload?: any;
}

export interface ClientMessage {
  type: string;
  payload?: Record<string, any>;
}

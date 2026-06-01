export type NodeStatus = 'idle' | 'listening' | 'sending' | 'conflict' | 'waiting' | 'success' | 'responding';

export type BusMode = 'csma' | 'modbus-rtu';

export type ModbusFunctionCode = 0x01 | 0x02 | 0x03 | 0x04 | 0x05 | 0x06 | 0x0F | 0x10;

export interface ModbusRequest {
  slaveId: number;
  functionCode: ModbusFunctionCode;
  startAddr: number;
  quantity: number;
}

export interface ModbusResponse {
  slaveId: number;
  functionCode: ModbusFunctionCode;
  dataLength: number;
  success: boolean;
}

export interface NodeConfig {
  id: string;
  name: string;
  sendInterval: number;
  dataLength: number;
  color: string;
  enabled: boolean;
  role: 'master' | 'slave';
  slaveId?: number;
  modbusPollInterval?: number;
}

export interface NodeState {
  id: string;
  status: NodeStatus;
  sendCount: number;
  conflictCount: number;
  retryCount: number;
  lastSendDelay: number;
  avgSendDelay: number;
  maxSendDelay: number;
  totalDelays: number;
  currentSendStart: number | null;
  modbusRequestCount?: number;
  modbusResponseCount?: number;
  modbusTimeoutCount?: number;
}

export interface BusConfig {
  baudRate: number;
  arbitrateWaitTime: number;
  maxRetries: number;
  collisionDetectTime: number;
  mode: BusMode;
  modbusTurnaroundDelay: number;
  modbusResponseTimeout: number;
}

export interface BusState {
  isBusy: boolean;
  currentSender: string | null;
  conflictDetected: boolean;
  isRunning: boolean;
  mode: BusMode;
}

export interface BusUtilizationSample {
  timestamp: number;
  utilization: number;
  busyTime: number;
  idleTime: number;
}

export interface BusUtilizationStats {
  currentUtilization: number;
  avgUtilization: number;
  peakUtilization: number;
  totalBusyTime: number;
  totalIdleTime: number;
  totalRuntime: number;
  samples: BusUtilizationSample[];
  perNodeStats: Record<string, {
    sendTime: number;
    sendCount: number;
    utilization: number;
  }>;
}

export interface TimelineEvent {
  id: string;
  nodeId: string;
  type: 'send_start' | 'send_end' | 'conflict' | 'retry' | 'listen_start' | 'listen_end' | 'modbus_request' | 'modbus_response' | 'modbus_timeout';
  timestamp: number;
  duration?: number;
  success?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  nodeId?: string;
  message: string;
}

export interface SimState {
  nodes: Record<string, NodeState>;
  nodeConfigs: Record<string, NodeConfig>;
  busConfig: BusConfig;
  busState: BusState;
  logs: LogEntry[];
  timeline: TimelineEvent[];
  startTime: number | null;
  currentTime: number;
}

export interface ExportData {
  exportTime: string;
  busConfig: BusConfig;
  busMode: BusMode;
  utilization: BusUtilizationStats;
  nodes: {
    config: NodeConfig;
    state: NodeState;
  }[];
  logs: LogEntry[];
}

export const DEFAULT_BUS_CONFIG: BusConfig = {
  baudRate: 9600,
  arbitrateWaitTime: 50,
  maxRetries: 5,
  collisionDetectTime: 20,
  mode: 'csma',
  modbusTurnaroundDelay: 10,
  modbusResponseTimeout: 100,
};

export const DEFAULT_NODE_COLORS = [
  '#165DFF',
  '#00B42A',
  '#FF7D00',
  '#F53F3F',
  '#722ED1',
  '#14C9C9',
  '#FF9A2E',
  '#EB0AA4',
];

export const createDefaultNodeConfig = (id: string, index: number): NodeConfig => ({
  id,
  name: `节点 ${index + 1}`,
  sendInterval: 1000 + Math.random() * 500,
  dataLength: 8 + Math.floor(Math.random() * 8),
  color: DEFAULT_NODE_COLORS[index % DEFAULT_NODE_COLORS.length],
  enabled: true,
  role: 'slave',
  slaveId: index + 1,
  modbusPollInterval: 500,
});

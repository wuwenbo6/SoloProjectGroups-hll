export interface MappingRule {
  id?: number;
  deviceName: string;
  registerType: string;
  registerAddress: number;
  dataType: string;
  opcuaNodeId: string;
  opcuaBrowseName: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpcuaNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  nodeClass: string;
  dataType?: string;
  value?: any;
  readOnly?: boolean;
  description?: string;
  children: OpcuaNode[];
}

export interface ServerStatus {
  running: boolean;
  endpointUrl: string;
  connectedClients: number;
  totalNodes: number;
  startTime: string | null;
}

export interface SystemConfig {
  opcuaPort: number;
  opcuaEndpoint: string;
  databasePath: string;
  autoStart: boolean;
  historyEnabled: boolean;
  historyRetentionDays: number;
  syncEnabled: boolean;
  syncIntervalMs: number;
}

export interface ExcelParseResult {
  success: boolean;
  data: MappingRule[];
  errors: string[];
}

export interface Device {
  id?: number;
  name: string;
  ipAddress: string;
  port: number;
  slaveId: number;
  description?: string;
  enabled: boolean;
  createdAt?: string;
}

export type RegisterType = 'Coil' | 'DiscreteInput' | 'InputRegister' | 'HoldingRegister';
export type DataType = 'Boolean' | 'Int16' | 'UInt16' | 'Int32' | 'UInt32' | 'Float' | 'Double';

export interface NodeHistory {
  id?: number;
  nodeId: string;
  browseName: string;
  value: string;
  quality: string;
  sourceTimestamp: string;
  createdAt?: string;
}

export interface SyncLog {
  id?: number;
  direction: 'UA_TO_MODBUS' | 'MODBUS_TO_UA';
  nodeId: string;
  registerType: string;
  registerAddress: number;
  oldValue?: string;
  newValue: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  errorMessage?: string;
  syncedAt?: string;
  createdAt?: string;
}

export interface HistoryQuery {
  nodeId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
}

export interface SyncStatus {
  enabled: boolean;
  lastSyncTime: string | null;
  pendingCount: number;
  successCount: number;
  failedCount: number;
}

export interface XmlExportConfig {
  includeDescription?: boolean;
  format?: 'xml' | 'csv' | 'json';
}

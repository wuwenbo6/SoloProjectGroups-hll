export type GSDMLVersion = '2.3' | '2.4' | 'unknown';

export interface GSDMLDevice {
  vendorId: string;
  vendorName: string;
  deviceId: string;
  deviceName: string;
  familyName: string;
  productId: string;
  version: string;
  gsdmlVersion: GSDMLVersion;
  modules: Module[];
  virtualModules?: VirtualModule[];
  slots?: Slot[];
  diagnostics?: DiagnosticInfo[];
  lldpConfig?: LLDPConfig;
}

export interface Module {
  id: string;
  name: string;
  type: 'module' | 'submodule' | 'io';
  description?: string;
  submodules?: Submodule[];
  ioData?: IOData[];
  info?: ModuleInfo;
  isVirtual?: boolean;
  allowedInSlots?: string[];
  diagnostics?: ChannelDiagnostic[];
}

export interface VirtualModule {
  id: string;
  name: string;
  description?: string;
  submodules: Submodule[];
  ioData?: IOData[];
}

export interface Submodule {
  id: string;
  name: string;
  description?: string;
  ioData?: IOData[];
  info?: ModuleInfo;
  isVirtual?: boolean;
  type?: 'standard' | 'virtual' | 'plug';
  diagnostics?: ChannelDiagnostic[];
}

export interface Slot {
  id: string;
  slotNumber: number;
  name: string;
  description?: string;
  allowedModules: string[];
  subslots?: Subslot[];
  isFixed?: boolean;
  isPlugable?: boolean;
}

export interface Subslot {
  id: string;
  subslotNumber: number;
  name: string;
  description?: string;
  allowedSubmodules: string[];
}

export interface IOData {
  id: string;
  name: string;
  direction: 'input' | 'output';
  length: number;
  unit?: string;
  byteOffset?: number;
  bitOffset?: number;
  dataType?: string;
  diagnosticChannel?: string;
}

export interface ModuleInfo {
  category?: string;
  minSlots?: number;
  maxSlots?: number;
  minSubslots?: number;
  maxSubslots?: number;
}

export interface DiagnosticInfo {
  id: string;
  name: string;
  type: 'device' | 'module' | 'submodule' | 'channel';
  severity: 'info' | 'warning' | 'error' | 'fault';
  description?: string;
  helpText?: string;
  channelDiagnostics?: ChannelDiagnostic[];
}

export interface ChannelDiagnostic {
  id: string;
  channelNumber: number;
  channelName: string;
  type: 'digital' | 'analog' | 'communication' | 'power' | 'temperature';
  supportedCodes: DiagnosticCode[];
  direction?: 'input' | 'output';
}

export interface DiagnosticCode {
  code: string;
  name: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'fault';
}

export interface LLDPConfig {
  enabled: boolean;
  portConfigs?: LLDPPortConfig[];
  deviceInfo: LLDPDeviceInfo;
}

export interface LLDPDeviceInfo {
  chassisId: string;
  chassisIdType: 'mac' | 'ip' | 'name' | 'local';
  systemName?: string;
  systemDescription?: string;
  systemCapabilities?: string[];
}

export interface LLDPPortConfig {
  portId: string;
  portIdType: 'mac' | 'ip' | 'name' | 'local' | 'ifAlias';
  portDescription?: string;
  enabled: boolean;
  ttl?: number;
  managementAddress?: string;
}

export interface TopologyNode {
  deviceId: string;
  deviceName: string;
  ipAddress?: string;
  macAddress?: string;
  ports: TopologyPort[];
}

export interface TopologyPort {
  portId: string;
  portName: string;
  isConnected: boolean;
  connectedTo?: {
    remoteDeviceId: string;
    remoteDeviceName?: string;
    remotePortId: string;
    remotePortName?: string;
  };
  lldpNeighbors?: LLDPNeighbor[];
}

export interface LLDPNeighbor {
  chassisId: string;
  portId: string;
  systemName?: string;
  systemDescription?: string;
  portDescription?: string;
  ttl?: number;
  managementAddress?: string;
}

export interface DeviceConfig {
  deviceName: string;
  ipAddress: string;
  subnetMask: string;
  gateway: string;
  stationName: string;
  selectedModules: string[];
  slotConfiguration?: SlotConfig[];
  lldpEnabled?: boolean;
  diagnosticEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SlotConfig {
  slotId: string;
  slotNumber: number;
  moduleId: string;
  subslotConfigs?: SubslotConfig[];
}

export interface SubslotConfig {
  subslotId: string;
  subslotNumber: number;
  submoduleId: string;
}

export interface ProjectFile {
  projectVersion: '1.0';
  projectName: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  devices: ProjectDevice[];
  topology?: TopologyData;
}

export interface ProjectDevice {
  id: string;
  deviceName: string;
  gsdmlInfo: {
    vendorId: string;
    deviceId: string;
    productId: string;
    version: string;
    gsdmlVersion: GSDMLVersion;
  };
  networkConfig: {
    ipAddress: string;
    subnetMask: string;
    gateway: string;
    stationName: string;
  };
  moduleConfiguration: {
    slotNumber: number;
    moduleId: string;
    subslotNumber?: number;
    submoduleId?: string;
  }[];
  lldpConfig?: LLDPConfig;
  diagnosticConfig?: {
    enabled: boolean;
    monitoredChannels?: string[];
  };
}

export interface TopologyData {
  nodes: TopologyNode[];
  connections: TopologyConnection[];
}

export interface TopologyConnection {
  id: string;
  fromDevice: string;
  fromPort: string;
  toDevice: string;
  toPort: string;
  type: 'direct' | 'lldp' | 'manual';
}

export interface TreeNode {
  id: string;
  name: string;
  type: 'device' | 'module' | 'submodule' | 'io' | 'input' | 'output' | 'slot' | 'virtual' | 'diagnostic' | 'lldp';
  children?: TreeNode[];
  data?: Module | Submodule | IOData | GSDMLDevice | Slot | VirtualModule | DiagnosticInfo | LLDPConfig;
  expanded?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ParsedGSDML {
  device: GSDMLDevice;
  rawXml: string;
  parsedAt: string;
  gsdmlVersion: GSDMLVersion;
}

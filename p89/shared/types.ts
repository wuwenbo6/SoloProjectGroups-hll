export interface VirtualMachine {
  vmid: number;
  name: string;
  node: string;
  status: 'running' | 'stopped' | 'paused';
  cpu: number;
  memory: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  netin: number;
  netout: number;
  uptime: number;
  template?: boolean;
}

export interface ClusterNode {
  node: string;
  status: 'online' | 'offline';
  cpu: number;
  mem: number;
  maxcpu: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  level?: string;
  id?: string;
  ip?: string;
  local?: number;
}

export interface Snapshot {
  name: string;
  description: string;
  time: number;
  vmstate: boolean;
  parent: string;
  snaptime?: number;
}

export interface OperationLog {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  resourceId: string;
  status: 'success' | 'failed';
  message: string;
}

export interface CreateVMParams {
  node: string;
  vmid?: number;
  name: string;
  cores: number;
  memory: number;
  disk: number;
  ostype: string;
  net0?: string;
  ide0?: string;
  scsi0?: string;
}

export interface MigrateParams {
  target: string
  online?: boolean
  withlocaldisks?: boolean
  migration_network?: string
  bwlimit?: number
  maxRetries?: number
  retryDelay?: number
}

export interface CloneParams {
  newid: number
  name?: string
  target?: string
  full?: boolean
  storage?: string
  format?: string
}

export interface AutoScalerConfig {
  enabled: boolean
  minVMs: number
  maxVMs: number
  scaleUpThreshold: number
  scaleDownThreshold: number
  scaleUpCooldown: number
  scaleDownCooldown: number
  templateVMID: number
  templateNode: string
  targetNode: string
  checkInterval: number
  cpuAverageWindow: number
}

export interface ScalingEvent {
  timestamp: number
  action: 'scale_up' | 'scale_down'
  vmid?: number
  reason: string
  avgCPU: number
}

export interface NodeStatus {
  node: string;
  cpu: number;
  memory: {
    used: number;
    total: number;
    free: number;
  };
  rootfs: {
    used: number;
    total: number;
    avail: number;
  };
  swap: {
    used: number;
    total: number;
    free: number;
  };
  loadavg: number[];
  uptime: number;
  kversion: string;
  pveversion: string;
}

export interface ResourceUsage {
  timestamp: number;
  cpu: number;
  memory: number;
  disk: number;
  networkIn: number;
  networkOut: number;
}

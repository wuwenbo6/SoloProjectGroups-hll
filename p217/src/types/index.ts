export interface Vnfd {
  id: string;
  name: string;
  type: "firewall" | "vrouter";
  description: string;
  defaultCpu: number;
  defaultMemory: number;
  defaultBandwidth: number;
  icon: string;
  dependsOn?: string[];
}

export interface VnfInstance {
  id: string;
  vnfdId: string;
  name: string;
  type: "firewall" | "vrouter";
  status: "instantiating" | "running" | "scaling" | "terminating" | "stopped" | "error" | "waiting";
  cpu: number;
  memory: number;
  bandwidth: number;
  replicaCount: number;
  positionX: number;
  positionY: number;
  createdAt: string;
  updatedAt: string;
  dependsOn?: string[];
}

export interface RouteEntry {
  destinationCidr: string;
  nextHopIp: string;
  interfaceName: string;
  metric: number;
  protocol: string;
}

export interface RouteTable {
  vnfId: string;
  entries: RouteEntry[];
  version: number;
  lastUpdated: string;
}

export interface VirtualLink {
  id: string;
  sourceId: string;
  targetId: string;
  bandwidth: number;
  status: "active" | "inactive";
  latency: number;
}

export interface Event {
  id: string;
  type: "info" | "warning" | "error";
  message: string;
  vnfId?: string;
  timestamp: string;
}

export interface Stats {
  totalVnfs: number;
  runningVnfs: number;
  stoppedVnfs: number;
  errorVnfs: number;
  totalCpu: number;
  totalMemory: number;
  totalBandwidth: number;
}

export interface InstantiateRequest {
  vnfdId: string;
  name: string;
  cpu?: number;
  memory?: number;
  bandwidth?: number;
  replicaCount?: number;
  positionX: number;
  positionY: number;
  dependsOn?: string[];
}

export interface BatchInstantiateRequest {
  vnfs: InstantiateRequest[];
}

export interface ScaleRequest {
  replicaCount: number;
  cpu?: number;
  memory?: number;
  bandwidth?: number;
}

export interface CreateLinkRequest {
  sourceId: string;
  targetId: string;
  bandwidth: number;
}

export interface TopologySortResult {
  order: string[];
  dependencies: Record<string, string>;
}

export interface AutoScalingConfig {
  vnfId: string;
  minReplicas: number;
  maxReplicas: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownSeconds: number;
  enabled: boolean;
  lastScalingAt: string;
}

export interface VnfMetrics {
  vnfId: string;
  cpuUsage: number;
  memoryUsage: number;
  networkIn: number;
  networkOut: number;
  timestamp: string;
}

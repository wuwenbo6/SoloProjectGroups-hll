export type ServiceType = "printer" | "airplay" | "homekit" | "http" | "chromecast" | "nfs" | "smb" | "other";
export type ServiceStatus = "online" | "offline";

export interface Subnet {
  id: string;
  name: string;
  cidr: string;
  color: string;
  interface: string;
  serviceCount: number;
  lastSeen: string;
}

export interface MDnsService {
  id: string;
  name: string;
  type: ServiceType;
  subtype: string;
  ip: string;
  port: number;
  txtRecords: Record<string, string>;
  status: ServiceStatus;
  discoveredAt: string;
  subnetId: string;
  ttl: number;
  ttlRemaining: number;
  authorized: boolean;
}

export interface AuthPolicy {
  allowedTypes: ServiceType[];
  allowUnauthorized: boolean;
}

export interface ServiceExport {
  services: MDnsService[];
  records: Record<string, ServiceRecords>;
  exportedAt: string;
  count: number;
}

export interface SRVRecord {
  target: string;
  port: number;
  priority: number;
  weight: number;
}

export interface ServiceRecords {
  ptr: string;
  srv: SRVRecord;
  txt: Record<string, string>;
}

export interface ReflectorStatus {
  status: "running" | "stopped";
  uptime: number;
  packetsForwarded: number;
  activeInterfaces: string[];
  startedAt: string;
}

export type WSEventType = "service_discovered" | "service_lost" | "reflector_stats" | "ttl_expired";

export interface WSEvent {
  type: WSEventType;
  service?: MDnsService;
  serviceId?: string;
  subnetId?: string;
  packetsForwarded?: number;
  uptime?: number;
}

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  printer: "Printer",
  airplay: "AirPlay",
  homekit: "HomeKit",
  http: "HTTP",
  chromecast: "Chromecast",
  nfs: "NFS",
  smb: "SMB",
  other: "Other",
};

export const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  printer: "#00d4ff",
  airplay: "#ff6b9d",
  homekit: "#ff9f1c",
  http: "#a78bfa",
  chromecast: "#4ade80",
  nfs: "#f97316",
  smb: "#06b6d4",
  other: "#94a3b8",
};

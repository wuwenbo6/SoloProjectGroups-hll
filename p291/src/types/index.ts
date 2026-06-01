export interface VarBind {
  oid: string
  value_type: string
  value: string
}

export interface SnmpTrap {
  id: string
  trap_id: string
  timestamp: string
  source_ip: string
  source_port: number
  snmp_version: "v2c" | "v3" | "v1"
  community?: string
  trap_oid: string
  variable_bindings: VarBind[]
  raw_pdu: string
  is_duplicate?: boolean
}

export interface V3User {
  username: string
  auth_protocol: "MD5" | "SHA" | "NONE"
  auth_key: string
  priv_protocol: "DES" | "AES" | "NONE"
  priv_key: string
}

export interface ForwardTarget {
  id: string
  type: "syslog" | "http"
  enabled: boolean
  name: string
  host?: string
  port?: number
  protocol?: string
  url?: string
  method?: "POST" | "GET"
  format: "syslog" | "json"
  facility: number
  severity: number
}

export interface OidMapping {
  oid: string
  name: string
  description?: string
}

export interface SnmpConfig {
  listen_port: number
  v2c_communities: string[]
  v3_users: V3User[]
  forward_targets: ForwardTarget[]
  oid_mappings: OidMapping[]
}

export interface ServiceStatus {
  listening: boolean
  listen_port: number
  trap_count: number
  duplicate_count: number
  uptime: number
}

export interface TrapListResponse {
  traps: SnmpTrap[]
  total: number
}

export interface EngineIdDiscoveryRequest {
  target_ip: string
  target_port?: number
}

export interface EngineIdDiscoveryResponse {
  success: boolean
  engine_id?: string
  engine_id_hex?: string
  error?: string
}

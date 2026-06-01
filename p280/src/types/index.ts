export interface TerminalAlias {
  h323_id: string
  e164: string
}

export interface Terminal {
  id: string
  aliases: TerminalAlias
  signaling_address: string
  signaling_port: number
  ras_address: string
  registration_time: string
  status: "online" | "offline"
  time_to_live: number
  last_irr_time: string | null
}

export interface AdmissionRequest {
  id: string
  caller_alias: string
  callee_alias: string
  callee_routed_to: string | null
  bandwidth: number
  call_type: "point_to_point" | "multipoint"
  status: "pending" | "confirmed" | "rejected"
  request_time: string
  response_time?: string
  reject_reason?: string
}

export interface RASMessage {
  id: string
  type: "GRQ" | "GCF" | "GRJ" | "RRQ" | "RCF" | "RRJ" | "ARQ" | "ACF" | "ARJ" | "IRQ" | "IRR" | "IRR_TIMEOUT" | "URQ" | "UCF" | "BRQ" | "BCF" | "BRJ"
  direction: "inbound" | "outbound"
  source: string
  destination: string
  timestamp: string
  payload: Record<string, unknown>
}

export interface GatekeeperInfo {
  id: string
  name: string
  status: "running" | "stopped"
  total_bandwidth: number
  used_bandwidth: number
  registered_count: number
  active_calls: number
  irq_interval: number
  irq_timeout: number
}

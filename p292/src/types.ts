export type AccessTechType = 'ethernet' | 'wifi' | 'lte' | '5g'
export type QoSTrafficClass = 'EF' | 'AF4' | 'AF3' | 'AF2' | 'AF1' | 'BE' | 'VOICE' | 'VIDEO' | 'DATA' | 'SIGNAL'

export const ACCESS_TECH_PRIORITY: Record<AccessTechType, { label: string; priority: number; color: string }> = {
  '5g': { label: '5G', priority: 4, color: 'bg-violet-500/20 text-violet-400' },
  'lte': { label: 'LTE', priority: 3, color: 'bg-lma-blue/20 text-lma-blue' },
  'wifi': { label: 'WiFi', priority: 2, color: 'bg-lma-accent/20 text-lma-accent' },
  'ethernet': { label: 'Ethernet', priority: 1, color: 'bg-lma-muted/20 text-lma-muted' },
}

export const QOS_CLASS_INFO: Record<QoSTrafficClass, {
  label: string
  dscp: number
  priority: number
  color: string
  description: string
}> = {
  'EF': { label: 'EF', dscp: 46, priority: 10, color: 'bg-red-500/20 text-red-400', description: 'Expedited Forwarding - 语音' },
  'VOICE': { label: 'VOICE', dscp: 46, priority: 10, color: 'bg-red-500/20 text-red-400', description: '语音流' },
  'SIGNAL': { label: 'SIGNAL', dscp: 40, priority: 9, color: 'bg-amber-500/20 text-amber-400', description: '信令流' },
  'VIDEO': { label: 'VIDEO', dscp: 34, priority: 8, color: 'bg-orange-500/20 text-orange-400', description: '视频流' },
  'AF4': { label: 'AF4', dscp: 32, priority: 7, color: 'bg-orange-500/20 text-orange-400', description: '视频/流媒体' },
  'AF3': { label: 'AF3', dscp: 24, priority: 5, color: 'bg-yellow-500/20 text-yellow-400', description: '游戏' },
  'AF2': { label: 'AF2', dscp: 16, priority: 4, color: 'bg-lime-500/20 text-lime-400', description: '流媒体' },
  'DATA': { label: 'DATA', dscp: 8, priority: 3, color: 'bg-green-500/20 text-green-400', description: '数据流' },
  'AF1': { label: 'AF1', dscp: 8, priority: 2, color: 'bg-green-500/20 text-green-400', description: '浏览' },
  'BE': { label: 'BE', dscp: 0, priority: 1, color: 'bg-slate-500/20 text-slate-400', description: '默认' },
}

export interface FlowMapping {
  flow_id: string
  traffic_class: QoSTrafficClass
  dscp: number
  max_bandwidth_kbps: number
  min_bandwidth_kbps: number
  max_latency_ms: number
  max_jitter_ms: number
  max_packet_loss_rate: number
  priority: number
}

export interface QoSProfile {
  profile_id: string
  name: string
  flow_mappings: FlowMapping[]
  negotiated: boolean
  granted: boolean
  reason?: string
}

export interface PBURequest {
  mn_id: string
  mn_prefix: string
  mag_address: string
  lifetime: number
  access_tech_type: AccessTechType
  qos_classes?: QoSTrafficClass[]
}

export interface PBAResponse {
  status: number
  message: string
  mn_id?: string
  mn_prefix?: string
  mag_address?: string
  lifetime?: number
  tunnel_priority?: number
  handover?: boolean
  old_mag?: string
  qos_profile?: QoSProfile
}

export interface BCEEntry {
  mn_id: string
  mn_prefix: string
  mag_address: string
  access_tech_type: AccessTechType
  tunnel_priority: number
  lifetime: number
  registered_at: string
  expires_at: string
  qos_profile?: QoSProfile
}

export interface EventLog {
  timestamp: string
  event_type: string
  mn_id: string
  mag_address: string
  detail: string
}

export interface TunnelState {
  mn_id: string
  old_mag: string
  new_mag: string
  old_tech: string
  new_tech: string
  status: string
  buffered_packets: number
  created_at: string
  expires_at: string
}

export interface BindingUpdateRecord {
  id: string
  timestamp: string
  mn_id: string
  mn_prefix: string
  old_mag_address?: string
  new_mag_address: string
  old_access_tech?: AccessTechType
  new_access_tech: AccessTechType
  lifetime: number
  operation: 'register' | 'update' | 'handover' | 'deregister'
  qos_profile?: QoSProfile
  status: 'success' | 'rejected'
  message: string
}

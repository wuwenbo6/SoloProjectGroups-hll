export interface Port {
  id: string
  subtype: string
  description: string
  speedMbps: number
  utilization: number
  inOctets: number
  outOctets: number
  lastUpdated: string
}

export interface TLV {
  type: number
  typeName: string
  value: string
}

export interface Capabilities {
  available: string[]
  enabled: string[]
}

export type DeviceRole = "router" | "switch" | "wlan" | "station" | "other"

export interface Device {
  id: string
  chassisId: string
  chassisIdSubtype: string
  systemName: string
  systemDescription: string
  managementAddress: string
  ports: Port[]
  ttl: number
  tlvs: TLV[]
  capabilities: Capabilities
  lastSeen: string
  status: "online" | "offline"
}

export interface Link {
  id: string
  sourceDeviceId: string
  sourcePortId: string
  targetDeviceId: string
  targetPortId: string
}

export interface TopologyData {
  devices: Device[]
  links: Link[]
}

export interface WSMessage {
  type: string
  data: TopologyData
}

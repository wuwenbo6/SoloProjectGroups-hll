export type DeviceStatus = 'sleeping' | 'waking' | 'sending' | 'recharging'

export interface EnergyHistoryPoint {
  simulatedTime: number
  energyLevel: number
  lightIntensity: number
}

export interface GPDevice {
  deviceId: string
  status: DeviceStatus
  energyLevel: number
  harvestRate: number
  threshold: number
  sequenceNumber: number
  totalFramesSent: number
  createdAt: number
  lastActiveAt: number
  signalStrength: number
  energyHistory: EnergyHistoryPoint[]
  currentLightIntensity: number
}

export type GPFrameType = 'notification' | 'commissioning' | 'decommissioning' | 'success' | 'channel_request'

export interface GPFrame {
  id: string
  deviceId: string
  frameType: GPFrameType
  payload: string
  securityLevel: number
  sequenceNumber: number
  timestamp: number
  rssi: number
  channel: number
  collision: boolean
  retransmitted: boolean
  retryCount: number
}

export interface VirtualClock {
  simulatedTime: number
  realTime: number
  speedMultiplier: number
  isRunning: boolean
  formattedTime: string
}

export interface LightModel {
  baseIntensity: number
  currentIntensity: number
  timeOfDay: number
  cloudFactor: number
  isDaytime: boolean
}

export interface SimulationConfig {
  deviceCount: number
  harvestRateMultiplier: number
  energyThreshold: number
  clockSpeedMultiplier: number
}

export interface SimulationStatus {
  running: boolean
  deviceCount: number
  elapsedTime: number
  totalFramesSent: number
  config: SimulationConfig
  virtualClock: VirtualClock
  lightModel: LightModel
  collisionStats: CollisionStats
}

export interface CollisionStats {
  totalCollisions: number
  totalRetries: number
  collisionRate: number
  channelCollisions: Record<number, number>
  deviceCollisions: Record<string, number>
}

export interface EnergyPredictionPoint {
  simulatedTime: number
  predictedEnergy: number
  predictedLight: number
  confidence: number
}

export interface DeviceEnergyReport {
  deviceId: string
  totalEnergyHarvested: number
  totalEnergyConsumed: number
  averageHarvestRate: number
  framesSent: number
  collisions: number
  prediction: EnergyPredictionPoint[]
  efficiencyScore: number
}

export interface EnergyReport {
  generatedAt: number
  simulationDuration: number
  devices: DeviceEnergyReport[]
  summary: {
    totalEnergyHarvested: number
    totalEnergyConsumed: number
    totalFramesSent: number
    totalCollisions: number
    averageEfficiency: number
  }
}

export interface EnergyUpdate {
  deviceId: string
  energyLevel: number
  status: DeviceStatus
  harvestRate: number
  lightIntensity: number
  simulatedTime: number
}

export type WSMessageType = 'device_state' | 'gp_frame' | 'simulation_status' | 'energy_update' | 'clock_update' | 'light_update' | 'collision_update' | 'error'

export interface WSMessage {
  type: WSMessageType
  payload: GPDevice | GPFrame | SimulationStatus | EnergyUpdate | VirtualClock | LightModel | CollisionStats | { message: string }
}

export interface WSCommandStart {
  type: 'start'
}

export interface WSCommandPause {
  type: 'pause'
}

export interface WSCommandReset {
  type: 'reset'
}

export interface WSCommandSetConfig {
  type: 'set_config'
  payload: Partial<SimulationConfig>
}

export type WSCommand = WSCommandStart | WSCommandPause | WSCommandReset | WSCommandSetConfig

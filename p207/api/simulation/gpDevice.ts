import type { DeviceStatus, GPDevice, GPFrame, GPFrameType, EnergyHistoryPoint } from '../../shared/types.js'

const FRAME_TYPES: GPFrameType[] = ['notification', 'commissioning', 'decommissioning', 'success', 'channel_request']
const ZIGBEE_CHANNELS = [11, 15, 20, 25]
const GP_SECURITY_LEVELS = [0, 1, 2, 3]
const MAX_HISTORY_POINTS = 100
const ENERGY_CONVERSION_EFFICIENCY = 0.15

function randomHex(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += Math.floor(Math.random() * 16).toString(16).toUpperCase().padStart(1, '0')
  }
  return result
}

export class GpDeviceSimulator {
  device: GPDevice
  private onStateChange: (device: GPDevice) => void
  private onFrameSent: (frame: GPFrame, channel: number) => void
  private harvestRateMultiplier: number
  private energyConversionEfficiency: number

  constructor(
    deviceId: string,
    onStateChange: (device: GPDevice) => void,
    onFrameSent: (frame: GPFrame, channel: number) => void,
    harvestRateMultiplier: number = 1.0,
    threshold: number = 80
  ) {
    this.onStateChange = onStateChange
    this.onFrameSent = onFrameSent
    this.harvestRateMultiplier = harvestRateMultiplier
    this.energyConversionEfficiency = ENERGY_CONVERSION_EFFICIENCY

    this.device = {
      deviceId,
      status: 'sleeping',
      energyLevel: Math.random() * 10,
      harvestRate: 1 + Math.random() * 2,
      threshold,
      sequenceNumber: 0,
      totalFramesSent: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      signalStrength: -40 - Math.random() * 40,
      energyHistory: [],
      currentLightIntensity: 0,
    }
  }

  tick(lightIntensity: number, simulatedTimeMs: number, deltaSimulatedMs: number): void {
    const d = this.device
    const now = Date.now()

    d.currentLightIntensity = lightIntensity

    switch (d.status) {
      case 'sleeping':
      case 'recharging': {
        const harvestedEnergy = this.calculateHarvestedEnergy(lightIntensity, deltaSimulatedMs)
        d.energyLevel = Math.min(100, Math.max(0, d.energyLevel + harvestedEnergy))

        this.recordEnergyHistory(simulatedTimeMs, lightIntensity)

        if (d.energyLevel >= d.threshold) {
          d.status = 'waking'
          d.lastActiveAt = now
          this.onStateChange({ ...d })
        } else if (Math.random() < 0.05) {
          this.onStateChange({ ...d })
        }
        break
      }

      case 'waking': {
        const wakeEnergyCost = 3 + Math.random() * 2
        d.energyLevel = Math.max(0, d.energyLevel - wakeEnergyCost)

        if (d.energyLevel < d.threshold * 0.5) {
          d.status = 'recharging'
          this.onStateChange({ ...d })
          return
        }

        d.status = 'sending'
        d.lastActiveAt = now
        this.onStateChange({ ...d })
        break
      }

      case 'sending': {
        const sendEnergyCost = 50 + Math.random() * 30
        d.energyLevel = Math.max(0, d.energyLevel - sendEnergyCost)

        const channel = ZIGBEE_CHANNELS[Math.floor(Math.random() * ZIGBEE_CHANNELS.length)]
        const frame = this.buildFrame(simulatedTimeMs)
        d.sequenceNumber++
        d.totalFramesSent++
        d.status = d.energyLevel <= 5 ? 'recharging' : 'sleeping'
        d.lastActiveAt = now
        d.signalStrength = -40 - Math.random() * 40

        this.recordEnergyHistory(simulatedTimeMs, lightIntensity)
        this.onFrameSent(frame, channel)
        this.onStateChange({ ...d })
        break
      }
    }
  }

  private calculateHarvestedEnergy(lightIntensity: number, deltaSimulatedMs: number): number {
    const normalizedLight = lightIntensity / 100
    const timeSeconds = deltaSimulatedMs / 1000
    const baseHarvest = normalizedLight * this.device.harvestRate * timeSeconds
    return baseHarvest * this.harvestRateMultiplier * this.energyConversionEfficiency * 10
  }

  private recordEnergyHistory(simulatedTimeMs: number, lightIntensity: number): void {
    const historyPoint: EnergyHistoryPoint = {
      simulatedTime: simulatedTimeMs,
      energyLevel: this.device.energyLevel,
      lightIntensity,
    }

    this.device.energyHistory.push(historyPoint)

    if (this.device.energyHistory.length > MAX_HISTORY_POINTS) {
      this.device.energyHistory = this.device.energyHistory.slice(-MAX_HISTORY_POINTS)
    }
  }

  private buildFrame(timestamp: number): GPFrame {
    const d = this.device
    const frameType = FRAME_TYPES[Math.floor(Math.random() * FRAME_TYPES.length)]
    const applicationId = randomHex(4)
    const commandId = randomHex(2)
    const data = randomHex(Math.floor(Math.random() * 8) + 4)
    const payload = applicationId + commandId + data

    return {
      id: `frame-${d.deviceId}-${d.sequenceNumber}`,
      deviceId: d.deviceId,
      frameType,
      payload,
      securityLevel: GP_SECURITY_LEVELS[Math.floor(Math.random() * GP_SECURITY_LEVELS.length)],
      sequenceNumber: d.sequenceNumber,
      timestamp,
      rssi: d.signalStrength,
      channel: ZIGBEE_CHANNELS[Math.floor(Math.random() * ZIGBEE_CHANNELS.length)],
      collision: false,
      retransmitted: false,
      retryCount: 0,
    }
  }

  reset(): void {
    this.device.status = 'sleeping'
    this.device.energyLevel = Math.random() * 10
    this.device.sequenceNumber = 0
    this.device.totalFramesSent = 0
    this.device.lastActiveAt = Date.now()
    this.device.energyHistory = []
    this.device.currentLightIntensity = 0
  }

  setHarvestRateMultiplier(multiplier: number): void {
    this.harvestRateMultiplier = multiplier
  }

  setThreshold(threshold: number): void {
    this.device.threshold = threshold
  }
}

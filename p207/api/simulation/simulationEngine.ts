import type { GPDevice, GPFrame, SimulationConfig, SimulationStatus, VirtualClock, LightModel, CollisionStats, EnergyReport } from '../../shared/types.js'
import { GpDeviceSimulator } from './gpDevice.js'
import { VirtualClockSimulator } from './virtualClock.js'
import { LightModelSimulator } from './lightModel.js'
import { ChannelManager } from './channelManager.js'
import { EnergyPredictor } from './energyPredictor.js'

const DEFAULT_CONFIG: SimulationConfig = {
  deviceCount: 4,
  harvestRateMultiplier: 1.0,
  energyThreshold: 80,
  clockSpeedMultiplier: 60,
}

export class SimulationEngine {
  private devices: Map<string, GpDeviceSimulator> = new Map()
  private allFrames: GPFrame[] = []
  private running = false
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private config: SimulationConfig = { ...DEFAULT_CONFIG }
  private totalFramesSent = 0
  private startTime = 0
  private broadcastCallbacks: Map<string, (type: string, payload: unknown) => void> = new Map()
  private virtualClock: VirtualClockSimulator
  private lightModel: LightModelSimulator
  private channelManager: ChannelManager
  private lastSimulatedTimeMs: number = 0
  private statusInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.virtualClock = new VirtualClockSimulator(DEFAULT_CONFIG.clockSpeedMultiplier, 6)
    this.lightModel = new LightModelSimulator()
    this.channelManager = new ChannelManager()
    this.initializeDevices()
  }

  private initializeDevices() {
    const existingIds = Array.from(this.devices.keys())
    const targetCount = this.config.deviceCount

    while (existingIds.length > targetCount) {
      const id = existingIds.pop()
      if (id) {
        const device = this.devices.get(id)
        device?.reset()
        this.devices.delete(id)
      }
    }

    while (existingIds.length < targetCount) {
      const deviceId = `GP-${(existingIds.length + 1).toString().padStart(3, '0')}`
      if (!this.devices.has(deviceId)) {
        const device = new GpDeviceSimulator(
          deviceId,
          (deviceState) => this.broadcast('device_state', deviceState),
          (frame, channel) => this.handleFrame(frame, channel),
          this.config.harvestRateMultiplier,
          this.config.energyThreshold
        )
        this.devices.set(deviceId, device)
      }
      existingIds.push(deviceId)
    }
  }

  private handleFrame(frame: GPFrame, channel: number) {
    const simulatedTime = this.virtualClock.getSimulatedTimeMs()
    const result = this.channelManager.requestTransmission(frame.deviceId, channel, simulatedTime)

    frame.channel = channel
    frame.collision = result.collision
    frame.retransmitted = result.retryCount > 0
    frame.retryCount = result.retryCount

    if (result.success) {
      this.allFrames.push(frame)
      if (this.allFrames.length > 200) {
        this.allFrames = this.allFrames.slice(-200)
      }
      this.totalFramesSent++
      this.channelManager.completeTransmission(frame.deviceId)
      this.broadcast('gp_frame', frame)
    } else if (result.shouldRetry) {
      this.broadcast('gp_frame', frame)
    }

    this.broadcast('collision_update', this.channelManager.getStats())
  }

  addBroadcastListener(id: string, callback: (type: string, payload: unknown) => void) {
    this.broadcastCallbacks.set(id, callback)
  }

  removeBroadcastListener(id: string) {
    this.broadcastCallbacks.delete(id)
  }

  private broadcast(type: string, payload: unknown) {
    for (const callback of this.broadcastCallbacks.values()) {
      try {
        callback(type, payload)
      } catch {
        // ignore errors
      }
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.startTime = Date.now()
    this.lastSimulatedTimeMs = this.virtualClock.getSimulatedTimeMs()
    this.virtualClock.start()

    this.tickInterval = setInterval(() => this.tick(), 100)

    this.statusInterval = setInterval(() => {
      this.broadcast('simulation_status', this.getStatus())
      this.broadcast('clock_update', this.virtualClock.getClockState())
      this.broadcast('light_update', this.lightModel.getState())
      this.broadcast('collision_update', this.channelManager.getStats())
    }, 500)

    this.broadcast('simulation_status', this.getStatus())
  }

  pause() {
    this.running = false
    this.virtualClock.pause()
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }
    this.broadcast('simulation_status', this.getStatus())
  }

  reset() {
    this.pause()
    this.totalFramesSent = 0
    this.allFrames = []
    this.virtualClock.reset()
    this.lightModel.reset()
    this.channelManager.reset()
    this.lastSimulatedTimeMs = 0

    for (const device of this.devices.values()) {
      device.reset()
      this.broadcast('device_state', device.device)
    }

    this.broadcast('simulation_status', this.getStatus())
    this.broadcast('clock_update', this.virtualClock.getClockState())
    this.broadcast('light_update', this.lightModel.getState())
    this.broadcast('collision_update', this.channelManager.getStats())
  }

  private tick() {
    if (!this.running) return

    const simulatedTimeMs = this.virtualClock.tick()
    const deltaSimulatedMs = simulatedTimeMs - this.lastSimulatedTimeMs
    this.lastSimulatedTimeMs = simulatedTimeMs

    this.channelManager.cleanupOldTransmissions(simulatedTimeMs)

    const timeOfDay = this.virtualClock.getTimeOfDay()
    const lightIntensity = this.lightModel.update(timeOfDay, deltaSimulatedMs)

    for (const device of this.devices.values()) {
      device.tick(lightIntensity, simulatedTimeMs, deltaSimulatedMs)
    }
  }

  getDevices(): GPDevice[] {
    return Array.from(this.devices.values()).map((d) => d.device)
  }

  getAllFrames(): GPFrame[] {
    return this.allFrames
  }

  getFramesForDevice(deviceId: string): GPFrame[] {
    return this.allFrames.filter((f) => f.deviceId === deviceId)
  }

  getCollisionStats(): CollisionStats {
    return this.channelManager.getStats()
  }

  generateReport(): EnergyReport {
    const devices = this.getDevices()
    const collisionStats = this.channelManager.getStats()
    const simulationDuration = this.startTime > 0 ? Date.now() - this.startTime : 0
    const currentSimulatedTime = this.virtualClock.getSimulatedTimeMs()

    return EnergyPredictor.generateReport(devices, collisionStats, simulationDuration, currentSimulatedTime)
  }

  exportReportCSV(): string {
    const report = this.generateReport()
    return EnergyPredictor.exportToCSV(report)
  }

  exportReportJSON(): string {
    const report = this.generateReport()
    return EnergyPredictor.exportToJSON(report)
  }

  setConfig(newConfig: Partial<SimulationConfig>) {
    const needsReinitialize =
      newConfig.deviceCount !== undefined && newConfig.deviceCount !== this.config.deviceCount

    this.config = { ...this.config, ...newConfig }

    if (newConfig.clockSpeedMultiplier !== undefined) {
      this.virtualClock.setSpeedMultiplier(newConfig.clockSpeedMultiplier)
    }

    if (newConfig.harvestRateMultiplier !== undefined) {
      for (const device of this.devices.values()) {
        device.setHarvestRateMultiplier(newConfig.harvestRateMultiplier)
      }
    }

    if (newConfig.energyThreshold !== undefined) {
      for (const device of this.devices.values()) {
        device.setThreshold(newConfig.energyThreshold)
      }
    }

    if (needsReinitialize) {
      this.initializeDevices()
    }

    this.broadcast('simulation_status', this.getStatus())
    this.broadcast('clock_update', this.virtualClock.getClockState())
    this.broadcast('light_update', this.lightModel.getState())
    this.broadcast('collision_update', this.channelManager.getStats())
  }

  getConfig(): SimulationConfig {
    return { ...this.config }
  }

  getStatus(): SimulationStatus {
    return {
      running: this.running,
      deviceCount: this.devices.size,
      totalFramesSent: this.totalFramesSent,
      elapsedTime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      config: { ...this.config },
      virtualClock: this.virtualClock.getClockState(),
      lightModel: this.lightModel.getState(),
      collisionStats: this.channelManager.getStats(),
    }
  }

  getVirtualClock(): VirtualClock {
    return this.virtualClock.getClockState()
  }

  getLightModel(): LightModel {
    return this.lightModel.getState()
  }
}

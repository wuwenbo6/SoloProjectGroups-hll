import os

base = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p207'

files = {}

files['api/simulation/gpDevice.ts'] = """import type { GPDevice, GPFrame, GPFrameType } from '../../shared/types.js'

const FRAME_TYPES: GPFrameType[] = ['notification', 'commissioning', 'decommissioning', 'success', 'channel_request']
const ZIGBEE_CHANNELS = [11, 15, 20, 25]
const GP_SECURITY_LEVELS = [0, 1, 2, 3]

function randomHex(len: number): string {
  let result = ''
  for (let i = 0; i < len; i++) {
    result += Math.floor(Math.random() * 16).toString(16).toUpperCase().padStart(1, '0')
  }
  return result
}

export class GpDeviceSimulator {
  device: GPDevice
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private onStateChange: (device: GPDevice) => void
  private onFrameSent: (frame: GPFrame) => void
  private harvestRateMultiplier: number

  constructor(
    deviceId: string,
    onStateChange: (device: GPDevice) => void,
    onFrameSent: (frame: GPFrame) => void,
    harvestRateMultiplier: number = 1.0,
    threshold: number = 80
  ) {
    this.onStateChange = onStateChange
    this.onFrameSent = onFrameSent
    this.harvestRateMultiplier = harvestRateMultiplier
    this.device = {
      deviceId,
      status: 'sleeping',
      energyLevel: Math.random() * 30,
      harvestRate: 2 + Math.random() * 3,
      threshold,
      sequenceNumber: 0,
      totalFramesSent: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      signalStrength: -40 - Math.random() * 40,
    }
  }

  start() {
    if (this.tickInterval) return
    this.tickInterval = setInterval(() => this.tick(), 200)
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }

  reset() {
    this.stop()
    this.device.status = 'sleeping'
    this.device.energyLevel = Math.random() * 20
    this.device.sequenceNumber = 0
    this.device.totalFramesSent = 0
    this.device.lastActiveAt = Date.now()
  }

  setHarvestRateMultiplier(multiplier: number) {
    this.harvestRateMultiplier = multiplier
  }

  setThreshold(threshold: number) {
    this.device.threshold = threshold
  }

  private tick() {
    const d = this.device
    const now = Date.now()

    switch (d.status) {
      case 'sleeping':
      case 'recharging': {
        const fluctuation = (Math.random() - 0.3) * 1.5
        const harvest = d.harvestRate * this.harvestRateMultiplier * 0.2 + fluctuation
        d.energyLevel = Math.min(100, Math.max(0, d.energyLevel + harvest))

        if (d.energyLevel >= d.threshold) {
          d.status = 'waking'
          d.lastActiveAt = now
          this.onStateChange(d)
        } else {
          if (Math.random() < 0.1) {
            this.onStateChange(d)
          }
        }
        break
      }

      case 'waking': {
        d.energyLevel -= 8 + Math.random() * 4
        if (d.energyLevel < 0) {
          d.energyLevel = 0
          d.status = 'sleeping'
          this.onStateChange(d)
          return
        }
        d.status = 'sending'
        d.lastActiveAt = now
        this.onStateChange(d)
        break
      }

      case 'sending': {
        const energyCost = 50 + Math.random() * 30
        d.energyLevel -= energyCost
        if (d.energyLevel < 0) d.energyLevel = 0

        const frame = this.buildFrame()
        d.sequenceNumber++
        d.totalFramesSent++
        d.status = d.energyLevel <= 5 ? 'recharging' : 'sleeping'
        d.lastActiveAt = now
        d.signalStrength = -40 - Math.random() * 40
        this.onFrameSent(frame)
        this.onStateChange(d)
        break
      }
    }
  }

  private buildFrame(): GPFrame {
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
      timestamp: Date.now(),
      rssi: d.signalStrength,
      channel: ZIGBEE_CHANNELS[Math.floor(Math.random() * ZIGBEE_CHANNELS.length)],
    }
  }
}
"""

files['api/simulation/simulationEngine.ts'] = """import type { GPDevice, GPFrame, SimulationConfig, SimulationStatus } from '../../shared/types.js'
import { GpDeviceSimulator } from './gpDevice.js'

export class SimulationEngine {
  private devices: Map<string, GpDeviceSimulator> = new Map()
  private frameHistory: GPFrame[] = []
  private running: boolean = false
  private startTime: number = 0
  private config: SimulationConfig = {
    deviceCount: 4,
    harvestRateMultiplier: 1.0,
    energyThreshold: 80,
  }
  private broadcastCallback: ((type: string, payload: unknown) => void) | null = null
  private statusInterval: ReturnType<typeof setInterval> | null = null

  onBroadcast(callback: (type: string, payload: unknown) => void) {
    this.broadcastCallback = callback
  }

  private broadcast(type: string, payload: unknown) {
    if (this.broadcastCallback) {
      this.broadcastCallback(type, payload)
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.startTime = Date.now()

    if (this.devices.size === 0) {
      this.createDevices(this.config.deviceCount)
    }

    for (const sim of this.devices.values()) {
      sim.start()
    }

    this.statusInterval = setInterval(() => {
      this.broadcast('simulation_status', this.getStatus())
    }, 2000)

    this.broadcast('simulation_status', this.getStatus())
  }

  pause() {
    if (!this.running) return
    this.running = false

    for (const sim of this.devices.values()) {
      sim.stop()
    }

    if (this.statusInterval) {
      clearInterval(this.statusInterval)
      this.statusInterval = null
    }

    this.broadcast('simulation_status', this.getStatus())
  }

  reset() {
    this.pause()
    for (const sim of this.devices.values()) {
      sim.reset()
    }
    this.frameHistory = []
    this.startTime = 0
    this.broadcast('simulation_status', this.getStatus())
    for (const sim of this.devices.values()) {
      this.broadcast('device_state', sim.device)
    }
  }

  setConfig(config: Partial<SimulationConfig>) {
    if (config.deviceCount !== undefined && config.deviceCount !== this.config.deviceCount) {
      this.config.deviceCount = config.deviceCount
      if (this.running) {
        for (const sim of this.devices.values()) {
          sim.stop()
        }
        this.devices.clear()
        this.createDevices(this.config.deviceCount)
        for (const sim of this.devices.values()) {
          sim.start()
        }
      } else {
        this.devices.clear()
        this.createDevices(this.config.deviceCount)
      }
    }
    if (config.harvestRateMultiplier !== undefined) {
      this.config.harvestRateMultiplier = config.harvestRateMultiplier
      for (const sim of this.devices.values()) {
        sim.setHarvestRateMultiplier(config.harvestRateMultiplier)
      }
    }
    if (config.energyThreshold !== undefined) {
      this.config.energyThreshold = config.energyThreshold
      for (const sim of this.devices.values()) {
        sim.setThreshold(config.energyThreshold)
      }
    }
  }

  getDevices(): GPDevice[] {
    return Array.from(this.devices.values()).map(s => ({ ...s.device }))
  }

  getDeviceById(id: string): GPDevice | undefined {
    const sim = this.devices.get(id)
    return sim ? { ...sim.device } : undefined
  }

  getFramesForDevice(deviceId: string): GPFrame[] {
    return this.frameHistory.filter(f => f.deviceId === deviceId)
  }

  getAllFrames(): GPFrame[] {
    return [...this.frameHistory]
  }

  getStatus(): SimulationStatus {
    return {
      running: this.running,
      deviceCount: this.devices.size,
      elapsedTime: this.running ? Date.now() - this.startTime : 0,
      totalFramesSent: this.frameHistory.length,
      config: { ...this.config },
    }
  }

  private createDevices(count: number) {
    for (let i = 0; i < count; i++) {
      const deviceId = `GP-${String(i + 1).padStart(3, '0')}`
      const sim = new GpDeviceSimulator(
        deviceId,
        (device) => this.handleDeviceStateChange(device),
        (frame) => this.handleFrameSent(frame),
        this.config.harvestRateMultiplier,
        this.config.energyThreshold
      )
      this.devices.set(deviceId, sim)
      this.broadcast('device_state', sim.device)
    }
  }

  private handleDeviceStateChange(device: GPDevice) {
    this.broadcast('device_state', { ...device })
  }

  private handleFrameSent(frame: GPFrame) {
    this.frameHistory.push(frame)
    if (this.frameHistory.length > 500) {
      this.frameHistory = this.frameHistory.slice(-250)
    }
    this.broadcast('gp_frame', { ...frame })
  }
}
"""

files['api/simulation/wsHandler.ts'] = """import type { WebSocket } from 'ws'
import type { WSMessage, WSCommand } from '../../shared/types.js'
import { SimulationEngine } from './simulationEngine.js'

export function setupWebSocket(ws: WebSocket, engine: SimulationEngine) {
  engine.onBroadcast((type: string, payload: unknown) => {
    const message: WSMessage = { type: type as WSMessage['type'], payload }
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message))
    }
  })

  ws.on('message', (data: Buffer) => {
    try {
      const command: WSCommand = JSON.parse(data.toString())
      handleCommand(command, engine)
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid command' } }))
    }
  })

  const devices = engine.getDevices()
  for (const device of devices) {
    ws.send(JSON.stringify({ type: 'device_state', payload: device }))
  }
  ws.send(JSON.stringify({ type: 'simulation_status', payload: engine.getStatus() }))
}

function handleCommand(command: WSCommand, engine: SimulationEngine) {
  switch (command.type) {
    case 'start':
      engine.start()
      break
    case 'pause':
      engine.pause()
      break
    case 'reset':
      engine.reset()
      break
    case 'set_config':
      if (command.payload) {
        engine.setConfig(command.payload)
      }
      break
  }
}
"""

files['api/routes/simulation.ts'] = """import { Router, type Request, type Response } from 'express'
import { SimulationEngine } from '../simulation/simulationEngine.js'

export function createSimulationRoutes(engine: SimulationEngine) {
  const router = Router()

  router.get('/devices', (_req: Request, res: Response) => {
    res.json({ success: true, data: engine.getDevices() })
  })

  router.get('/devices/:id/frames', (req: Request, res: Response) => {
    const frames = engine.getFramesForDevice(req.params.id)
    res.json({ success: true, data: frames })
  })

  router.get('/status', (_req: Request, res: Response) => {
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/start', (_req: Request, res: Response) => {
    engine.start()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/pause', (_req: Request, res: Response) => {
    engine.pause()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/reset', (_req: Request, res: Response) => {
    engine.reset()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.put('/config', (req: Request, res: Response) => {
    engine.setConfig(req.body)
    res.json({ success: true, data: engine.getStatus() })
  })

  return router
}
"""

for relpath, content in files.items():
    fullpath = os.path.join(base, relpath)
    os.makedirs(os.path.dirname(fullpath), exist_ok=True)
    with open(fullpath, 'w', encoding='utf-8') as f:
        f.write(content)
    size = os.path.getsize(fullpath)
    print(f"Written {relpath} ({size} bytes)")

print("All files created successfully!")

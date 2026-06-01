import type { CollisionStats, GPDevice } from '../../shared/types.js'

const ZIGBEE_CHANNELS = [11, 15, 20, 25]
const MAX_RETRIES = 3
const COLLISION_WINDOW_MS = 50

interface PendingTransmission {
  deviceId: string
  channel: number
  startTime: number
  duration: number
  retryCount: number
}

export class ChannelManager {
  private pendingTransmissions: Map<string, PendingTransmission> = new Map()
  private channelActivity: Map<number, number[]> = new Map()
  private totalCollisions = 0
  private totalRetries = 0
  private channelCollisions: Record<number, number> = {}
  private deviceCollisions: Record<string, number> = {}
  private totalTransmissions = 0

  constructor() {
    for (const channel of ZIGBEE_CHANNELS) {
      this.channelActivity.set(channel, [])
      this.channelCollisions[channel] = 0
    }
  }

  requestTransmission(deviceId: string, channel: number, simulatedTime: number): {
    success: boolean
    collision: boolean
    retryCount: number
    shouldRetry: boolean
  } {
    this.totalTransmissions++

    const collision = this.detectCollision(channel, simulatedTime)

    if (collision) {
      this.totalCollisions++
      this.channelCollisions[channel]++
      this.deviceCollisions[deviceId] = (this.deviceCollisions[deviceId] || 0) + 1

      const existingTransmission = this.pendingTransmissions.get(deviceId)
      const retryCount = existingTransmission ? existingTransmission.retryCount + 1 : 1
      const shouldRetry = retryCount < MAX_RETRIES

      if (shouldRetry) {
        this.totalRetries++
        this.pendingTransmissions.set(deviceId, {
          deviceId,
          channel,
          startTime: simulatedTime,
          duration: COLLISION_WINDOW_MS,
          retryCount,
        })
      } else {
        this.pendingTransmissions.delete(deviceId)
      }

      return {
        success: false,
        collision: true,
        retryCount,
        shouldRetry,
      }
    }

    this.pendingTransmissions.set(deviceId, {
      deviceId,
      channel,
      startTime: simulatedTime,
      duration: COLLISION_WINDOW_MS,
      retryCount: 0,
    })

    const activity = this.channelActivity.get(channel) || []
    activity.push(simulatedTime)
    if (activity.length > 100) {
      activity.shift()
    }
    this.channelActivity.set(channel, activity)

    return {
      success: true,
      collision: false,
      retryCount: 0,
      shouldRetry: false,
    }
  }

  private detectCollision(channel: number, simulatedTime: number): boolean {
    const activity = this.channelActivity.get(channel) || []
    for (const lastTime of activity) {
      if (Math.abs(simulatedTime - lastTime) < COLLISION_WINDOW_MS) {
        return true
      }
    }
    return false
  }

  completeTransmission(deviceId: string): void {
    this.pendingTransmissions.delete(deviceId)
  }

  getChannelLoad(channel: number): number {
    const activity = this.channelActivity.get(channel) || []
    return activity.length / 100
  }

  getLeastBusyChannel(): number {
    let leastBusy = ZIGBEE_CHANNELS[0]
    let minLoad = this.getChannelLoad(leastBusy)

    for (const channel of ZIGBEE_CHANNELS) {
      const load = this.getChannelLoad(channel)
      if (load < minLoad) {
        minLoad = load
        leastBusy = channel
      }
    }

    return leastBusy
  }

  getStats(): CollisionStats {
    const collisionRate = this.totalTransmissions > 0
      ? this.totalCollisions / this.totalTransmissions
      : 0

    return {
      totalCollisions: this.totalCollisions,
      totalRetries: this.totalRetries,
      collisionRate,
      channelCollisions: { ...this.channelCollisions },
      deviceCollisions: { ...this.deviceCollisions },
    }
  }

  reset(): void {
    this.pendingTransmissions.clear()
    for (const channel of ZIGBEE_CHANNELS) {
      this.channelActivity.set(channel, [])
      this.channelCollisions[channel] = 0
    }
    this.totalCollisions = 0
    this.totalRetries = 0
    this.totalTransmissions = 0
    this.deviceCollisions = {}
  }

  cleanupOldTransmissions(simulatedTime: number): void {
    for (const [deviceId, transmission] of this.pendingTransmissions) {
      if (simulatedTime - transmission.startTime > transmission.duration * 2) {
        this.pendingTransmissions.delete(deviceId)
      }
    }
  }
}

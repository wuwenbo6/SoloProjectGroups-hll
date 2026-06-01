import type { VirtualClock } from '../../shared/types.js'

const VIRTUAL_DAY_MS = 24 * 60 * 60 * 1000

export class VirtualClockSimulator {
  private simulatedTimeMs: number
  private lastRealTime: number
  private speedMultiplier: number
  private isRunning: boolean
  private startSimulatedHour: number

  constructor(speedMultiplier: number = 60, startHour: number = 6) {
    this.speedMultiplier = speedMultiplier
    this.startSimulatedHour = startHour
    this.simulatedTimeMs = startHour * 60 * 60 * 1000
    this.lastRealTime = Date.now()
    this.isRunning = false
  }

  start() {
    if (this.isRunning) return
    this.lastRealTime = Date.now()
    this.isRunning = true
  }

  pause() {
    this.isRunning = false
  }

  reset() {
    this.simulatedTimeMs = this.startSimulatedHour * 60 * 60 * 1000
    this.lastRealTime = Date.now()
    this.isRunning = false
  }

  setSpeedMultiplier(multiplier: number) {
    this.tick()
    this.speedMultiplier = multiplier
  }

  tick(): number {
    if (!this.isRunning) return this.simulatedTimeMs

    const now = Date.now()
    const realDelta = now - this.lastRealTime
    const simulatedDelta = realDelta * this.speedMultiplier

    this.simulatedTimeMs = (this.simulatedTimeMs + simulatedDelta) % VIRTUAL_DAY_MS
    this.lastRealTime = now

    return this.simulatedTimeMs
  }

  getSimulatedTimeMs(): number {
    return this.simulatedTimeMs
  }

  getTimeOfDay(): number {
    return this.simulatedTimeMs / VIRTUAL_DAY_MS
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier
  }

  getClockState(): VirtualClock {
    return {
      simulatedTime: this.simulatedTimeMs,
      realTime: this.lastRealTime,
      speedMultiplier: this.speedMultiplier,
      isRunning: this.isRunning,
      formattedTime: this.formatTime(),
    }
  }

  private formatTime(): string {
    const totalSeconds = Math.floor(this.simulatedTimeMs / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return [hours, minutes, seconds]
      .map((n) => n.toString().padStart(2, '0'))
      .join(':')
  }
}

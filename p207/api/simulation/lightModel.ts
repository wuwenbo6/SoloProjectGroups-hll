import type { LightModel } from '../../shared/types.js'

const SUNRISE_TIME = 6 / 24
const SUNSET_TIME = 18 / 24
const MIDDAY_TIME = 12 / 24
const PEAK_INTENSITY = 100
const NIGHT_INTENSITY = 2

export class LightModelSimulator {
  private baseIntensity: number
  private currentIntensity: number
  private timeOfDay: number
  private cloudFactor: number
  private cloudPhase: number
  private cloudSpeed: number

  constructor() {
    this.baseIntensity = PEAK_INTENSITY
    this.currentIntensity = NIGHT_INTENSITY
    this.timeOfDay = SUNRISE_TIME
    this.cloudFactor = 1.0
    this.cloudPhase = 0
    this.cloudSpeed = 0.0001
  }

  update(timeOfDay: number, deltaSimulatedMs: number): number {
    this.timeOfDay = timeOfDay

    const dayProgress = this.calculateDayProgress(timeOfDay)
    const dayIntensity = this.calculateDaylightIntensity(dayProgress)

    this.cloudPhase += deltaSimulatedMs * this.cloudSpeed
    const cloudNoise = this.generateCloudNoise(this.cloudPhase)
    this.cloudFactor = 0.5 + 0.5 * cloudNoise

    this.currentIntensity = Math.max(NIGHT_INTENSITY, dayIntensity * this.cloudFactor)

    return this.currentIntensity
  }

  private calculateDayProgress(timeOfDay: number): number {
    if (timeOfDay < SUNRISE_TIME || timeOfDay > SUNSET_TIME) {
      return 0
    }

    const dayLength = SUNSET_TIME - SUNRISE_TIME
    const dayTime = timeOfDay - SUNRISE_TIME
    const normalizedDayTime = dayTime / dayLength

    return normalizedDayTime
  }

  private calculateDaylightIntensity(dayProgress: number): number {
    if (dayProgress <= 0) return NIGHT_INTENSITY

    const sineInput = dayProgress * Math.PI
    const dayCurve = Math.sin(sineInput)

    return NIGHT_INTENSITY + (PEAK_INTENSITY - NIGHT_INTENSITY) * dayCurve
  }

  private generateCloudNoise(phase: number): number {
    const noise1 = Math.sin(phase * 1.3)
    const noise2 = Math.sin(phase * 2.7 + 1.5)
    const noise3 = Math.sin(phase * 0.5 + 0.8)
    return (noise1 + noise2 * 0.5 + noise3 * 0.3) / (1 + 0.5 + 0.3)
  }

  getCurrentIntensity(): number {
    return this.currentIntensity
  }

  getTimeOfDay(): number {
    return this.timeOfDay
  }

  getCloudFactor(): number {
    return this.cloudFactor
  }

  isDaytime(): boolean {
    return this.timeOfDay >= SUNRISE_TIME && this.timeOfDay <= SUNSET_TIME
  }

  getState(): LightModel {
    return {
      baseIntensity: this.baseIntensity,
      currentIntensity: this.currentIntensity,
      timeOfDay: this.timeOfDay,
      cloudFactor: this.cloudFactor,
      isDaytime: this.isDaytime(),
    }
  }

  reset() {
    this.timeOfDay = SUNRISE_TIME
    this.currentIntensity = NIGHT_INTENSITY
    this.cloudFactor = 1.0
    this.cloudPhase = 0
  }
}

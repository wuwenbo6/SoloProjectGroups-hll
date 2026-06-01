import type {
  EnergyPredictionPoint,
  GPDevice,
  DeviceEnergyReport,
  EnergyReport,
} from '../../shared/types.js'

const VIRTUAL_DAY_MS = 24 * 60 * 60 * 1000
const SUNRISE_TIME = 6 / 24
const SUNSET_TIME = 18 / 24
const PEAK_INTENSITY = 100
const NIGHT_INTENSITY = 2

export class EnergyPredictor {
  static predictLightIntensity(timeOfDay: number): number {
    if (timeOfDay < SUNRISE_TIME || timeOfDay > SUNSET_TIME) {
      return NIGHT_INTENSITY
    }

    const dayLength = SUNSET_TIME - SUNRISE_TIME
    const dayTime = timeOfDay - SUNRISE_TIME
    const normalizedDayTime = dayTime / dayLength

    const sineInput = normalizedDayTime * Math.PI
    const dayCurve = Math.sin(sineInput)

    return NIGHT_INTENSITY + (PEAK_INTENSITY - NIGHT_INTENSITY) * dayCurve
  }

  static predictEnergyHistory(
    device: GPDevice,
    currentSimulatedTime: number,
    predictionHorizonMs: number = 4 * 60 * 60 * 1000,
    stepMs: number = 15 * 60 * 1000
  ): EnergyPredictionPoint[] {
    const predictions: EnergyPredictionPoint[] = []
    const harvestRate = device.harvestRate
    const conversionEfficiency = 0.15
    const sendEnergyCost = 70

    let predictedEnergy = device.energyLevel

    for (let offset = 0; offset < predictionHorizonMs; offset += stepMs) {
      const predictedTime = currentSimulatedTime + offset
      const timeOfDay = (predictedTime % VIRTUAL_DAY_MS) / VIRTUAL_DAY_MS
      const predictedLight = this.predictLightIntensity(timeOfDay)

      const timeSeconds = stepMs / 1000
      const harvested = (predictedLight / 100) * harvestRate * timeSeconds * conversionEfficiency * 10

      predictedEnergy = Math.min(100, predictedEnergy + harvested)

      if (predictedEnergy >= device.threshold) {
        predictedEnergy -= sendEnergyCost
      }

      const confidence = this.calculateConfidence(offset)

      predictions.push({
        simulatedTime: predictedTime,
        predictedEnergy,
        predictedLight,
        confidence,
      })
    }

    return predictions
  }

  private static calculateConfidence(offset: number): number {
    const maxHorizon = 4 * 60 * 60 * 1000
    const decay = 1 - (offset / maxHorizon) * 0.3
    return Math.max(0.5, decay)
  }

  static generateDeviceReport(
    device: GPDevice,
    currentSimulatedTime: number,
    totalCollisions: number = 0
  ): DeviceEnergyReport {
    const history = device.energyHistory

    let totalEnergyHarvested = 0
    let totalEnergyConsumed = 0

    for (let i = 1; i < history.length; i++) {
      const delta = history[i].energyLevel - history[i - 1].energyLevel
      if (delta > 0) {
        totalEnergyHarvested += delta
      } else {
        totalEnergyConsumed += Math.abs(delta)
      }
    }

    const averageHarvestRate = history.length > 0
      ? totalEnergyHarvested / history.length
      : 0
    const efficiencyScore = this.calculateEfficiencyScore(
      totalEnergyHarvested,
      totalEnergyConsumed,
      device.totalFramesSent,
      totalCollisions
    )

    const prediction = this.predictEnergyHistory(device, currentSimulatedTime)

    return {
      deviceId: device.deviceId,
      totalEnergyHarvested: Math.round(totalEnergyHarvested * 100) / 100,
      totalEnergyConsumed: Math.round(totalEnergyConsumed * 100) / 100,
      averageHarvestRate: Math.round(averageHarvestRate * 100) / 100,
      framesSent: device.totalFramesSent,
      collisions: totalCollisions,
      prediction,
      efficiencyScore: Math.round(efficiencyScore * 100) / 100,
    }
  }

  private static calculateEfficiencyScore(
    harvested: number,
    consumed: number,
    framesSent: number,
    collisions: number
  ): number {
    if (harvested + consumed === 0) return 0

    const energyEfficiency = harvested > 0 ? consumed / harvested : 1
    const frameEfficiency = framesSent > 0 ? 1 - (collisions / framesSent) : 1

    return (energyEfficiency * 0.6 + frameEfficiency * 0.4) * 100
  }

  static generateReport(
    devices: GPDevice[],
    collisionStats: { deviceCollisions: Record<string, number> },
    simulationDuration: number,
    currentSimulatedTime: number
  ): EnergyReport {
    const deviceReports = devices.map((device) =>
      this.generateDeviceReport(
        device,
        currentSimulatedTime,
        collisionStats.deviceCollisions[device.deviceId] || 0
      )
    )

    const summary = {
      totalEnergyHarvested: 0,
      totalEnergyConsumed: 0,
      totalFramesSent: 0,
      totalCollisions: 0,
      averageEfficiency: 0,
    }

    for (const report of deviceReports) {
      summary.totalEnergyHarvested += report.totalEnergyHarvested
      summary.totalEnergyConsumed += report.totalEnergyConsumed
      summary.totalFramesSent += report.framesSent
      summary.totalCollisions += report.collisions
    }

    if (deviceReports.length > 0) {
      summary.averageEfficiency =
        deviceReports.reduce((sum, r) => sum + r.efficiencyScore, 0) / deviceReports.length
    }

    return {
      generatedAt: Date.now(),
      simulationDuration,
      devices: deviceReports,
      summary: {
        totalEnergyHarvested: Math.round(summary.totalEnergyHarvested * 100) / 100,
        totalEnergyConsumed: Math.round(summary.totalEnergyConsumed * 100) / 100,
        totalFramesSent: summary.totalFramesSent,
        totalCollisions: summary.totalCollisions,
        averageEfficiency: Math.round(summary.averageEfficiency * 100) / 100,
      },
    }
  }

  static exportToCSV(report: EnergyReport): string {
    const headers = [
      'Device ID',
      'Total Energy Harvested',
      'Total Energy Consumed',
      'Average Harvest Rate',
      'Frames Sent',
      'Collisions',
      'Efficiency Score',
    ].join(',')

    const rows = report.devices
      .map((d) =>
        [
          d.deviceId,
          d.totalEnergyHarvested,
          d.totalEnergyConsumed,
          d.averageHarvestRate,
          d.framesSent,
          d.collisions,
          d.efficiencyScore,
        ].join(',')
      )
      .join('\n')

    const summary = `\n\nSummary\nTotal Energy Harvested,${report.summary.totalEnergyHarvested}\nTotal Energy Consumed,${report.summary.totalEnergyConsumed}\nTotal Frames Sent,${report.summary.totalFramesSent}\nTotal Collisions,${report.summary.totalCollisions}\nAverage Efficiency,${report.summary.averageEfficiency}\nSimulation Duration (ms),${report.simulationDuration}\nGenerated At,${new Date(report.generatedAt)}`

    return `${headers}\n${rows}${summary}`
  }

  static exportToJSON(report: EnergyReport): string {
    return JSON.stringify(report, null, 2)
  }
}

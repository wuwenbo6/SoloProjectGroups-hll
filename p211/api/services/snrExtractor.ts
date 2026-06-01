import type { ParsedUbxFile } from './ubxParser.js'

export interface SnrDataSet {
  svId: number
  system: string
  signalType: string
  snrData: { time: string; snr: number }[]
  stats: { avg: number; max: number; min: number; median: number }
}

export function extractSnrData(parsedData: ParsedUbxFile): SnrDataSet[] {
  const groups = new Map<string, {
    svId: number
    system: string
    signalType: string
    snrData: { time: string; snr: number }[]
  }>()

  for (const epoch of parsedData.epochs) {
    for (const meas of epoch.measurements) {
      if (meas.cno === 0) continue
      const key = `${meas.system}_${meas.svId}_${meas.rinexSignal}`
      if (!groups.has(key)) {
        groups.set(key, {
          svId: meas.svId,
          system: meas.system,
          signalType: meas.rinexSignal,
          snrData: [],
        })
      }
      groups.get(key)!.snrData.push({
        time: epoch.time,
        snr: meas.cno,
      })
    }
  }

  const results: SnrDataSet[] = []

  for (const group of groups.values()) {
    const snrValues = group.snrData.map(d => d.snr)
    const sorted = [...snrValues].sort((a, b) => a - b)
    const count = sorted.length
    if (count === 0) continue
    const sum = snrValues.reduce((acc, v) => acc + v, 0)
    const mid = Math.floor(count / 2)
    const median = count % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2

    results.push({
      svId: group.svId,
      system: group.system,
      signalType: group.signalType,
      snrData: group.snrData,
      stats: {
        avg: sum / count,
        max: sorted[count - 1],
        min: sorted[0],
        median,
      },
    })
  }

  results.sort((a, b) => {
    if (a.system < b.system) return -1
    if (a.system > b.system) return 1
    return a.svId - b.svId
  })

  return results
}

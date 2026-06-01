import type { RawxEpoch, RawxMeasurement, ParsedUbxFile } from './ubxParser.js'
import { hasHalfCycleFlag, isLossOfLock } from './mwCycleSlip.js'

type GnssSystem = 'G' | 'R' | 'E' | 'C' | 'J'

const GNSS_SIGNALS: Record<GnssSystem, { sigId: number; freq: string; obsTypes: string[] }[]> = {
  G: [
    { sigId: 0, freq: '1C', obsTypes: ['C1C', 'L1C', 'D1C', 'S1C'] },
    { sigId: 6, freq: '2W', obsTypes: ['C2W', 'L2W', 'D2W', 'S2W'] },
  ],
  R: [
    { sigId: 0, freq: '1C', obsTypes: ['C1C', 'L1C', 'D1C', 'S1C'] },
    { sigId: 2, freq: '2C', obsTypes: ['C2C', 'L2C', 'D2C', 'S2C'] },
  ],
  E: [
    { sigId: 0, freq: '1C', obsTypes: ['C1C', 'L1C', 'D1C', 'S1C'] },
    { sigId: 5, freq: '5Q', obsTypes: ['C5Q', 'L5Q', 'D5Q', 'S5Q'] },
  ],
  C: [
    { sigId: 0, freq: '2I', obsTypes: ['C2I', 'L2I', 'D2I', 'S2I'] },
    { sigId: 3, freq: '6I', obsTypes: ['C6I', 'L6I', 'D6I', 'S6I'] },
    { sigId: 4, freq: '7I', obsTypes: ['C7I', 'L7I', 'D7I', 'S7I'] },
  ],
  J: [
    { sigId: 0, freq: '1C', obsTypes: ['C1C', 'L1C', 'D1C', 'S1C'] },
    { sigId: 5, freq: '5Q', obsTypes: ['C5Q', 'L5Q', 'D5Q', 'S5Q'] },
  ],
}

const GNSS_ID_TO_SYSTEM: Record<number, GnssSystem> = {
  0: 'G',
  2: 'E',
  3: 'C',
  5: 'J',
  6: 'R',
}

function rinexLine(content: string, label: string): string {
  return content.padEnd(60) + label
}

function detectSystems(epochs: RawxEpoch[]): GnssSystem[] {
  const systems = new Set<GnssSystem>()
  for (const epoch of epochs) {
    for (const meas of epoch.measurements) {
      const sys = GNSS_ID_TO_SYSTEM[meas.gnssId]
      if (sys) systems.add(sys)
    }
  }
  return ['G', 'R', 'E', 'C', 'J'].filter(s => systems.has(s as GnssSystem)) as GnssSystem[]
}

function getObsTypesForSystem(system: GnssSystem): string[] {
  const types: string[] = []
  for (const sig of GNSS_SIGNALS[system]) {
    types.push(...sig.obsTypes)
  }
  return types
}

function formatSatId(system: GnssSystem, svId: number, freqId?: number): string {
  if (system === 'R') {
    return `${system}${String(svId).padStart(2, ' ')}${String(freqId ?? 0).padStart(2, '0')}`
  }
  return `${system}${String(svId).padStart(2, '0')}  `
}

function formatObsValue(
  value: number | undefined,
  isCarrierPhase: boolean,
  ll: boolean,
  halfCycle: boolean
): string {
  if (value === undefined || value === 0) {
    return '               '
  }
  const formatted = value.toFixed(3).padStart(14)
  if (isCarrierPhase) {
    let lli = 0
    if (ll) lli |= 1
    if (halfCycle) lli |= 2
    if (lli > 0) {
      return formatted.slice(0, -1) + String(lli)
    }
  }
  return formatted
}

function getSignalDef(system: GnssSystem, sigId: number) {
  return GNSS_SIGNALS[system]?.find(s => s.sigId === sigId)
}

function isoToRinexTime(isoStr: string) {
  const d = new Date(isoStr)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    min: d.getUTCMinutes(),
    sec: d.getUTCSeconds() + d.getUTCMilliseconds() / 1000,
  }
}

function buildHeader(epochs: RawxEpoch[]): string {
  const lines: string[] = []
  const systems = detectSystems(epochs)

  lines.push(rinexLine('3.04           OBSERVATION DATA M', 'RINEX VERSION / TYPE'))
  const now = new Date()
  const runDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')} UTC`
  lines.push(rinexLine(`UBX2RINEX       UNKNOWN         ${runDate}`, 'PGM / RUN BY / DATE'))
  lines.push(rinexLine('UBX_STATION', 'MARKER NAME'))
  lines.push(rinexLine('UNKNOWN                    UNKNOWN', 'OBSERVER / AGENCY'))
  lines.push(rinexLine('            u-blox          ', 'REC # / TYPE / VERS'))
  lines.push(rinexLine('            UNKNOWN         ', 'ANT # / TYPE'))
  lines.push(rinexLine('   0.0000   0.0000   0.0000', 'APPROX POSITION XYZ'))
  lines.push(rinexLine('   0.0000   0.0000   0.0000', 'ANTENNA: DELTA H/E/N'))

  for (const sys of systems) {
    const obsTypes = getObsTypesForSystem(sys)
    const numTypes = String(obsTypes.length).padStart(3)
    let typeStr = `${sys} ${numTypes}`
    for (const ot of obsTypes) {
      typeStr += ` ${ot}`
    }
    lines.push(rinexLine(typeStr, 'SYS / # / OBS TYPES'))
  }

  if (epochs.length > 0) {
    const t = isoToRinexTime(epochs[0].time)
    const timeStr = `  ${String(t.year).padStart(4, '0')}    ${String(t.month).padStart(2, '0')}    ${String(t.day).padStart(2, '0')}    ${String(t.hour).padStart(2, '0')}    ${String(t.min).padStart(2, '0')}${t.sec.toFixed(7).padStart(12)}     GPS`
    lines.push(rinexLine(timeStr, 'TIME OF FIRST OBS'))
  }

  lines.push(''.padEnd(60) + 'END OF HEADER')
  return lines.join('\n') + '\n'
}

interface ObsEntry {
  value: number | undefined
  ll: boolean
  halfCycle: boolean
}

interface SatelliteObservations {
  system: GnssSystem
  svId: number
  freqId: number
  obs: Map<string, ObsEntry>
}

function buildEpoch(epoch: RawxEpoch, systems: GnssSystem[]): string {
  const t = isoToRinexTime(epoch.time)

  const satMap = new Map<string, SatelliteObservations>()

  for (const meas of epoch.measurements) {
    const system = GNSS_ID_TO_SYSTEM[meas.gnssId]
    if (!system) continue
    if (!systems.includes(system)) continue

    const satKey = `${system}_${meas.svId}_${meas.freqId}`
    if (!satMap.has(satKey)) {
      satMap.set(satKey, {
        system,
        svId: meas.svId,
        freqId: meas.freqId,
        obs: new Map(),
      })
    }

    const satObs = satMap.get(satKey)!
    const sigDef = getSignalDef(system, meas.sigId)
    if (!sigDef) continue

    const ll = isLossOfLock(meas.trkStat)
    const halfCycle = hasHalfCycleFlag(meas.trkStat)
    const pr = meas.prMes !== 0 ? meas.prMes : undefined
    const cp = meas.cpMes !== 0 ? meas.cpMes : undefined
    const dp = meas.doMes !== 0 ? meas.doMes : undefined
    const sn = meas.cno !== 0 ? meas.cno : undefined

    satObs.obs.set(`C${sigDef.freq}`, { value: pr, ll: false, halfCycle: false })
    satObs.obs.set(`L${sigDef.freq}`, { value: cp, ll, halfCycle })
    satObs.obs.set(`D${sigDef.freq}`, { value: dp, ll: false, halfCycle: false })
    satObs.obs.set(`S${sigDef.freq}`, { value: sn, ll: false, halfCycle: false })
  }

  const sats = Array.from(satMap.values())
  const numSats = String(sats.length).padStart(3)

  let epochLine = `> ${String(t.year).padStart(4, '0')} ${String(t.month).padStart(2, '0')} ${String(t.day).padStart(2, '0')} ${String(t.hour).padStart(2, '0')} ${String(t.min).padStart(2, '0')}${t.sec.toFixed(7).padStart(12)}  0${numSats}\n`

  for (const sat of sats) {
    const satId = formatSatId(sat.system, sat.svId, sat.freqId)
    epochLine += satId

    const systemObsTypes = getObsTypesForSystem(sat.system)
    for (const obsType of systemObsTypes) {
      const obsData = sat.obs.get(obsType)
      const isCarrier = obsType.startsWith('L')
      if (obsData) {
        epochLine += formatObsValue(obsData.value, isCarrier, obsData.ll, obsData.halfCycle)
      } else {
        epochLine += formatObsValue(undefined, isCarrier, false, false)
      }
    }
    epochLine += '\n'
  }

  return epochLine
}

export function generateRinex(parsedData: ParsedUbxFile, _fileName: string): string {
  const epochs = parsedData.epochs
  const systems = detectSystems(epochs)
  let output = buildHeader(epochs)
  for (const epoch of epochs) {
    output += buildEpoch(epoch, systems)
  }
  return output
}

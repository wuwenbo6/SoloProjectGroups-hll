import type { RawxEpoch, RawxMeasurement, ParsedUbxFile } from './ubxParser.js'

const C = 299792458
const GM = 3.986005e14
const OMEGA_E = 7.2921151467e-5
const PI = Math.PI

const F = -4.442807633e-10

export interface SatellitePosition {
  x: number
  y: number
  z: number
  clockBias: number
}

export interface SppResult {
  epoch: string
  rcvTow: number
  week: number
  x: number
  y: number
  z: number
  lat: number
  lon: number
  height: number
  numSats: number
  gdop: number
  pdop: number
  hdop: number
  vdop: number
  tdop: number
  usedSats: {
    system: string
    svId: number
    pr: number
    residual: number
    azimuth: number
    elevation: number
  }[]
  positionSigma: {
    x: number
    y: number
    z: number
    h: number
    v: number
  }
}

function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; height: number } {
  const a = 6378137.0
  const e2 = 0.00669437999014
  const b = Math.sqrt(a * a * (1 - e2))

  const p = Math.sqrt(x * x + y * y)
  let lat = Math.atan2(z * a, p * b)

  let N: number
  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat)
    N = a / Math.sqrt(1 - e2 * sinLat * sinLat)
    const height = p / Math.cos(lat) - N
    lat = Math.atan2(z, p * (1 - e2 * N / (N + height)))
  }

  const sinLat = Math.sin(lat)
  N = a / Math.sqrt(1 - e2 * sinLat * sinLat)
  const height = p / Math.cos(lat) - N
  const lon = Math.atan2(y, x)

  return {
    lat: (lat * 180) / PI,
    lon: (lon * 180) / PI,
    height,
  }
}

function computeSatellitePositionSimple(
  gnssId: number,
  svId: number,
  rcvTow: number,
  week: number
): SatellitePosition {
  const t = rcvTow / 3600
  const orbitRadius = 26560000 + gnssId * 50000
  const inclination = 55 + (svId % 5) * 2
  const nodeOffset = svId * 40 + gnssId * 30

  const meanAnomaly = (t * 15 + nodeOffset) * (PI / 180)
  const omega = (nodeOffset * 2 + t * 3) * (PI / 180)
  const raan = (nodeOffset - OMEGA_E * rcvTow) * (PI / 180)

  const E = meanAnomaly
  const sinE = Math.sin(E)
  const cosE = Math.cos(E)

  const xOrbit = orbitRadius * (cosE - 0.01)
  const yOrbit = orbitRadius * Math.sqrt(1 - 0.01 * 0.01) * sinE

  const cosOmega = Math.cos(omega)
  const sinOmega = Math.sin(omega)
  const cosRaan = Math.cos(raan)
  const sinRaan = Math.sin(raan)
  const cosI = Math.cos(inclination * PI / 180)
  const sinI = Math.sin(inclination * PI / 180)

  const x =
    (cosRaan * cosOmega - sinRaan * sinOmega * cosI) * xOrbit -
    (cosRaan * sinOmega + sinRaan * cosOmega * cosI) * yOrbit
  const y =
    (sinRaan * cosOmega + cosRaan * sinOmega * cosI) * xOrbit +
    (-sinRaan * sinOmega + cosRaan * cosOmega * cosI) * yOrbit
  const z = sinRaan * sinI * xOrbit + cosRaan * sinI * yOrbit

  const clockBias = (Math.sin(t + svId) * 5e-9)

  return { x, y, z, clockBias }
}

function troposphereDelay(elevation: number, height: number): number {
  const elRad = (elevation * PI) / 180
  const sinEl = Math.sin(elRad)

  const zhd = 2.3 * Math.exp(-height / 44330)
  const zwd = 0.2
  const mDry = 1 / sinEl
  const mWet = 1 / sinEl

  return zhd * mDry + zwd * mWet
}

function ionosphereDelay(frequency: number, elevation: number, t: number): number {
  const elRad = (elevation * PI) / 180
  const zenith = PI / 2 - elRad
  const mapping = 1 / Math.cos(zenith)

  const hourOfDay = (t / 3600) % 24
  const amp = 5e-9 * (1 + Math.sin((hourOfDay - 14) * PI / 12))
  const phase = 40 / (frequency / 1e9)

  return amp * mapping * phase
}

function computeAzimuthElevation(
  rx: number, ry: number, rz: number,
  sx: number, sy: number, sz: number
): { azimuth: number; elevation: number } {
  const dx = sx - rx
  const dy = sy - ry
  const dz = sz - rz

  const rho = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const zenith = Math.acos((rx * dx + ry * dy + rz * dz) / (Math.sqrt(rx * rx + ry * ry + rz * rz) * rho))
  const elevation = 90 - (zenith * 180) / PI

  const east = -dx * ry / Math.sqrt(rx * rx + ry * ry) + dy * rx / Math.sqrt(rx * rx + ry * ry)
  const north = -dx * rx * rz / (Math.sqrt(rx * rx + ry * ry) * Math.sqrt(rx * rx + ry * ry + rz * rz)) -
    dy * ry * rz / (Math.sqrt(rx * rx + ry * ry) * Math.sqrt(rx * rx + ry * ry + rz * rz)) +
    dz * Math.sqrt(rx * rx + ry * ry) / Math.sqrt(rx * rx + ry * ry + rz * rz)

  let azimuth = (Math.atan2(east, north) * 180) / PI
  if (azimuth < 0) azimuth += 360

  return { azimuth, elevation }
}

function solveLeastSquares(
  pseudoranges: number[],
  satPositions: SatellitePosition[],
  approxPos: number[]
): { solution: number[]; residuals: number[]; dopMatrix: number[][] } {
  const n = pseudoranges.length
  if (n < 4) return { solution: approxPos, residuals: [], dopMatrix: [] }

  let x = [...approxPos]
  const residuals: number[] = new Array(n).fill(0)
  let H: number[][]
  let dopMatrix: number[][] = []

  for (let iter = 0; iter < 10; iter++) {
    H = new Array(n).fill(null).map(() => new Array(4).fill(0))
    const dz = new Array(n).fill(0)
    const ranges = new Array(n).fill(0)

    for (let i = 0; i < n; i++) {
      const dx = satPositions[i].x - x[0]
      const dy = satPositions[i].y - x[1]
      const dz_ = satPositions[i].z - x[2]
      const rho = Math.sqrt(dx * dx + dy * dy + dz_)
      ranges[i] = rho

      H[i][0] = -dx / rho
      H[i][1] = -dy / rho
      H[i][2] = -dz_ / rho
      H[i][3] = C

      dz[i] = pseudoranges[i] - (rho + x[3] * C - satPositions[i].clockBias * C)
    }

    const Ht = transpose(H)
    const HtH = multiply(Ht, H)
    const HtHInv = invert4x4(HtH)

    if (!HtHInv) break

    const Htdz = multiplyVector(Ht, dz)
    const dx = multiplyVector(HtHInv, Htdz)

    x[0] += dx[0]
    x[1] += dx[1]
    x[2] += dx[2]
    x[3] += dx[3] / C

    for (let i = 0; i < n; i++) {
      const dx = satPositions[i].x - x[0]
      const dy = satPositions[i].y - x[1]
      const dz_ = satPositions[i].z - x[2]
      const rho = Math.sqrt(dx * dx + dy * dy + dz_)
      residuals[i] = pseudoranges[i] - (rho + x[3] * C - satPositions[i].clockBias * C)
    }

    if (Math.sqrt(dx[0] * dx[0] + dx[1] * dx[1] + dx[2] * dx[2]) < 0.001) {
      dopMatrix = HtHInv
      break
    }
  }

  return { solution: x, residuals, dopMatrix: dopMatrix || [] }
}

function transpose(m: number[][]): number[][] {
  return m[0].map((_, i) => m.map((row) => row[i]))
}

function multiply(a: number[][], b: number[][]): number[][] {
  const result = new Array(a.length).fill(null).map(() => new Array(b[0].length).fill(0))
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b[0].length; j++) {
      for (let k = 0; k < b.length; k++) {
        result[i][j] += a[i][k] * b[k][j]
      }
    }
  }
  return result
}

function multiplyVector(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((sum, val, i) => sum + val * v[i], 0))
}

function invert4x4(m: number[][]): number[][] | null {
  const result = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]
  const a = m.map((row) => [...row])

  for (let i = 0; i < 4; i++) {
    let pivot = i
    for (let j = i + 1; j < 4; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[pivot][i])) pivot = j
    }
    if (Math.abs(a[pivot][i]) < 1e-15) return null

    ;[a[i], a[pivot]] = [a[pivot], a[i]]
    ;[result[i], result[pivot]] = [result[pivot], result[i]]

    const div = a[i][i]
    for (let j = 0; j < 4; j++) {
      a[i][j] /= div
      result[i][j] /= div
    }

    for (let j = 0; j <  4; j++) {
      if (i !== j) {
        const factor = a[j][i]
        for (let k = 0; k < 4; k++) {
          a[j][k] -= factor * a[i][k]
          result[j][k] -= factor * result[i][k]
        }
      }
    }
  }

  return result
}

function computeDOPs(dopMatrix: number[][]): { gdop: number; pdop: number; hdop: number; vdop: number; tdop: number } {
  if (dopMatrix.length < 4 || dopMatrix[0].length < 4) {
    return { gdop: 99, pdop: 99, hdop: 99, vdop: 99, tdop: 99 }
  }

  const gdop = Math.sqrt(dopMatrix[0][0] + dopMatrix[1][1] + dopMatrix[2][2] + dopMatrix[3][3])
  const pdop = Math.sqrt(dopMatrix[0][0] + dopMatrix[1][1] + dopMatrix[2][2])
  const hdop = Math.sqrt(dopMatrix[0][0] + dopMatrix[1][1])
  const vdop = Math.sqrt(dopMatrix[2][2])
  const tdop = Math.sqrt(dopMatrix[3][3])

  return { gdop, pdop, hdop, vdop, tdop }
}

export function computeSPP(epoch: RawxEpoch, approxPos: number[] = [0, 0, 0, 0]): SppResult | null {
  const measBySat = new Map<string, RawxMeasurement>()

  for (const meas of epoch.measurements) {
    if (meas.prMes === 0 || meas.prMes < 1e6 || meas.prMes > 3e8) continue

    const key = `${meas.gnssId}_${meas.svId}`
    const existing = measBySat.get(key)
    if (!existing || meas.cno > existing.cno) {
      measBySat.set(key, meas)
    }
  }

  const measurements = Array.from(measBySat.values())
  if (measurements.length < 4) return null

  const satPositions: SatellitePosition[] = []
  const pseudoranges: number[] = []
  const usedMeasurements: RawxMeasurement[] = []

  for (const meas of measurements) {
    const satPos = computeSatellitePositionSimple(meas.gnssId, meas.svId, epoch.rcvTow, epoch.week)

    const dx = satPos.x - approxPos[0]
    const dy = satPos.y - approxPos[1]
    const dz = satPos.z - approxPos[2]
    const range = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const tt = range / C

    const correctedPos = computeSatellitePositionSimple(meas.gnssId, meas.svId, epoch.rcvTow - tt, epoch.week)

    const ae = computeAzimuthElevation(approxPos[0] || 4000000, approxPos[1] || 4000000, approxPos[2] || 4000000, correctedPos.x, correctedPos.y, correctedPos.z)

    const config = { frequency: 1575.42e6 }
    const ionoDelay = ionosphereDelay(config.frequency, ae.elevation, epoch.rcvTow)
    const tropoDelay = troposphereDelay(ae.elevation, approxPos[2] || 0)

    const correctedPR = meas.prMes - ionoDelay - tropoDelay + satPos.clockBias * C

    satPositions.push(correctedPos)
    pseudoranges.push(correctedPR)
    usedMeasurements.push(meas)
  }

  const result = solveLeastSquares(pseudoranges, satPositions, approxPos)
  const dops = computeDOPs(result.dopMatrix)

  const geo = ecefToGeodetic(result.solution[0], result.solution[1], result.solution[2])

  const usedSats: SppResult['usedSats'] = []
  for (let i = 0; i < usedMeasurements.length; i++) {
    const meas = usedMeasurements[i]
    const ae = computeAzimuthElevation(
      result.solution[0], result.solution[1], result.solution[2],
      satPositions[i].x, satPositions[i].y, satPositions[i].z
    )
    usedSats.push({
      system: meas.system,
      svId: meas.svId,
      pr: pseudoranges[i],
      residual: result.residuals[i] || 0,
      azimuth: ae.azimuth,
      elevation: ae.elevation,
    })
  }

  const sigma = {
    x: Math.sqrt(result.dopMatrix[0]?.[0] || 1) * 3,
    y: Math.sqrt(result.dopMatrix[1]?.[1] || 1) * 3,
    z: Math.sqrt(result.dopMatrix[2]?.[2] || 1) * 3,
    h: Math.sqrt(result.dopMatrix[0]?.[0] || 1 + result.dopMatrix[1]?.[1] || 1) * 3,
    v: Math.sqrt(result.dopMatrix[2]?.[2] || 1) * 3,
  }

  return {
    epoch: epoch.time,
    rcvTow: epoch.rcvTow,
    week: epoch.week,
    x: result.solution[0],
    y: result.solution[1],
    z: result.solution[2],
    lat: geo.lat,
    lon: geo.lon,
    height: geo.height,
    numSats: usedMeasurements.length,
    ...dops,
    usedSats,
    positionSigma: sigma,
  }
}

export function computeAllSPP(parsedData: ParsedUbxFile): SppResult[] {
  const results: SppResult[] = []
  let lastPos = [4000000, 4000000, 4000000, 0]

  for (const epoch of parsedData.epochs) {
    const result = computeSPP(epoch, lastPos)
    if (result) {
      results.push(result)
      lastPos = [result.x, result.y, result.z, result.x / C - lastPos[3]]
    }
  }

  return results
}

export function computeAveragePosition(sppResults: SppResult[]): {
  lat: number
  lon: number
  height: number
  sigmaLat: number
  sigmaLon: number
  sigmaHeight: number
  avgPdop: number
  avgSats: number
} {
  if (sppResults.length === 0) {
    return { lat: 0, lon: 0, height: 0, sigmaLat: 0, sigmaLon: 0, sigmaHeight: 0, avgPdop: 0, avgSats: 0 }
  }

  const lats = sppResults.map((r) => r.lat)
  const lons = sppResults.map((r) => r.lon)
  const heights = sppResults.map((r) => r.height)
  const pdops = sppResults.map((r) => r.pdop)
  const satCounts = sppResults.map((r) => r.numSats)

  const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length
  const avgLon = lons.reduce((a, b) => a + b, 0) / lons.length
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length

  const sigmaLat = Math.sqrt(lats.reduce((a, b) => a + Math.pow(b - avgLat, 2), 0) / lats.length)
  const sigmaLon = Math.sqrt(lons.reduce((a, b) => a + Math.pow(b - avgLon, 2), 0) / lons.length)
  const sigmaHeight = Math.sqrt(heights.reduce((a, b) => a + Math.pow(b - avgHeight, 2), 0) / heights.length)

  const avgPdop = pdops.reduce((a, b) => a + b, 0) / pdops.length
  const avgSats = satCounts.reduce((a, b) => a + b, 0) / satCounts.length

  return {
    lat: avgLat,
    lon: avgLon,
    height: avgHeight,
    sigmaLat,
    sigmaLon,
    sigmaHeight,
    avgPdop,
    avgSats,
  }
}

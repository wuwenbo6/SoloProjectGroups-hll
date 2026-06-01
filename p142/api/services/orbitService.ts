import type { Satellite, SimulationConfig } from '../models/types.js'

export const EARTH_RADIUS_KM = 6371
export const GM = 398600.4418
export const SPEED_OF_LIGHT = 299792.458

export function calculateOrbitalPeriod(altitudeKm: number): number {
  const r = EARTH_RADIUS_KM + altitudeKm
  return 2 * Math.PI * Math.sqrt((r * r * r) / GM)
}

export function calculateSatellitePosition(
  altitudeKm: number,
  inclinationDeg: number,
  raanDeg: number,
  phaseDeg: number,
  timeSec: number,
): { x: number; y: number; z: number } {
  const r = EARTH_RADIUS_KM + altitudeKm
  const period = calculateOrbitalPeriod(altitudeKm)
  const meanMotion = (2 * Math.PI) / period

  const inclination = (inclinationDeg * Math.PI) / 180
  const raan = (raanDeg * Math.PI) / 180
  const phase = (phaseDeg * Math.PI) / 180

  const theta = phase + meanMotion * timeSec

  const xOrb = r * Math.cos(theta)
  const yOrb = r * Math.sin(theta)
  const zOrb = 0

  const cosRaan = Math.cos(raan)
  const sinRaan = Math.sin(raan)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)

  const x = cosRaan * xOrb - sinRaan * cosI * yOrb + sinRaan * sinI * zOrb
  const y = sinRaan * xOrb + cosRaan * cosI * yOrb - cosRaan * sinI * zOrb
  const z = sinI * yOrb + cosI * zOrb

  return { x, y, z }
}

export function calculateSatelliteVelocity(
  altitudeKm: number,
  inclinationDeg: number,
  raanDeg: number,
  phaseDeg: number,
  timeSec: number,
): { vx: number; vy: number; vz: number } {
  const r = EARTH_RADIUS_KM + altitudeKm
  const period = calculateOrbitalPeriod(altitudeKm)
  const meanMotion = (2 * Math.PI) / period

  const inclination = (inclinationDeg * Math.PI) / 180
  const raan = (raanDeg * Math.PI) / 180
  const phase = (phaseDeg * Math.PI) / 180

  const theta = phase + meanMotion * timeSec

  const vxOrb = -r * meanMotion * Math.sin(theta)
  const vyOrb = r * meanMotion * Math.cos(theta)
  const vzOrb = 0

  const cosRaan = Math.cos(raan)
  const sinRaan = Math.sin(raan)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)

  const vx = cosRaan * vxOrb - sinRaan * cosI * vyOrb + sinRaan * sinI * vzOrb
  const vy = sinRaan * vxOrb + cosRaan * cosI * vyOrb - cosRaan * sinI * vzOrb
  const vz = sinI * vyOrb + cosI * vzOrb

  return { vx, vy, vz }
}

export function generateWalkerConstellation(config: SimulationConfig): Satellite[] {
  const { satelliteCount, orbitAltitude, orbitInclination, planeCount } = config
  const satellites: Satellite[] = []
  const satsPerPlane = Math.max(1, Math.floor(satelliteCount / planeCount))
  const actualPlaneCount = Math.max(1, planeCount)

  for (let p = 0; p < actualPlaneCount; p++) {
    const raanDeg = (360 / actualPlaneCount) * p
    for (let s = 0; s < satsPerPlane; s++) {
      const phaseDeg = (360 / satsPerPlane) * s
      const id = `SAT-${String(p).padStart(2, '0')}-${String(s).padStart(2, '0')}`
      const position = calculateSatellitePosition(
        orbitAltitude,
        orbitInclination,
        raanDeg,
        phaseDeg,
        0,
      )
      const velocity = calculateSatelliteVelocity(
        orbitAltitude,
        orbitInclination,
        raanDeg,
        phaseDeg,
        0,
      )
      satellites.push({
        id,
        name: id,
        orbitPlane: p,
        orbitAltitude,
        orbitInclination,
        orbitPhase: phaseDeg,
        position,
        velocity,
      })
    }
  }

  return satellites
}

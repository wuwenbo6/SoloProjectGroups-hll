export const EARTH_RADIUS_KM = 6371
export const EARTH_ROTATION_RATE = 7.2921159e-5
export const GRAVITATIONAL_PARAMETER = 398600.4418
const SPEED_OF_LIGHT_KM_S = 299792.458
const CARRIER_FREQ_GHZ = 2.4

const HYSTERESIS_FACTOR = 1.15
const MIN_LINK_DURATION_SEC = 2.0
const PREDICTION_HORIZON_SEC = 0.5
const SAME_PLANE_BONUS_KM = 1000
const HANDOVER_MARGIN_DEG = 10

interface LinkState {
  establishedAt: number
  lastActiveAt: number
}

const linkStates = new Map<string, LinkState>()

type Vec3 = { x: number; y: number; z: number }
type Velocity = { vx: number; vy: number; vz: number }

export function calculateOrbitalPeriod(altitudeKm: number): number {
  const semiMajorAxis = EARTH_RADIUS_KM + altitudeKm
  return 2 * Math.PI * Math.sqrt((semiMajorAxis ** 3) / GRAVITATIONAL_PARAMETER)
}

export function calculateSatellitePosition(
  altitudeKm: number,
  inclinationDeg: number,
  phaseDeg: number,
  timeSec: number,
): { x: number; y: number; z: number } {
  const radius = EARTH_RADIUS_KM + altitudeKm
  const inclination = (inclinationDeg * Math.PI) / 180
  const period = calculateOrbitalPeriod(altitudeKm)
  const meanMotion = (2 * Math.PI) / period
  const meanAnomaly = ((phaseDeg * Math.PI) / 180) + meanMotion * timeSec

  const cosM = Math.cos(meanAnomaly)
  const sinM = Math.sin(meanAnomaly)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)

  return {
    x: radius * cosM,
    y: radius * sinM * cosI,
    z: radius * sinM * sinI,
  }
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

interface WalkerConfig {
  satelliteCount: number
  orbitAltitude: number
  orbitInclination: number
  planeCount: number
  phaseFactor?: number
}

export interface WalkerSatellite {
  id: string
  name: string
  orbitPlane: number
  raan: number
  meanAnomaly: number
  altitude: number
  inclination: number
}

export function generateWalkerConstellation(config: WalkerConfig): WalkerSatellite[] {
  const { satelliteCount, orbitAltitude, orbitInclination, planeCount, phaseFactor = 1 } = config
  const satellitesPerPlane = Math.floor(satelliteCount / planeCount)
  const satellites: WalkerSatellite[] = []

  for (let plane = 0; plane < planeCount; plane++) {
    const raan = (plane * 360) / planeCount

    for (let sat = 0; sat < satellitesPerPlane; sat++) {
      const id = `${plane}-${sat}`
      const meanAnomaly = (sat * 360) / satellitesPerPlane + (plane * phaseFactor * 360) / satelliteCount

      satellites.push({
        id,
        name: `SAT-${String(plane * satellitesPerPlane + sat + 1).padStart(3, '0')}`,
        orbitPlane: plane,
        raan,
        meanAnomaly,
        altitude: orbitAltitude,
        inclination: orbitInclination,
      })
    }
  }

  return satellites
}

export function calculateSatellitePositionWithRAAN(
  altitudeKm: number,
  inclinationDeg: number,
  raanDeg: number,
  meanAnomalyDeg: number,
  timeSec: number,
): { x: number; y: number; z: number } {
  const radius = EARTH_RADIUS_KM + altitudeKm
  const inclination = (inclinationDeg * Math.PI) / 180
  const raan = (raanDeg * Math.PI) / 180
  const period = calculateOrbitalPeriod(altitudeKm)
  const meanMotion = (2 * Math.PI) / period
  const meanAnomaly = ((meanAnomalyDeg * Math.PI) / 180) + meanMotion * timeSec

  const cosM = Math.cos(meanAnomaly)
  const sinM = Math.sin(meanAnomaly)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)
  const cosOmega = Math.cos(raan)
  const sinOmega = Math.sin(raan)

  return {
    x: radius * (cosM * cosOmega - sinM * cosI * sinOmega),
    y: radius * (cosM * sinOmega + sinM * cosI * cosOmega),
    z: radius * sinM * sinI,
  }
}

export function geodeticToECI(
  latitudeDeg: number,
  longitudeDeg: number,
  altitudeKm: number,
  timeSec: number,
): { x: number; y: number; z: number } {
  const latitude = (latitudeDeg * Math.PI) / 180
  const longitude = (longitudeDeg * Math.PI) / 180
  const radius = EARTH_RADIUS_KM + altitudeKm

  const cosLat = Math.cos(latitude)
  const sinLat = Math.sin(latitude)
  const cosLon = Math.cos(longitude)
  const sinLon = Math.sin(longitude)

  const xEcef = radius * cosLat * cosLon
  const yEcef = radius * cosLat * sinLon
  const zEcef = radius * sinLat

  const earthRotation = EARTH_ROTATION_RATE * timeSec
  const cosRot = Math.cos(earthRotation)
  const sinRot = Math.sin(earthRotation)

  return {
    x: xEcef * cosRot - yEcef * sinRot,
    y: xEcef * sinRot + yEcef * cosRot,
    z: zEcef,
  }
}

export function distanceKm(a: [number, number, number], b: [number, number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  const dx = pos2.x - pos1.x
  const dy = pos2.y - pos1.y
  const dz = pos2.z - pos1.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function calculateDopplerShift(
  pos1: Vec3,
  pos2: Vec3,
  vel1: Velocity,
  vel2: Velocity,
  freqGhz = 2.4,
): number {
  const dist = calculateDistance(pos1, pos2)
  if (dist === 0) return 0

  const dx = (pos2.x - pos1.x) / dist
  const dy = (pos2.y - pos1.y) / dist
  const dz = (pos2.z - pos1.z) / dist

  const relativeVelocity =
    (vel2.vx - vel1.vx) * dx + (vel2.vy - vel1.vy) * dy + (vel2.vz - vel1.vz) * dz

  const beta = relativeVelocity / SPEED_OF_LIGHT_KM_S
  const freqHz = freqGhz * 1e9

  const dopplerHz = -freqHz * beta * (1 + beta / 2)
  return dopplerHz / 1e3
}

export function calculateDopplerCompensation(
  pos1: Vec3,
  pos2: Vec3,
  vel1: Velocity,
  vel2: Velocity,
  freqGhz = 2.4,
): { forwardShiftKhz: number; reverseShiftKhz: number; compensationKhz: number } {
  const forwardShift = calculateDopplerShift(pos1, pos2, vel1, vel2, freqGhz)
  const reverseShift = calculateDopplerShift(pos2, pos1, vel2, vel1, freqGhz)
  const compensation = -(forwardShift + reverseShift) / 2

  return {
    forwardShiftKhz: forwardShift,
    reverseShiftKhz: reverseShift,
    compensationKhz: compensation,
  }
}

function predictPosition(
  pos: Vec3,
  vel: Velocity,
  timeHorizonSec: number,
): Vec3 {
  return {
    x: pos.x + vel.vx * timeHorizonSec,
    y: pos.y + vel.vy * timeHorizonSec,
    z: pos.z + vel.vz * timeHorizonSec,
  }
}

export interface OrbitGroundTerminal {
  id: string
  name: string
  latitude: number
  longitude: number
}

export interface Link {
  id: string
  sourceId: string
  targetId: string
  distance: number
  propagationDelay: number
  dopplerShift: number
}

interface SatelliteWithVel {
  id: string
  position: { x: number; y: number; z: number }
  velocity?: { vx: number; vy: number; vz: number }
  orbitPlane?: number
}

export function calculateLinksWithHysteresis(
  satellites: SatelliteWithVel[],
  thresholdKm: number,
  currentTimeSec: number,
): Link[] {
  const links: Link[] = []
  const connectThreshold = thresholdKm
  const disconnectThreshold = thresholdKm * HYSTERESIS_FACTOR

  for (let i = 0; i < satellites.length; i++) {
    for (let j = i + 1; j < satellites.length; j++) {
      const a = satellites[i]
      const b = satellites[j]

      const currentDist = calculateDistance(a.position, b.position)
      const velA = a.velocity || { vx: 0, vy: 0, vz: 0 }
      const velB = b.velocity || { vx: 0, vy: 0, vz: 0 }

      const predAPos = predictPosition(a.position, velA, PREDICTION_HORIZON_SEC)
      const predBPos = predictPosition(b.position, velB, PREDICTION_HORIZON_SEC)
      const futureDist = calculateDistance(predAPos, predBPos)

      const samePlane = a.orbitPlane !== undefined && b.orbitPlane !== undefined && a.orbitPlane === b.orbitPlane
      const effectiveConnectThreshold = samePlane ? connectThreshold + SAME_PLANE_BONUS_KM : connectThreshold
      const effectiveDisconnectThreshold = samePlane ? disconnectThreshold + SAME_PLANE_BONUS_KM : disconnectThreshold

      const linkId = `${a.id}-${b.id}`
      const existingState = linkStates.get(linkId)
      const isCurrentlyConnected = existingState !== undefined

      let shouldConnect = false

      if (isCurrentlyConnected) {
        const age = currentTimeSec - existingState.establishedAt
        if (age < MIN_LINK_DURATION_SEC) {
          shouldConnect = true
        } else if (currentDist < effectiveDisconnectThreshold) {
          shouldConnect = true
        } else if (futureDist < effectiveDisconnectThreshold * 0.9) {
          shouldConnect = true
        }
      } else {
        if (currentDist < effectiveConnectThreshold) {
          shouldConnect = true
        } else if (futureDist < effectiveConnectThreshold * 0.8) {
          shouldConnect = true
        }
      }

      if (shouldConnect) {
        const delay = (currentDist / SPEED_OF_LIGHT_KM_S) * 1000
        const doppler = calculateDopplerShift(
          a.position,
          b.position,
          velA,
          velB,
        )

        if (!isCurrentlyConnected) {
          linkStates.set(linkId, {
            establishedAt: currentTimeSec,
            lastActiveAt: currentTimeSec,
          })
        } else {
          existingState.lastActiveAt = currentTimeSec
        }

        links.push({
          id: linkId,
          sourceId: a.id,
          targetId: b.id,
          distance: currentDist,
          propagationDelay: delay,
          dopplerShift: doppler,
        })
      } else {
        if (isCurrentlyConnected && currentTimeSec - existingState.lastActiveAt > MIN_LINK_DURATION_SEC) {
          linkStates.delete(linkId)
        }
      }
    }
  }

  const maxAge = 60
  for (const [id, state] of linkStates) {
    if (currentTimeSec - state.lastActiveAt > maxAge) {
      linkStates.delete(id)
    }
  }

  return links
}

export function calculateLinks(
  satellites: { id: string; position: { x: number; y: number; z: number } }[],
  thresholdKm: number,
): Link[] {
  return calculateLinksWithHysteresis(satellites, thresholdKm, 0)
}

export function findBestSatelliteForTerminal(
  terminal: { latitude: number; longitude: number },
  satellites: { id: string; position: { x: number; y: number; z: number } }[],
  previousSatelliteId: string | null = null,
): string | null {
  if (satellites.length === 0) return null

  const latRad = (terminal.latitude * Math.PI) / 180
  const lonRad = (terminal.longitude * Math.PI) / 180
  const terminalPos = {
    x: Math.cos(latRad) * Math.cos(lonRad),
    y: Math.cos(latRad) * Math.sin(lonRad),
    z: Math.sin(latRad),
  }

  let bestId: string | null = null
  let bestElevation = -Infinity

  const previousSat = previousSatelliteId ? satellites.find(s => s.id === previousSatelliteId) : null
  let previousElevation = -Infinity

  for (const sat of satellites) {
    const satMag = Math.sqrt(
      sat.position.x ** 2 + sat.position.y ** 2 + sat.position.z ** 2,
    )
    if (satMag === 0) continue
    const satDir = {
      x: sat.position.x / satMag,
      y: sat.position.y / satMag,
      z: sat.position.z / satMag,
    }

    const dot =
      satDir.x * terminalPos.x +
      satDir.y * terminalPos.y +
      satDir.z * terminalPos.z
    const elevation = (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI

    const horizonMask = dot > 0

    if (horizonMask && elevation > bestElevation) {
      bestElevation = elevation
      bestId = sat.id
    }

    if (sat.id === previousSatelliteId) {
      previousElevation = elevation
    }
  }

  if (previousSat && previousElevation > 10 && bestElevation - previousElevation < HANDOVER_MARGIN_DEG) {
    return previousSatelliteId
  }

  return bestId
}

export function generateGroundTerminals(): OrbitGroundTerminal[] {
  return [
    { id: 'gt-ny', name: 'New York', latitude: 40.7, longitude: -74.0 },
    { id: 'gt-london', name: 'London', latitude: 51.5, longitude: -0.1 },
    { id: 'gt-tokyo', name: 'Tokyo', latitude: 35.7, longitude: 139.7 },
    { id: 'gt-sydney', name: 'Sydney', latitude: -33.9, longitude: 151.2 },
    { id: 'gt-saopaulo', name: 'Sao Paulo', latitude: -23.5, longitude: -46.6 },
  ]
}

// ========== ROUTING ALGORITHMS ==========

export interface RouteResult {
  path: string[]
  totalDistance: number
  totalPropagationDelay: number
  totalVisibilityTime: number
  hopCount: number
  links: string[]
}

interface VisibilityLink {
  sourceId: string
  targetId: string
  visibilityTime: number
  distance: number
}

const LVA_MAX_VISIBILITY_WINDOW = 600

function checkLineOfSight(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number },
): boolean {
  const dx = pos2.x - pos1.x
  const dy = pos2.y - pos1.y
  const dz = pos2.z - pos1.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

  if (dist === 0) return true

  const t = -(pos1.x * dx + pos1.y * dy + pos1.z * dz) / (dist * dist)
  if (t < 0 || t > 1) return true

  const closestX = pos1.x + t * dx
  const closestY = pos1.y + t * dy
  const closestZ = pos1.z + t * dz

  const closestDist = Math.sqrt(closestX * closestX + closestY * closestY + closestZ * closestZ)
  return closestDist > EARTH_RADIUS_KM + 50
}

function calculateLinkVisibilityTime(
  sat1: { id: string; altitude: number; inclination: number; raan: number; meanAnomaly: number },
  sat2: { id: string; altitude: number; inclination: number; raan: number; meanAnomaly: number },
  currentTime: number,
): number {
  let visibilityTime = 0
  const timeStepSec = 5

  for (let t = 0; t < LVA_MAX_VISIBILITY_WINDOW; t += timeStepSec) {
    const checkTime = currentTime + t
    const pos1 = calculateSatellitePositionWithRAAN(
      sat1.altitude,
      sat1.inclination,
      sat1.raan,
      sat1.meanAnomaly,
      checkTime,
    )
    const pos2 = calculateSatellitePositionWithRAAN(
      sat2.altitude,
      sat2.inclination,
      sat2.raan,
      sat2.meanAnomaly,
      checkTime,
    )

    const distance = calculateDistance(pos1, pos2)
    const hasLOS = checkLineOfSight(pos1, pos2)

    if (distance < 5000 && hasLOS) {
      visibilityTime += timeStepSec
    } else if (t > 0) {
      break
    }
  }

  return visibilityTime
}

function buildVisibilityGraph(
  satellites: Array<{ id: string; position: { x: number; y: number; z: number }; altitude: number; inclination: number; raan: number; meanAnomaly: number }>,
  currentTime: number,
): Map<string, VisibilityLink[]> {
  const graph = new Map<string, VisibilityLink[]>()

  for (const sat of satellites) {
    graph.set(sat.id, [])
  }

  for (let i = 0; i < satellites.length; i++) {
    for (let j = i + 1; j < satellites.length; j++) {
      const sat1 = satellites[i]
      const sat2 = satellites[j]

      const distance = calculateDistance(sat1.position, sat2.position)
      if (distance > 5000) continue
      if (!checkLineOfSight(sat1.position, sat2.position)) continue

      const visibilityTime = calculateLinkVisibilityTime(sat1, sat2, currentTime)

      graph.get(sat1.id)!.push({
        sourceId: sat1.id,
        targetId: sat2.id,
        visibilityTime,
        distance,
      })
      graph.get(sat2.id)!.push({
        sourceId: sat2.id,
        targetId: sat1.id,
        visibilityTime,
        distance,
      })
    }
  }

  return graph
}

export function findLongestVisibilityRoute(
  sourceId: string,
  targetId: string,
  satellites: Array<{ id: string; position: { x: number; y: number; z: number }; altitude: number; inclination: number; raan: number; meanAnomaly: number }>,
  currentTime: number,
): RouteResult | null {
  if (sourceId === targetId) {
    return {
      path: [sourceId],
      totalDistance: 0,
      totalPropagationDelay: 0,
      totalVisibilityTime: Infinity,
      hopCount: 0,
      links: [],
    }
  }

  const graph = buildVisibilityGraph(satellites, currentTime)
  if (!graph.has(sourceId) || !graph.has(targetId)) return null

  const prev = new Map<string, string | null>()
  const visibilityTimes = new Map<string, number>()
  const distances = new Map<string, number>()
  const visited = new Set<string>()

  for (const satId of graph.keys()) {
    prev.set(satId, null)
    visibilityTimes.set(satId, -1)
    distances.set(satId, Infinity)
  }
  visibilityTimes.set(sourceId, Infinity)
  distances.set(sourceId, 0)

  const queue: { satId: string; visibilityTime: number; distance: number }[] = [
    { satId: sourceId, visibilityTime: Infinity, distance: 0 },
  ]

  while (queue.length > 0) {
    queue.sort((a, b) => b.visibilityTime - a.visibilityTime)
    const current = queue.shift()!
    if (visited.has(current.satId)) continue
    visited.add(current.satId)
    if (current.satId === targetId) break

    const neighbors = graph.get(current.satId) || []
    for (const link of neighbors) {
      if (visited.has(link.targetId)) continue
      const pathVisibilityTime = Math.min(current.visibilityTime, link.visibilityTime)
      const pathDistance = current.distance + link.distance

      if (pathVisibilityTime > (visibilityTimes.get(link.targetId) || -1)) {
        prev.set(link.targetId, current.satId)
        visibilityTimes.set(link.targetId, pathVisibilityTime)
        distances.set(link.targetId, pathDistance)
        queue.push({ satId: link.targetId, visibilityTime: pathVisibilityTime, distance: pathDistance })
      } else if (
        pathVisibilityTime === visibilityTimes.get(link.targetId) &&
        pathDistance < (distances.get(link.targetId) || Infinity)
      ) {
        prev.set(link.targetId, current.satId)
        distances.set(link.targetId, pathDistance)
      }
    }
  }

  if (!prev.has(targetId) || visibilityTimes.get(targetId) === -1) return null

  const path: string[] = []
  let cur: string | null = targetId
  while (cur !== null) {
    path.unshift(cur)
    cur = prev.get(cur) || null
  }

  if (path[0] !== sourceId) return null

  const links: string[] = []
  for (let i = 0; i < path.length - 1; i++) {
    links.push(`${path[i]}-${path[i + 1]}`)
  }

  const totalDistance = distances.get(targetId) || 0
  return {
    path,
    totalDistance,
    totalPropagationDelay: (totalDistance / SPEED_OF_LIGHT_KM_S) * 1000,
    totalVisibilityTime: visibilityTimes.get(targetId) || 0,
    hopCount: path.length - 1,
    links,
  }
}

export function findShortestPathRoute(
  sourceId: string,
  targetId: string,
  satellites: Array<{ id: string; position: { x: number; y: number; z: number }; altitude: number; inclination: number; raan: number; meanAnomaly: number }>,
  currentTime: number,
): RouteResult | null {
  if (sourceId === targetId) {
    return {
      path: [sourceId],
      totalDistance: 0,
      totalPropagationDelay: 0,
      totalVisibilityTime: Infinity,
      hopCount: 0,
      links: [],
    }
  }

  const graph = buildVisibilityGraph(satellites, currentTime)
  if (!graph.has(sourceId) || !graph.has(targetId)) return null

  const prev = new Map<string, string | null>()
  const distances = new Map<string, number>()
  const visited = new Set<string>()

  for (const satId of graph.keys()) {
    prev.set(satId, null)
    distances.set(satId, Infinity)
  }
  distances.set(sourceId, 0)

  const queue: { satId: string; distance: number }[] = [
    { satId: sourceId, distance: 0 },
  ]

  while (queue.length > 0) {
    queue.sort((a, b) => a.distance - b.distance)
    const current = queue.shift()!
    if (visited.has(current.satId)) continue
    visited.add(current.satId)
    if (current.satId === targetId) break

    const neighbors = graph.get(current.satId) || []
    for (const link of neighbors) {
      if (visited.has(link.targetId)) continue
      const newDist = current.distance + link.distance
      if (newDist < (distances.get(link.targetId) || Infinity)) {
        prev.set(link.targetId, current.satId)
        distances.set(link.targetId, newDist)
        queue.push({ satId: link.targetId, distance: newDist })
      }
    }
  }

  if (distances.get(targetId) === Infinity) return null

  const path: string[] = []
  let cur: string | null = targetId
  while (cur !== null) {
    path.unshift(cur)
    cur = prev.get(cur) || null
  }

  const links: string[] = []
  for (let i = 0; i < path.length - 1; i++) {
    links.push(`${path[i]}-${path[i + 1]}`)
  }

  const totalDistance = distances.get(targetId) || 0

  let minVisibility = Infinity
  for (let i = 0; i < path.length - 1; i++) {
    const sat1 = satellites.find(s => s.id === path[i])
    const sat2 = satellites.find(s => s.id === path[i + 1])
    if (sat1 && sat2) {
      const vt = calculateLinkVisibilityTime(sat1, sat2, currentTime)
      minVisibility = Math.min(minVisibility, vt)
    }
  }

  return {
    path,
    totalDistance,
    totalPropagationDelay: (totalDistance / SPEED_OF_LIGHT_KM_S) * 1000,
    totalVisibilityTime: minVisibility === Infinity ? 0 : minVisibility,
    hopCount: path.length - 1,
    links,
  }
}

// ========== HANDOVER STRATEGY ==========

export interface HandoverCandidate {
  satId: string
  elevation: number
  distance: number
  visibilityTime: number
  handoverCost: number
}

export interface HandoverDecision {
  shouldHandover: boolean
  targetSatelliteId: string | null
  reason: string
}

export function estimateTerminalVisibilityTime(
  terminal: { latitude: number; longitude: number },
  satellite: { altitude: number; inclination: number; raan: number; meanAnomaly: number },
  currentTime: number,
): number {
  let visibilityTime = 0
  const timeStepSec = 5
  const maxCheckSec = 600
  const latRad = (terminal.latitude * Math.PI) / 180
  const lonRad = (terminal.longitude * Math.PI) / 180

  for (let t = 0; t < maxCheckSec; t += timeStepSec) {
    const checkTime = currentTime + t
    const satPos = calculateSatellitePositionWithRAAN(
      satellite.altitude,
      satellite.inclination,
      satellite.raan,
      satellite.meanAnomaly,
      checkTime,
    )
    const satMag = Math.sqrt(satPos.x ** 2 + satPos.y ** 2 + satPos.z ** 2)
    const satDir = { x: satPos.x / satMag, y: satPos.y / satMag, z: satPos.z / satMag }

    const termEci = geodeticToECI(terminal.latitude, terminal.longitude, 0, checkTime)
    const termMag = Math.sqrt(termEci.x ** 2 + termEci.y ** 2 + termEci.z ** 2)
    const termDir = { x: termEci.x / termMag, y: termEci.y / termMag, z: termEci.z / termMag }

    const dot = satDir.x * termDir.x + satDir.y * termDir.y + satDir.z * termDir.z
    const elevation = (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI

    if (elevation > 10) {
      visibilityTime += timeStepSec
    } else if (t > 0) {
      break
    }
  }

  return visibilityTime
}

export function getHandoverCandidates(
  terminal: { latitude: number; longitude: number },
  currentSatelliteId: string | null,
  satellites: Array<{ id: string; position: { x: number; y: number; z: number }; altitude: number; inclination: number; raan: number; meanAnomaly: number }>,
  currentTime: number,
): HandoverCandidate[] {
  const candidates: HandoverCandidate[] = []

  const latRad = (terminal.latitude * Math.PI) / 180
  const lonRad = (terminal.longitude * Math.PI) / 180
  const terminalPos = {
    x: Math.cos(latRad) * Math.cos(lonRad),
    y: Math.cos(latRad) * Math.sin(lonRad),
    z: Math.sin(latRad),
  }

  for (const sat of satellites) {
    const satMag = Math.sqrt(
      sat.position.x ** 2 + sat.position.y ** 2 + sat.position.z ** 2,
    )
    if (satMag === 0) continue
    const satDir = {
      x: sat.position.x / satMag,
      y: sat.position.y / satMag,
      z: sat.position.z / satMag,
    }

    const dot = satDir.x * terminalPos.x + satDir.y * terminalPos.y + satDir.z * terminalPos.z
    if (dot <= 0) continue
    const elevation = (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
    if (elevation < 10) continue

    const distance = calculateDistance(sat.position, {
      x: terminalPos.x * EARTH_RADIUS_KM,
      y: terminalPos.y * EARTH_RADIUS_KM,
      z: terminalPos.z * EARTH_RADIUS_KM,
    })

    const visibilityTime = estimateTerminalVisibilityTime(terminal, sat, currentTime)
    const handoverCost = currentSatelliteId === sat.id ? 0 : 10 + distance / 1000

    candidates.push({ satId: sat.id, elevation, distance, visibilityTime, handoverCost })
  }

  return candidates.sort((a, b) => {
    const scoreA = a.visibilityTime * 2 + a.elevation - a.handoverCost * 0.5
    const scoreB = b.visibilityTime * 2 + b.elevation - b.handoverCost * 0.5
    return scoreB - scoreA
  })
}

export function makeHandoverDecision(
  terminal: { latitude: number; longitude: number; id: string },
  currentSatelliteId: string | null,
  satellites: Array<{ id: string; position: { x: number; y: number; z: number }; altitude: number; inclination: number; raan: number; meanAnomaly: number }>,
  currentTime: number,
): HandoverDecision {
  const candidates = getHandoverCandidates(terminal, currentSatelliteId, satellites, currentTime)

  if (candidates.length === 0) {
    return { shouldHandover: false, targetSatelliteId: null, reason: 'No available satellites' }
  }

  const bestCandidate = candidates[0]
  const currentCandidate = currentSatelliteId
    ? candidates.find(c => c.satId === currentSatelliteId)
    : null

  if (!currentSatelliteId) {
    return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Initial connection' }
  }

  if (!currentCandidate) {
    return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Current satellite lost' }
  }

  if (currentCandidate.visibilityTime < 30) {
    return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Visibility expiring' }
  }

  if (bestCandidate.satId !== currentSatelliteId) {
    const visibilityGain = bestCandidate.visibilityTime - currentCandidate.visibilityTime
    const elevationGain = bestCandidate.elevation - currentCandidate.elevation
    if (visibilityGain > 120 || (visibilityGain > 30 && elevationGain > 15)) {
      return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Better satellite available' }
    }
  }

  return { shouldHandover: false, targetSatelliteId: currentSatelliteId, reason: 'Stay connected' }
}

// ========== COVERAGE MAP ==========

export interface CoverageGridPoint {
  latitude: number
  longitude: number
  satelliteCount: number
  maxElevation: number
  bestSatelliteId: string | null
}

export function calculateCoverageGrid(
  satellites: Array<{ id: string; position: { x: number; y: number; z: number } }>,
  currentTime: number,
  latStep = 10,
  lonStep = 15,
  minElevationDeg = 10,
): CoverageGridPoint[] {
  const grid: CoverageGridPoint[] = []

  for (let lat = -90; lat <= 90; lat += latStep) {
    for (let lon = -180; lon <= 180; lon += lonStep) {
      const termEci = geodeticToECI(lat, lon, 0, currentTime)
      const termMag = Math.sqrt(termEci.x ** 2 + termEci.y ** 2 + termEci.z ** 2)
      const termDir = { x: termEci.x / termMag, y: termEci.y / termMag, z: termEci.z / termMag }

      let maxElevation = -90
      let bestSatId: string | null = null
      let satCount = 0

      for (const sat of satellites) {
        const satMag = Math.sqrt(
          sat.position.x ** 2 + sat.position.y ** 2 + sat.position.z ** 2,
        )
        if (satMag === 0) continue
        const satDir = {
          x: sat.position.x / satMag,
          y: sat.position.y / satMag,
          z: sat.position.z / satMag,
        }
        const dot = satDir.x * termDir.x + satDir.y * termDir.y + satDir.z * termDir.z
        const elevation = (Math.asin(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI

        if (elevation >= minElevationDeg) {
          satCount++
          if (elevation > maxElevation) {
            maxElevation = elevation
            bestSatId = sat.id
          }
        }
      }

      grid.push({
        latitude: lat,
        longitude: lon,
        satelliteCount: satCount,
        maxElevation,
        bestSatelliteId: bestSatId,
      })
    }
  }

  return grid
}

export function exportCoverageToGeoJSON(grid: CoverageGridPoint[]): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: grid.map(point => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      properties: point,
    })),
  }, null, 2)
}

export function exportCoverageToCSV(grid: CoverageGridPoint[]): string {
  const header = 'latitude,longitude,satelliteCount,maxElevation,bestSatelliteId\n'
  const rows = grid
    .map(p => `${p.latitude},${p.longitude},${p.satelliteCount},${p.maxElevation.toFixed(2)},${p.bestSatelliteId || ''}`)
    .join('\n')
  return header + rows
}
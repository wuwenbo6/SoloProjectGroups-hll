import type { Satellite, Link } from '../models/types.js'
import { calculateSatellitePosition, calculateOrbitalPeriod } from './orbitService.js'
import { findLinksWithHysteresis } from './linkService.js'

interface RouteResult {
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

interface NeighborEntry {
  satId: string
  visibilityTime: number
  lastSeen: number
  handoverCount: number
}

const MAX_VISIBILITY_WINDOW_SEC = 600
const EARTH_RADIUS_KM = 6371

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
  sat1: Satellite,
  sat2: Satellite,
  currentTime: number,
  maxCheckSec: number = MAX_VISIBILITY_WINDOW_SEC,
  timeStepSec: number = 5,
): number {
  let visibilityTime = 0
  let isVisible = true

  const raan1 = (360 / Math.max(1, sat1.orbitPlane + 1)) * sat1.orbitPlane
  const raan2 = (360 / Math.max(1, sat2.orbitPlane + 1)) * sat2.orbitPlane

  for (let t = 0; t < maxCheckSec; t += timeStepSec) {
    const checkTime = currentTime + t
    const pos1 = calculateSatellitePosition(
      sat1.orbitAltitude,
      sat1.orbitInclination,
      raan1,
      sat1.orbitPhase,
      checkTime,
    )
    const pos2 = calculateSatellitePosition(
      sat2.orbitAltitude,
      sat2.orbitInclination,
      raan2,
      sat2.orbitPhase,
      checkTime,
    )

    const distance = Math.sqrt(
      (pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2 + (pos2.z - pos1.z) ** 2,
    )

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
  satellites: Satellite[],
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

      const pos1 = sat1.position
      const pos2 = sat2.position

      const distance = Math.sqrt(
        (pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2 + (pos2.z - pos1.z) ** 2,
      )

      if (distance > 8000) continue
      if (!checkLineOfSight(pos1, pos2)) continue

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
  satellites: Satellite[],
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

  if (!graph.has(sourceId) || !graph.has(targetId)) {
    return null
  }

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

  const queue: { satId: string; visibilityTime: number; distance: number }[] = []
  queue.push({ satId: sourceId, visibilityTime: Infinity, distance: 0 })

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
        queue.push({
          satId: link.targetId,
          visibilityTime: pathVisibilityTime,
          distance: pathDistance,
        })
      } else if (
        pathVisibilityTime === visibilityTimes.get(link.targetId) &&
        pathDistance < (distances.get(link.targetId) || Infinity)
      ) {
        prev.set(link.targetId, current.satId)
        distances.set(link.targetId, pathDistance)
      }
    }
  }

  if (!prev.has(targetId) || !visibilityTimes.has(targetId)) {
    return null
  }

  const path: string[] = []
  let current: string | null = targetId
  while (current !== null) {
    path.unshift(current)
    current = prev.get(current) || null
  }

  if (path[0] !== sourceId) {
    return null
  }

  const links: string[] = []
  for (let i = 0; i < path.length - 1; i++) {
    links.push(`${path[i]}-${path[i + 1]}`)
  }

  const totalDistance = distances.get(targetId) || 0
  const SPEED_OF_LIGHT = 299792.458

  return {
    path,
    totalDistance,
    totalPropagationDelay: (totalDistance / SPEED_OF_LIGHT) * 1000,
    totalVisibilityTime: visibilityTimes.get(targetId) || 0,
    hopCount: path.length - 1,
    links,
  }
}

export function findShortestPathRoute(
  sourceId: string,
  targetId: string,
  satellites: Satellite[],
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

  if (!graph.has(sourceId) || !graph.has(targetId)) {
    return null
  }

  const prev = new Map<string, string | null>()
  const distances = new Map<string, number>()
  const visited = new Set<string>()

  for (const satId of graph.keys()) {
    prev.set(satId, null)
    distances.set(satId, Infinity)
  }
  distances.set(sourceId, 0)

  const queue: { satId: string; distance: number }[] = []
  queue.push({ satId: sourceId, distance: 0 })

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

  if (distances.get(targetId) === Infinity) {
    return null
  }

  const path: string[] = []
  let current: string | null = targetId
  while (current !== null) {
    path.unshift(current)
    current = prev.get(current) || null
  }

  const links: string[] = []
  for (let i = 0; i < path.length - 1; i++) {
    links.push(`${path[i]}-${path[i + 1]}`)
  }

  const totalDistance = distances.get(targetId) || 0
  const SPEED_OF_LIGHT = 299792.458

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
    totalPropagationDelay: (totalDistance / SPEED_OF_LIGHT) * 1000,
    totalVisibilityTime: minVisibility === Infinity ? 0 : minVisibility,
    hopCount: path.length - 1,
    links,
  }
}

const handoverHistory = new Map<string, NeighborEntry[]>()

export function getCandidateSatellitesForHandover(
  terminal: { latitude: number; longitude: number },
  currentSatelliteId: string | null,
  satellites: Satellite[],
  currentTime: number,
): { satId: string; elevation: number; distance: number; visibilityTime: number; handoverCost: number }[] {
  const candidates: { satId: string; elevation: number; distance: number; visibilityTime: number; handoverCost: number }[] = []

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

    const distance = Math.sqrt(
      (sat.position.x - terminalPos.x * EARTH_RADIUS_KM) ** 2 +
      (sat.position.y - terminalPos.y * EARTH_RADIUS_KM) ** 2 +
      (sat.position.z - terminalPos.z * EARTH_RADIUS_KM) ** 2,
    )

    const visibilityTime = estimateTerminalVisibilityTime(terminal, sat, currentTime)

    let handoverCost = 0
    if (currentSatelliteId && sat.id === currentSatelliteId) {
      handoverCost = 0
    } else {
      handoverCost = 10 + (distance / 1000)
    }

    candidates.push({
      satId: sat.id,
      elevation,
      distance,
      visibilityTime,
      handoverCost,
    })
  }

  return candidates.sort((a, b) => {
    const scoreA = a.visibilityTime * 2 + a.elevation - a.handoverCost * 0.5
    const scoreB = b.visibilityTime * 2 + b.elevation - b.handoverCost * 0.5
    return scoreB - scoreA
  })
}

function estimateTerminalVisibilityTime(
  terminal: { latitude: number; longitude: number },
  satellite: Satellite,
  currentTime: number,
  maxCheckSec: number = 600,
  timeStepSec: number = 5,
): number {
  let visibilityTime = 0
  const latRad = (terminal.latitude * Math.PI) / 180
  const lonRad = (terminal.longitude * Math.PI) / 180
  const raanDeg = (360 / Math.max(1, satellite.orbitPlane + 1)) * satellite.orbitPlane

  for (let t = 0; t < maxCheckSec; t += timeStepSec) {
    const checkTime = currentTime + t

    const satPos = calculateSatellitePosition(
      satellite.orbitAltitude,
      satellite.orbitInclination,
      raanDeg,
      satellite.orbitPhase,
      checkTime,
    )

    const satMag = Math.sqrt(satPos.x ** 2 + satPos.y ** 2 + satPos.z ** 2)
    const satDir = {
      x: satPos.x / satMag,
      y: satPos.y / satMag,
      z: satPos.z / satMag,
    }

    const termEcef = {
      x: EARTH_RADIUS_KM * Math.cos(latRad) * Math.cos(lonRad),
      y: EARTH_RADIUS_KM * Math.cos(latRad) * Math.sin(lonRad),
      z: EARTH_RADIUS_KM * Math.sin(latRad),
    }
    const earthRot = 7.2921159e-5 * checkTime
    const cosRot = Math.cos(earthRot)
    const sinRot = Math.sin(earthRot)
    const termEci = {
      x: termEcef.x * cosRot - termEcef.y * sinRot,
      y: termEcef.x * sinRot + termEcef.y * cosRot,
      z: termEcef.z,
    }
    const termMag = Math.sqrt(termEci.x ** 2 + termEci.y ** 2 + termEci.z ** 2)
    const termDir = {
      x: termEci.x / termMag,
      y: termEci.y / termMag,
      z: termEci.z / termMag,
    }

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

export function makeHandoverDecision(
  terminal: { latitude: number; longitude: number; id: string },
  currentSatelliteId: string | null,
  satellites: Satellite[],
  currentTime: number,
): { shouldHandover: boolean; targetSatelliteId: string | null; reason: string } {
  const candidates = getCandidateSatellitesForHandover(
    terminal,
    currentSatelliteId,
    satellites,
    currentTime,
  )

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
    return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Current satellite visibility expiring' }
  }

  if (bestCandidate.satId !== currentSatelliteId) {
    const visibilityGain = bestCandidate.visibilityTime - currentCandidate.visibilityTime
    const elevationGain = bestCandidate.elevation - currentCandidate.elevation

    if (visibilityGain > 120 || (visibilityGain > 30 && elevationGain > 15)) {
      return { shouldHandover: true, targetSatelliteId: bestCandidate.satId, reason: 'Better satellite available' }
    }
  }

  return { shouldHandover: false, targetSatelliteId: currentSatelliteId, reason: 'Stay with current satellite' }
}

export interface CoverageGridPoint {
  latitude: number
  longitude: number
  elevation: number
  satelliteCount: number
  bestSatelliteId: string | null
  maxElevation: number
}

export function calculateCoverageGrid(
  satellites: Satellite[],
  currentTime: number,
  latStep: number = 10,
  lonStep: number = 15,
  minElevationDeg: number = 10,
): CoverageGridPoint[] {
  const grid: CoverageGridPoint[] = []

  for (let lat = -90; lat <= 90; lat += latStep) {
    for (let lon = -180; lon <= 180; lon += lonStep) {
      const latRad = (lat * Math.PI) / 180
      const lonRad = (lon * Math.PI) / 180

      const termEcef = {
        x: EARTH_RADIUS_KM * Math.cos(latRad) * Math.cos(lonRad),
        y: EARTH_RADIUS_KM * Math.cos(latRad) * Math.sin(lonRad),
        z: EARTH_RADIUS_KM * Math.sin(latRad),
      }
      const earthRot = 7.2921159e-5 * currentTime
      const cosRot = Math.cos(earthRot)
      const sinRot = Math.sin(earthRot)
      const termEci = {
        x: termEcef.x * cosRot - termEcef.y * sinRot,
        y: termEcef.x * sinRot + termEcef.y * cosRot,
        z: termEcef.z,
      }
      const termMag = Math.sqrt(termEci.x ** 2 + termEci.y ** 2 + termEci.z ** 2)
      const termDir = {
        x: termEci.x / termMag,
        y: termEci.y / termMag,
        z: termEci.z / termMag,
      }

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
        elevation: maxElevation,
        satelliteCount: satCount,
        bestSatelliteId: bestSatId,
        maxElevation,
      })
    }
  }

  return grid
}

export function exportCoverageToGeoJSON(
  grid: CoverageGridPoint[],
): {
  type: string
  features: Array<{
    type: string
    geometry: { type: string; coordinates: [number, number] }
    properties: CoverageGridPoint
  }>
} {
  return {
    type: 'FeatureCollection',
    features: grid.map(point => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [point.longitude, point.latitude],
      },
      properties: point,
    })),
  }
}

export function exportCoverageToCSV(grid: CoverageGridPoint[]): string {
  const header = 'latitude,longitude,satelliteCount,maxElevation,bestSatelliteId\n'
  const rows = grid
    .map(point =>
      `${point.latitude},${point.longitude},${point.satelliteCount},${point.maxElevation.toFixed(2)},${point.bestSatelliteId || ''}`,
    )
    .join('\n')
  return header + rows
}
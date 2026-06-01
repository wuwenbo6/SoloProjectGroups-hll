import type { GroundTerminal, Link, Satellite } from '../models/types.js'
import { SPEED_OF_LIGHT, EARTH_RADIUS_KM } from './orbitService.js'

type Vec3 = { x: number; y: number; z: number }
type Velocity = { vx: number; vy: number; vz: number }

const HYSTERESIS_FACTOR = 1.15
const MIN_LINK_DURATION_SEC = 2.0
const PREDICTION_HORIZON_SEC = 0.5
const SAME_PLANE_BONUS_KM = 1000

export function calculateDistance(pos1: Vec3, pos2: Vec3): number {
  const dx = pos2.x - pos1.x
  const dy = pos2.y - pos1.y
  const dz = pos2.z - pos1.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function calculatePropagationDelay(pos1: Vec3, pos2: Vec3): number {
  return (calculateDistance(pos1, pos2) / SPEED_OF_LIGHT) * 1000
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

  const beta = relativeVelocity / SPEED_OF_LIGHT
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

interface LinkState {
  establishedAt: number
  lastActiveAt: number
}

const linkStates = new Map<string, LinkState>()

export function findLinksWithHysteresis(
  satellites: Satellite[],
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
      const predAPos = predictPosition(a.position, a.velocity, PREDICTION_HORIZON_SEC)
      const predBPos = predictPosition(b.position, b.velocity, PREDICTION_HORIZON_SEC)
      const futureDist = calculateDistance(predAPos, predBPos)

      const samePlane = a.orbitPlane === b.orbitPlane
      const effectiveConnectThreshold = samePlane ? connectThreshold + SAME_PLANE_BONUS_KM : connectThreshold
      const effectiveDisconnectThreshold = samePlane ? disconnectThreshold + SAME_PLANE_BONUS_KM : disconnectThreshold

      const linkId = `LINK-${a.id}-${b.id}`
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
        const delay = calculatePropagationDelay(a.position, b.position)
        const doppler = calculateDopplerShift(a.position, b.position, a.velocity, b.velocity)

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
          status: 'active',
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

export function findLinks(satellites: Satellite[], thresholdKm: number): Link[] {
  return findLinksWithHysteresis(satellites, thresholdKm, 0)
}

export function findBestSatelliteForTerminal(
  terminal: GroundTerminal,
  satellites: Satellite[],
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

  const TERMINAL_VELOCITY = { vx: 0, vy: 0, vz: 0 }
  const HANDOVER_MARGIN_DEG = 10

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

import type {
  GroundTerminal,
  Link,
  Satellite,
  SimulationConfig,
} from '../models/types.js'
import {
  calculateSatellitePosition,
  calculateSatelliteVelocity,
  generateWalkerConstellation,
} from './orbitService.js'
import {
  findBestSatelliteForTerminal,
  findLinksWithHysteresis,
} from './linkService.js'

const DEFAULT_CONFIG: SimulationConfig = {
  satelliteCount: 30,
  orbitAltitude: 550,
  orbitInclination: 53,
  planeCount: 5,
  timeSpeed: 1,
  linkThreshold: 3000,
}

const DEFAULT_TERMINALS: Omit<GroundTerminal, 'connectedSatelliteId'>[] = [
  { id: 'TERM-NY', name: 'New York', latitude: 40.7128, longitude: -74.006 },
  { id: 'TERM-LON', name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { id: 'TERM-TYO', name: 'Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { id: 'TERM-SYD', name: 'Sydney', latitude: -33.8688, longitude: 151.2093 },
  { id: 'TERM-SAO', name: 'Sao Paulo', latitude: -23.5505, longitude: -46.6333 },
]

const satellites = new Map<string, Satellite>()
const links = new Map<string, Link>()
const terminals = new Map<string, GroundTerminal>()
let config: SimulationConfig = { ...DEFAULT_CONFIG }
let simulationTime = 0

export function initializeConstellation(cfg?: Partial<SimulationConfig>): void {
  config = { ...DEFAULT_CONFIG, ...cfg }
  simulationTime = 0

  const sats = generateWalkerConstellation(config)
  satellites.clear()
  for (const sat of sats) {
    satellites.set(sat.id, sat)
  }

  terminals.clear()
  for (const t of DEFAULT_TERMINALS) {
    terminals.set(t.id, { ...t, connectedSatelliteId: null })
  }

  recalculateTopology()
}

export function updateSimulationTime(timeSec: number): void {
  simulationTime = timeSec
  for (const sat of satellites.values()) {
    const phaseDeg = sat.orbitPhase
    const raanDeg = (360 / Math.max(1, config.planeCount)) * sat.orbitPlane
    sat.position = calculateSatellitePosition(
      sat.orbitAltitude,
      sat.orbitInclination,
      raanDeg,
      phaseDeg,
      simulationTime,
    )
    sat.velocity = calculateSatelliteVelocity(
      sat.orbitAltitude,
      sat.orbitInclination,
      raanDeg,
      phaseDeg,
      simulationTime,
    )
  }
  recalculateTopology()
}

export function advanceSimulationTime(deltaSec: number): void {
  updateSimulationTime(simulationTime + deltaSec)
}

export function getSimulationTime(): number {
  return simulationTime
}

export function recalculateTopology(): void {
  const satList = [...satellites.values()]
  const newLinks = findLinksWithHysteresis(satList, config.linkThreshold, simulationTime)
  links.clear()
  for (const link of newLinks) {
    links.set(link.id, link)
  }

  for (const terminal of terminals.values()) {
    const previousId = terminal.connectedSatelliteId
    terminal.connectedSatelliteId = findBestSatelliteForTerminal(
      terminal,
      satList,
      previousId,
    )
  }
}

export function getSimulationState(): {
  satellites: Satellite[]
  links: Link[]
  terminals: GroundTerminal[]
  config: SimulationConfig
  simulationTime: number
} {
  return {
    satellites: [...satellites.values()],
    links: [...links.values()],
    terminals: [...terminals.values()],
    config,
    simulationTime,
  }
}

export function getSatellite(id: string): Satellite | undefined {
  return satellites.get(id)
}

export function getConfig(): SimulationConfig {
  return { ...config }
}

export function updateConfig(newConfig: Partial<SimulationConfig>): void {
  const needsReinit =
    newConfig.satelliteCount !== undefined ||
    newConfig.orbitAltitude !== undefined ||
    newConfig.orbitInclination !== undefined ||
    newConfig.planeCount !== undefined

  config = { ...config, ...newConfig }

  if (needsReinit) {
    initializeConstellation(config)
  }
}

export function resetSimulation(): void {
  initializeConstellation(DEFAULT_CONFIG)
}

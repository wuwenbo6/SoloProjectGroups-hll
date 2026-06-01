export interface Satellite {
  id: string
  name: string
  orbitPlane: number
  orbitAltitude: number
  orbitInclination: number
  orbitPhase: number
  position: { x: number; y: number; z: number }
  velocity: { vx: number; vy: number; vz: number }
}

export interface Link {
  id: string
  sourceId: string
  targetId: string
  distance: number
  propagationDelay: number
  dopplerShift: number
  status: 'active' | 'inactive'
}

export interface GroundTerminal {
  id: string
  name: string
  latitude: number
  longitude: number
  connectedSatelliteId: string | null
}

export interface SimulationConfig {
  satelliteCount: number
  orbitAltitude: number
  orbitInclination: number
  planeCount: number
  timeSpeed: number
  linkThreshold: number
}

import { create } from 'zustand'
import type { RouteResult, CoverageGridPoint, HandoverDecision } from '@/utils/orbit'

interface Satellite {
  id: string
  name: string
  orbitPlane: number
  position: { x: number; y: number; z: number }
  velocity?: { vx: number; vy: number; vz: number }
}

interface Link {
  id: string
  sourceId: string
  targetId: string
  distance: number
  propagationDelay: number
  dopplerShift: number
}

interface GroundTerminal {
  id: string
  name: string
  latitude: number
  longitude: number
  connectedSatelliteId: string | null
}

interface SimulationConfig {
  satelliteCount: number
  orbitAltitude: number
  orbitInclination: number
  planeCount: number
  timeSpeed: number
  linkThreshold: number
}

interface SimulationState {
  satellites: Satellite[]
  links: Link[]
  groundTerminals: GroundTerminal[]
  config: SimulationConfig
  simulationTime: number
  isPlaying: boolean
  selectedSatelliteId: string | null
  routeSourceId: string | null
  routeTargetId: string | null
  currentRoute: RouteResult | null
  coverageGrid: CoverageGridPoint[] | null
  handoverDecisions: Map<string, HandoverDecision>
  setSatellites: (sats: Satellite[]) => void
  setLinks: (links: Link[]) => void
  setGroundTerminals: (terms: GroundTerminal[]) => void
  setConfig: (config: Partial<SimulationConfig>) => void
  setSimulationTime: (t: number) => void
  setPlaying: (p: boolean) => void
  selectSatellite: (id: string | null) => void
  setRouteSource: (id: string | null) => void
  setRouteTarget: (id: string | null) => void
  setCurrentRoute: (route: RouteResult | null) => void
  setCoverageGrid: (grid: CoverageGridPoint[] | null) => void
  setHandoverDecision: (terminalId: string, decision: HandoverDecision) => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  satellites: [],
  links: [],
  groundTerminals: [],
  config: {
    satelliteCount: 30,
    orbitAltitude: 550,
    orbitInclination: 53,
    planeCount: 5,
    timeSpeed: 1,
    linkThreshold: 3000,
  },
  simulationTime: 0,
  isPlaying: true,
  selectedSatelliteId: null,
  routeSourceId: null,
  routeTargetId: null,
  currentRoute: null,
  coverageGrid: null,
  handoverDecisions: new Map(),
  setSatellites: (sats) => set({ satellites: sats }),
  setLinks: (links) => set({ links }),
  setGroundTerminals: (terms) => set({ groundTerminals: terms }),
  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
  setSimulationTime: (t) => set({ simulationTime: t }),
  setPlaying: (p) => set({ isPlaying: p }),
  selectSatellite: (id) => set({ selectedSatelliteId: id }),
  setRouteSource: (id) => set({ routeSourceId: id }),
  setRouteTarget: (id) => set({ routeTargetId: id }),
  setCurrentRoute: (route) => set({ currentRoute: route }),
  setCoverageGrid: (grid) => set({ coverageGrid: grid }),
  setHandoverDecision: (terminalId, decision) =>
    set((state) => ({
      handoverDecisions: new Map(state.handoverDecisions).set(terminalId, decision),
    })),
}))
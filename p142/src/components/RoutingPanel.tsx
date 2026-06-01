import { useState, useMemo } from 'react'
import {
  Route,
  MapPin,
  Navigation,
  Eye,
  Clock,
  Zap,
  Download,
  RefreshCw,
  FileJson,
  FileText,
  ArrowRight,
  X,
} from 'lucide-react'
import { useSimulationStore } from '@/store/simulation'
import {
  findLongestVisibilityRoute,
  findShortestPathRoute,
  calculateCoverageGrid,
  exportCoverageToGeoJSON,
  exportCoverageToCSV,
  makeHandoverDecision,
  type RouteResult,
} from '@/utils/orbit'

export default function RoutingPanel() {
  const [isOpen, setIsOpen] = useState(true)
  const [routeMode, setRouteMode] = useState<'lva' | 'sp'>('lva')
  const [isCalculating, setIsCalculating] = useState(false)
  const [showCoverage, setShowCoverage] = useState(false)

  const satellites = useSimulationStore((s) => s.satellites)
  const groundTerminals = useSimulationStore((s) => s.groundTerminals)
  const simulationTime = useSimulationStore((s) => s.simulationTime)
  const config = useSimulationStore((s) => s.config)

  const routeSourceId = useSimulationStore((s) => s.routeSourceId)
  const routeTargetId = useSimulationStore((s) => s.routeTargetId)
  const currentRoute = useSimulationStore((s) => s.currentRoute)

  const setRouteSource = useSimulationStore((s) => s.setRouteSource)
  const setRouteTarget = useSimulationStore((s) => s.setRouteTarget)
  const setCurrentRoute = useSimulationStore((s) => s.setCurrentRoute)
  const setCoverageGrid = useSimulationStore((s) => s.setCoverageGrid)
  const setHandoverDecision = useSimulationStore((s) => s.setHandoverDecision)

  const coverageGrid = useSimulationStore((s) => s.coverageGrid)
  const handoverDecisions = useSimulationStore((s) => s.handoverDecisions)

  const constellationData = useMemo(() => {
    return satellites.map(sat => {
      const walkersat = sat as typeof sat & { raan?: number; meanAnomaly?: number; altitude?: number; inclination?: number }
      const planeIndex = sat.orbitPlane
      const raan = (360 / Math.max(1, config.planeCount)) * planeIndex
      const satsPerPlane = Math.max(1, Math.floor(config.satelliteCount / config.planeCount))
      const satIndex = parseInt(sat.id.split('-')[1] || '0', 10)
      const meanAnomaly = (satIndex * 360) / satsPerPlane + (planeIndex * 360) / config.satelliteCount
      return {
        id: sat.id,
        position: sat.position,
        altitude: config.orbitAltitude,
        inclination: config.orbitInclination,
        raan,
        meanAnomaly,
      }
    })
  }, [satellites, config])

  const calculateRoute = async () => {
    if (!routeSourceId || !routeTargetId) return
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 100))

    let route: RouteResult | null = null
    if (routeMode === 'lva') {
      route = findLongestVisibilityRoute(routeSourceId, routeTargetId, constellationData, simulationTime)
    } else {
      route = findShortestPathRoute(routeSourceId, routeTargetId, constellationData, simulationTime)
    }
    setCurrentRoute(route)
    setIsCalculating(false)
  }

  const calculateCoverage = async () => {
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 100))
    const grid = calculateCoverageGrid(satellites, simulationTime, 10, 15, 10)
    setCoverageGrid(grid)
    setShowCoverage(true)
    setIsCalculating(false)
  }

  const calculateAllHandovers = async () => {
    setIsCalculating(true)
    await new Promise(resolve => setTimeout(resolve, 100))
    for (const terminal of groundTerminals) {
      const decision = makeHandoverDecision(
        { latitude: terminal.latitude, longitude: terminal.longitude, id: terminal.id },
        terminal.connectedSatelliteId,
        constellationData,
        simulationTime,
      )
      setHandoverDecision(terminal.id, decision)
    }
    setIsCalculating(false)
  }

  const exportCoverage = (format: 'geojson' | 'csv') => {
    if (!coverageGrid) return
    const content = format === 'geojson'
      ? exportCoverageToGeoJSON(coverageGrid)
      : exportCoverageToCSV(coverageGrid)
    const blob = new Blob([content], {
      type: format === 'geojson' ? 'application/geo+json' : 'text/csv',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `coverage-grid.${format === 'geojson' ? 'geojson' : 'csv'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearRoute = () => {
    setRouteSource(null)
    setRouteTarget(null)
    setCurrentRoute(null)
  }

  return (
    <div className="fixed left-0 bottom-0 w-96 z-30 glass-panel border-t border-r border-laser-cyan/20">
      <div
        className="flex items-center justify-between p-3 border-b border-laser-cyan/10 cursor-pointer hover:bg-laser-cyan/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Navigation size={14} className="text-laser-cyan" />
          <span className="text-laser-cyan font-orbitron text-sm uppercase tracking-widest">
            Routing & Coverage
          </span>
        </div>
        <ArrowRight
          size={16}
          className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
      </div>

      {isOpen && (
        <div className="max-h-80 overflow-y-auto scrollbar-thin p-3 space-y-4">
          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center gap-2 mb-3">
              <Route size={12} className="text-orbit-purple" />
              <span className="text-xs text-gray-400 font-rajdhani uppercase">Route Finder</span>
            </div>

            <div className="flex gap-1 mb-3">
              <button
                onClick={() => setRouteMode('lva')}
                className={`flex-1 text-xs py-1.5 px-2 rounded font-rajdhani transition-colors ${
                  routeMode === 'lva'
                    ? 'bg-laser-cyan/20 text-laser-cyan border border-laser-cyan/40'
                    : 'bg-transparent text-gray-400 border border-transparent hover:text-gray-200'
                }`}
              >
                <Eye size={10} className="inline mr-1" />
                Longest Visibility
              </button>
              <button
                onClick={() => setRouteMode('sp')}
                className={`flex-1 text-xs py-1.5 px-2 rounded font-rajdhani transition-colors ${
                  routeMode === 'sp'
                    ? 'bg-laser-cyan/20 text-laser-cyan border border-laser-cyan/40'
                    : 'bg-transparent text-gray-400 border border-transparent hover:text-gray-200'
                }`}
              >
                <Zap size={10} className="inline mr-1" />
                Shortest Path
              </button>
            </div>

            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-satellite-green" />
                <select
                  value={routeSourceId || ''}
                  onChange={(e) => setRouteSource(e.target.value || null)}
                  className="flex-1 bg-space-blue/80 border border-laser-cyan/20 rounded text-xs text-gray-200 px-2 py-1.5 font-rajdhani focus:outline-none focus:border-laser-cyan/50"
                >
                  <option value="">Select source...</option>
                  {satellites.map((sat) => (
                    <option key={sat.id} value={sat.id}>
                      {sat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-alert-red" />
                <select
                  value={routeTargetId || ''}
                  onChange={(e) => setRouteTarget(e.target.value || null)}
                  className="flex-1 bg-space-blue/80 border border-laser-cyan/20 rounded text-xs text-gray-200 px-2 py-1.5 font-rajdhani focus:outline-none focus:border-laser-cyan/50"
                >
                  <option value="">Select target...</option>
                  {satellites.map((sat) => (
                    <option key={sat.id} value={sat.id}>
                      {sat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={calculateRoute}
                disabled={!routeSourceId || !routeTargetId || isCalculating}
                className="flex-1 bg-laser-cyan/20 hover:bg-laser-cyan/30 disabled:bg-transparent disabled:opacity-50 text-laser-cyan text-xs py-1.5 rounded font-orbitron border border-laser-cyan/40 transition-colors flex items-center justify-center gap-1"
              >
                {isCalculating ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : (
                  <Navigation size={12} />
                )}
                Calculate Route
              </button>
              <button
                onClick={clearRoute}
                className="px-2 text-gray-400 hover:text-gray-200 transition-colors"
                title="Clear route"
              >
                <X size={16} />
              </button>
            </div>

            {currentRoute && (
              <div className="mt-3 pt-3 border-t border-laser-cyan/10 space-y-2 animate-fade-in">
                <div className="text-xs text-gray-400 font-rajdhani">Route Found ({currentRoute.hopCount} hops)</div>
                <div className="flex items-center gap-2 text-xs">
                  <Clock size={10} className="text-orbit-purple" />
                  <span className="text-gray-400 font-rajdhani">Visibility:</span>
                  <span className="text-laser-cyan font-orbitron">
                    {currentRoute.totalVisibilityTime === Infinity ? '∞' : `${currentRoute.totalVisibilityTime}s`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Zap size={10} className="text-orbit-purple" />
                  <span className="text-gray-400 font-rajdhani">Delay:</span>
                  <span className="text-orbit-purple font-orbitron">{currentRoute.totalPropagationDelay.toFixed(2)} ms</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {currentRoute.path.map((satId, i) => (
                    <span key={satId} className="text-xs">
                      <span className="text-satellite-green font-orbitron">{satellites.find(s => s.id === satId)?.name}</span>
                      {i < currentRoute.path.length - 1 && (
                        <ArrowRight size={10} className="inline text-gray-500 mx-0.5" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-satellite-green" />
                <span className="text-xs text-gray-400 font-rajdhani uppercase">Handover Decisions</span>
              </div>
              <button
                onClick={calculateAllHandovers}
                disabled={isCalculating}
                className="text-xs text-laser-cyan hover:text-laser-cyan/80 font-rajdhani transition-colors flex items-center gap-1"
              >
                <RefreshCw size={10} className={isCalculating ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
            <div className="space-y-2">
              {groundTerminals.map((terminal) => {
                const decision = handoverDecisions.get(terminal.id)
                return (
                  <div key={terminal.id} className="text-xs py-1.5 px-2 rounded bg-laser-cyan/5 flex items-center justify-between">
                    <span className="text-gray-300 font-rajdhani">{terminal.name}</span>
                    {decision ? (
                      <span
                        className={`font-orbitron text-xs ${
                          decision.shouldHandover ? 'text-alert-red' : 'text-satellite-green'
                        }`}
                      >
                        {decision.shouldHandover ? 'HANDOVER' : 'STAY'}
                        <span className="text-gray-500 ml-1 font-rajdhani">
                          {decision.targetSatelliteId && satellites.find(s => s.id === decision.targetSatelliteId)?.name}
                        </span>
                      </span>
                    ) : (
                      <span className="text-gray-500 font-rajdhani">Click refresh</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="glass-panel-inner rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-alert-red" />
                <span className="text-xs text-gray-400 font-rajdhani uppercase">Coverage Map</span>
              </div>
              <div className="flex gap-1">
                {showCoverage && coverageGrid && (
                  <>
                    <button
                      onClick={() => exportCoverage('geojson')}
                      className="p-1 text-gray-400 hover:text-laser-cyan transition-colors"
                      title="Export GeoJSON"
                    >
                      <FileJson size={14} />
                    </button>
                    <button
                      onClick={() => exportCoverage('csv')}
                      className="p-1 text-gray-400 hover:text-laser-cyan transition-colors"
                      title="Export CSV"
                    >
                      <FileText size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={calculateCoverage}
              disabled={isCalculating}
              className="w-full bg-orbit-purple/20 hover:bg-orbit-purple/30 disabled:opacity-50 text-orbit-purple text-xs py-1.5 rounded font-orbitron border border-orbit-purple/40 transition-colors flex items-center justify-center gap-1"
            >
              {isCalculating ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              {showCoverage && coverageGrid ? 'Recalculate Coverage' : 'Calculate Coverage Map'}
            </button>
            {showCoverage && coverageGrid && (
              <div className="mt-2 text-xs text-gray-400 font-rajdhani">
                Coverage grid: {coverageGrid.length} points calculated
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
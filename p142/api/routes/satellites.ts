import { Router, type Request, type Response } from 'express'
import {
  getConfig,
  getSatellite,
  getSimulationState,
  getSimulationTime,
  resetSimulation,
  updateConfig,
} from '../services/topologyService.js'
import {
  calculateDopplerShift,
  calculateDopplerCompensation,
  calculatePropagationDelay,
} from '../services/linkService.js'
import {
  findLongestVisibilityRoute,
  findShortestPathRoute,
  makeHandoverDecision,
  calculateCoverageGrid,
  exportCoverageToGeoJSON,
  exportCoverageToCSV,
} from '../services/routingService.js'
import type { SimulationConfig } from '../models/types.js'

const router = Router()

router.get('/satellites', (req: Request, res: Response): void => {
  const state = getSimulationState()
  res.status(200).json({ success: true, data: state.satellites })
})

router.get('/links', (req: Request, res: Response): void => {
  const state = getSimulationState()
  res.status(200).json({ success: true, data: state.links })
})

router.get('/terminals', (req: Request, res: Response): void => {
  const state = getSimulationState()
  res.status(200).json({ success: true, data: state.terminals })
})

router.get('/state', (req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: getSimulationState() })
})

router.post('/calculate/propagation-delay', (req: Request, res: Response): void => {
  const { sourceId, targetId } = req.body as { sourceId: string; targetId: string }
  if (!sourceId || !targetId) {
    res.status(400).json({ success: false, error: 'sourceId and targetId are required' })
    return
  }
  const source = getSatellite(sourceId)
  const target = getSatellite(targetId)
  if (!source || !target) {
    res.status(404).json({ success: false, error: 'Satellite not found' })
    return
  }
  const delay = calculatePropagationDelay(source.position, target.position)
  res.status(200).json({
    success: true,
    data: { sourceId, targetId, propagationDelayMs: delay },
  })
})

router.post('/calculate/doppler', (req: Request, res: Response): void => {
  const {
    sourceId,
    targetId,
    frequency,
  } = req.body as { sourceId: string; targetId: string; frequency?: number }
  if (!sourceId || !targetId) {
    res.status(400).json({ success: false, error: 'sourceId and targetId are required' })
    return
  }
  const source = getSatellite(sourceId)
  const target = getSatellite(targetId)
  if (!source || !target) {
    res.status(404).json({ success: false, error: 'Satellite not found' })
    return
  }
  const freq = frequency ?? 2.4
  const doppler = calculateDopplerShift(
    source.position,
    target.position,
    source.velocity,
    target.velocity,
    freq,
  )
  res.status(200).json({
    success: true,
    data: { sourceId, targetId, frequency: freq, dopplerShiftKhz: doppler },
  })
})

router.post('/calculate/doppler-compensation', (req: Request, res: Response): void => {
  const {
    sourceId,
    targetId,
    frequency,
  } = req.body as { sourceId: string; targetId: string; frequency?: number }
  if (!sourceId || !targetId) {
    res.status(400).json({ success: false, error: 'sourceId and targetId are required' })
    return
  }
  const source = getSatellite(sourceId)
  const target = getSatellite(targetId)
  if (!source || !target) {
    res.status(404).json({ success: false, error: 'Satellite not found' })
    return
  }
  const freq = frequency ?? 2.4
  const compensation = calculateDopplerCompensation(
    source.position,
    target.position,
    source.velocity,
    target.velocity,
    freq,
  )
  res.status(200).json({
    success: true,
    data: { sourceId, targetId, frequency: freq, ...compensation },
  })
})

router.post('/config', (req: Request, res: Response): void => {
  const newConfig = req.body as Partial<SimulationConfig>
  try {
    updateConfig(newConfig)
    res.status(200).json({ success: true, data: getConfig() })
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message })
  }
})

router.post('/reset', (req: Request, res: Response): void => {
  resetSimulation()
  res.status(200).json({ success: true, data: getSimulationState() })
})

router.post('/route/longest-visibility', (req: Request, res: Response): void => {
  const { sourceId, targetId } = req.body as { sourceId: string; targetId: string }
  if (!sourceId || !targetId) {
    res.status(400).json({ success: false, error: 'sourceId and targetId are required' })
    return
  }
  const state = getSimulationState()
  const currentTime = getSimulationTime()
  const route = findLongestVisibilityRoute(sourceId, targetId, state.satellites, currentTime)
  if (!route) {
    res.status(404).json({ success: false, error: 'No route found' })
    return
  }
  res.status(200).json({ success: true, data: route })
})

router.post('/route/shortest-path', (req: Request, res: Response): void => {
  const { sourceId, targetId } = req.body as { sourceId: string; targetId: string }
  if (!sourceId || !targetId) {
    res.status(400).json({ success: false, error: 'sourceId and targetId are required' })
    return
  }
  const state = getSimulationState()
  const currentTime = getSimulationTime()
  const route = findShortestPathRoute(sourceId, targetId, state.satellites, currentTime)
  if (!route) {
    res.status(404).json({ success: false, error: 'No route found' })
    return
  }
  res.status(200).json({ success: true, data: route })
})

router.post('/handover/decision', (req: Request, res: Response): void => {
  const { terminalId, currentSatelliteId } = req.body as { terminalId: string; currentSatelliteId?: string }
  if (!terminalId) {
    res.status(400).json({ success: false, error: 'terminalId is required' })
    return
  }
  const state = getSimulationState()
  const terminal = state.terminals.find(t => t.id === terminalId)
  if (!terminal) {
    res.status(404).json({ success: false, error: 'Terminal not found' })
    return
  }
  const currentTime = getSimulationTime()
  const decision = makeHandoverDecision(
    { latitude: terminal.latitude, longitude: terminal.longitude, id: terminal.id },
    currentSatelliteId ?? terminal.connectedSatelliteId,
    state.satellites,
    currentTime,
  )
  res.status(200).json({ success: true, data: decision })
})

router.get('/coverage', (req: Request, res: Response): void => {
  const { latStep, lonStep, minElevation } = req.query as { latStep?: string; lonStep?: string; minElevation?: string }
  const state = getSimulationState()
  const currentTime = getSimulationTime()
  const grid = calculateCoverageGrid(
    state.satellites,
    currentTime,
    latStep ? Number(latStep) : 10,
    lonStep ? Number(lonStep) : 15,
    minElevation ? Number(minElevation) : 10,
  )
  res.status(200).json({ success: true, data: grid })
})

router.get('/coverage/geojson', (req: Request, res: Response): void => {
  const { latStep, lonStep, minElevation } = req.query as { latStep?: string; lonStep?: string; minElevation?: string }
  const state = getSimulationState()
  const currentTime = getSimulationTime()
  const grid = calculateCoverageGrid(
    state.satellites,
    currentTime,
    latStep ? Number(latStep) : 10,
    lonStep ? Number(lonStep) : 15,
    minElevation ? Number(minElevation) : 10,
  )
  const geojson = exportCoverageToGeoJSON(grid)
  res.setHeader('Content-Type', 'application/geo+json')
  res.status(200).json(geojson)
})

router.get('/coverage/csv', (req: Request, res: Response): void => {
  const { latStep, lonStep, minElevation } = req.query as { latStep?: string; lonStep?: string; minElevation?: string }
  const state = getSimulationState()
  const currentTime = getSimulationTime()
  const grid = calculateCoverageGrid(
    state.satellites,
    currentTime,
    latStep ? Number(latStep) : 10,
    lonStep ? Number(lonStep) : 15,
    minElevation ? Number(minElevation) : 10,
  )
  const csv = exportCoverageToCSV(grid)
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename=coverage-grid.csv')
  res.status(200).send(csv)
})

export default router

import { Router, type Request, type Response } from 'express'
import { computeAllSPP, computeAveragePosition } from '../services/sppSolver.js'
import * as store from '../store/dataStore.js'

const router = Router()

router.get('/:fileId', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const sppResults = data.sppResults.length > 0 ? data.sppResults : computeAllSPP(data.parsed)
  const avgPosition = sppResults.length > 0 ? computeAveragePosition(sppResults) : null

  const summary = sppResults.slice(0, 1000).map((r) => ({
    epoch: r.epoch,
    lat: r.lat,
    lon: r.lon,
    height: r.height,
    numSats: r.numSats,
    pdop: r.pdop,
    hdop: r.hdop,
    vdop: r.vdop,
  }))

  res.json({
    success: true,
    position: avgPosition
      ? {
          lat: avgPosition.lat,
          lon: avgPosition.lon,
          height: avgPosition.height,
          sigmaLat: avgPosition.sigmaLat,
          sigmaLon: avgPosition.sigmaLon,
          sigmaHeight: avgPosition.sigmaHeight,
          avgPdop: avgPosition.avgPdop,
          avgSats: avgPosition.avgSats,
        }
      : null,
    positions: summary,
    epochCount: sppResults.length,
  })
})

router.get('/:fileId/detail', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const sppResults = data.sppResults.length > 0 ? data.sppResults : computeAllSPP(data.parsed)

  res.json({
    success: true,
    results: sppResults.slice(0, 500),
  })
})

export default router

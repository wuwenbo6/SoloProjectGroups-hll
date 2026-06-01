import { Router, type Request, type Response } from 'express'
import { analyzeMW } from '../services/mwCycleSlip.js'
import * as store from '../store/dataStore.js'

const router = Router()

router.get('/:fileId', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const mwData = data.mwData || analyzeMW(data.parsed)

  res.json({
    success: true,
    satellites: mwData.map(m => ({
      system: m.system,
      svId: m.svId,
      signalType1: m.signalType1,
      signalType2: m.signalType2,
      meanMW: m.meanMW,
      stdMW: m.stdMW,
      cycleSlipCount: m.cycleSlips.length,
      halfCycleCount: m.halfCycleCount,
      epochCount: m.mwData.length,
      mwData: m.mwData.slice(0, 1000),
      cycleSlips: m.cycleSlips,
    })),
  })
})

router.get('/:fileId/detail', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const mwData = data.mwData || analyzeMW(data.parsed)

  res.json({
    success: true,
    satellites: mwData,
  })
})

export default router

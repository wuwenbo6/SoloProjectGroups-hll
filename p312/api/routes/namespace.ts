import { Router, type Request, type Response } from 'express'
import { znsEngine, ZNSError } from '../engine/zns.js'

const router = Router()

router.post('/init', (req: Request, res: Response): void => {
  try {
    const { zoneCount, zoneCapacity } = req.body

    if (!zoneCount || !zoneCapacity) {
      res.status(400).json({
        success: false,
        error: 'zoneCount and zoneCapacity are required',
      })
      return
    }

    if (zoneCount < 1 || zoneCount > 256) {
      res.status(400).json({
        success: false,
        error: 'zoneCount must be between 1 and 256',
      })
      return
    }

    if (zoneCapacity < 1 || zoneCapacity > 1048576) {
      res.status(400).json({
        success: false,
        error: 'zoneCapacity must be between 1 and 1048576 LBAs',
      })
      return
    }

    const namespace = znsEngine.initNamespace(
      Number(zoneCount),
      Number(zoneCapacity),
    )
    res.json({ success: true, data: namespace })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.get('/status', (_req: Request, res: Response): void => {
  try {
    const status = znsEngine.getStatus()
    if (!status) {
      res.status(404).json({
        success: false,
        error: 'Namespace not initialized',
      })
      return
    }
    res.json({ success: true, data: status })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.get('/export/csv', (_req: Request, res: Response): void => {
  try {
    const csv = znsEngine.exportZonesCSV()
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="zns-zones-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    res.send(csv)
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

export default router

import { Router, type Request, type Response } from 'express'
import { znsEngine, ZNSError } from '../engine/zns.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  try {
    const zones = znsEngine.getZones()
    res.json({ success: true, data: zones })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const zone = znsEngine.getZone(Number(req.params.id))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(404).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/open', (req: Request, res: Response): void => {
  try {
    const zone = znsEngine.openZone(Number(req.params.id))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/close', (req: Request, res: Response): void => {
  try {
    const zone = znsEngine.closeZone(Number(req.params.id))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/finish', (req: Request, res: Response): void => {
  try {
    const zone = znsEngine.finishZone(Number(req.params.id))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/reset', (req: Request, res: Response): void => {
  try {
    const zone = znsEngine.resetZone(Number(req.params.id))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/write', (req: Request, res: Response): void => {
  try {
    const { size } = req.body
    if (!size || size <= 0) {
      res.status(400).json({
        success: false,
        error: 'Write size must be a positive number',
      })
      return
    }
    const zone = znsEngine.writeZone(Number(req.params.id), Number(size))
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

router.post('/:id/append', (req: Request, res: Response): void => {
  try {
    const { size } = req.body
    const zone = znsEngine.appendZone(
      Number(req.params.id),
      size ? Number(size) : undefined,
    )
    res.json({ success: true, data: zone })
  } catch (error) {
    if (error instanceof ZNSError) {
      res.status(400).json({ success: false, error: error.message })
    } else {
      res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
})

export default router

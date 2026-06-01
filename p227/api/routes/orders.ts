import { Router, type Request, type Response } from 'express'
import { getObservationsByOrderId } from '../db/database.js'

const router = Router()

router.get('/:id/observations', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const observations = getObservationsByOrderId(id)
    res.json({ success: true, data: observations })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router

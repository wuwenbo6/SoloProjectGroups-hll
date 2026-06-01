import { Router, type Request, type Response } from 'express'
import { getPatients, getPatientById, getOrdersByPatientId } from '../db/database.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  try {
    const search = req.query.search as string
    const limit = parseInt(req.query.limit as string) || 100
    const offset = parseInt(req.query.offset as string) || 0
    const patients = getPatients(search, limit, offset)
    res.json({ success: true, data: patients })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const patient = getPatientById(id)
    if (!patient) {
      res.status(404).json({ success: false, error: 'Patient not found' })
      return
    }
    res.json({ success: true, data: patient })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.get('/:id/orders', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id)
    const orders = getOrdersByPatientId(id)
    res.json({ success: true, data: orders })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router

import { Router, type Request, type Response } from 'express'
import { znsEngine } from '../engine/zns.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  const logs = znsEngine.getLogs()
  res.json({ success: true, data: logs })
})

router.delete('/', (_req: Request, res: Response): void => {
  znsEngine.clearLogs()
  res.json({ success: true, data: { message: 'Logs cleared' } })
})

export default router

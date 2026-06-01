import { Router, type Request, type Response } from 'express'
import { extractSnrData } from '../services/snrExtractor.js'
import * as store from '../store/dataStore.js'

const router = Router()

router.get('/:fileId', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  const snrData = extractSnrData(data.parsed)
  res.json({ success: true, satellites: snrData })
})

export default router

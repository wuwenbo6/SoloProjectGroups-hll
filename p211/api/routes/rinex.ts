import { Router, type Request, type Response } from 'express'
import * as store from '../store/dataStore.js'

const router = Router()

router.get('/:fileId', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  res.type('text/plain').send(data.rinex)
})

router.get('/:fileId/download', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }
  const rinexFileName = data.fileName.replace(/\.ubx$/i, '.obs')
  res.setHeader('Content-Disposition', `attachment; filename="${rinexFileName}"`)
  res.type('application/octet-stream').send(data.rinex)
})

export default router

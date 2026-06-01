import { Router, type Request, type Response } from 'express'
import { generateRtcm, generateRtcmReport } from '../services/rtcmEncoder.js'
import * as store from '../store/dataStore.js'

const router = Router()

router.get('/:fileId', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const referenceStationId = parseInt(req.query.stationId as string) || 1000

  const result = generateRtcm(data.parsed, data.sppResults, referenceStationId)
  const report = generateRtcmReport(result)

  res.json({
    success: true,
    messageCount: result.messages.length,
    totalSize: result.totalSize,
    messages: result.messages.slice(0, 50),
    report,
  })
})

router.get('/:fileId/download', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const referenceStationId = parseInt(req.query.stationId as string) || 1000

  const result = generateRtcm(data.parsed, data.sppResults, referenceStationId)
  const rtcFileName = data.fileName.replace(/\.ubx$/i, '.rtcm3')

  res.setHeader('Content-Disposition', `attachment; filename="${rtcFileName}"`)
  res.type('application/octet-stream').send(result.buffer)
})

router.get('/:fileId/report', (req: Request, res: Response) => {
  const data = store.get(req.params.fileId)
  if (!data) {
    res.status(404).json({ success: false, error: 'File not found' })
    return
  }

  const referenceStationId = parseInt(req.query.stationId as string) || 1000

  const result = generateRtcm(data.parsed, data.sppResults, referenceStationId)
  const report = generateRtcmReport(result)

  res.type('text/plain').send(report)
})

export default router

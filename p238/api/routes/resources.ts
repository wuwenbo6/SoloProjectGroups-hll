import { Router, type Request, type Response } from 'express'
import coapManager from '../coap-manager.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  const resources = coapManager.getResources()
  res.json({ success: true, data: resources })
})

router.get('/:uri/history', (req: Request, res: Response) => {
  const uri = '/' + req.params.uri
  const limit = parseInt(req.query.limit as string) || 60
  const history = coapManager.getResourceHistory(uri, limit)
  if (!history) {
    res.status(404).json({ success: false, error: 'Resource not found' })
    return
  }
  res.json({ success: true, data: history })
})

router.get('/export/csv', (_req: Request, res: Response) => {
  const csv = coapManager.exportCsv()
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="coap-observe-data-${timestamp}.csv"`)
  res.send(csv)
})

router.get('/:uri/export/csv', (req: Request, res: Response) => {
  const uri = '/' + req.params.uri
  const csv = coapManager.exportResourceCsv(uri)
  if (!csv) {
    res.status(404).json({ success: false, error: 'Resource not found' })
    return
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = uri.replace(/\//g, '_')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="coap-${safeName}-${timestamp}.csv"`)
  res.send(csv)
})

router.get('/observers/list', (_req: Request, res: Response) => {
  const observers = coapManager.getObserverList()
  res.json({ success: true, data: observers })
})

export default router

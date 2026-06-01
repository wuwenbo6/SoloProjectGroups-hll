import { Router, type Request, type Response } from 'express'
import { SimulationEngine } from '../simulation/simulationEngine.js'

export function createSimulationRoutes(engine: SimulationEngine) {
  const router = Router()

  router.get('/devices', (_req: Request, res: Response) => {
    res.json({ success: true, data: engine.getDevices() })
  })

  router.get('/devices/:id/frames', (req: Request, res: Response) => {
    const frames = engine.getFramesForDevice(req.params.id)
    res.json({ success: true, data: frames })
  })

  router.get('/status', (_req: Request, res: Response) => {
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/start', (_req: Request, res: Response) => {
    engine.start()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/pause', (_req: Request, res: Response) => {
    engine.pause()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.post('/reset', (_req: Request, res: Response) => {
    engine.reset()
    res.json({ success: true, data: engine.getStatus() })
  })

  router.put('/config', (req: Request, res: Response) => {
    engine.setConfig(req.body)
    res.json({ success: true, data: engine.getStatus() })
  })

  router.get('/report', (_req: Request, res: Response) => {
    res.json({ success: true, data: engine.generateReport() })
  })

  router.get('/report/csv', (_req: Request, res: Response) => {
    const csv = engine.exportReportCSV()
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename="energy-report.csv"')
    res.send(csv)
  })

  router.get('/report/json', (_req: Request, res: Response) => {
    const json = engine.exportReportJSON()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="energy-report.json"')
    res.send(json)
  })

  return router
}

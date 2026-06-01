import { Router, type Request, type Response } from 'express'
import { getStats, getDbStats } from '../db/database.js'
import { hl7TCPServer } from '../hl7/tcpServer.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  try {
    const dbStats = getDbStats()
    const dashboardStats = getStats()

    res.json({
      success: true,
      tcpServer: {
        running: hl7TCPServer.isListening(),
        port: hl7TCPServer.getPort(),
        connections: hl7TCPServer.getConnectionCount(),
        messageCount: hl7TCPServer.getMessageCount()
      },
      database: {
        connected: true,
        ...dbStats
      },
      dashboard: dashboardStats,
      features: {
        fhirConversion: true,
        ackGeneration: true,
        escapeSequenceDecoding: true,
        defaultMSH9: true
      }
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.post('/ack/toggle', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ success: false, error: 'enabled must be a boolean' })
      return
    }
    hl7TCPServer.setAutoACK(enabled)
    res.json({ success: true, autoACK: enabled })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = getStats()
    res.json({ success: true, data: stats })
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
  }
})

export default router

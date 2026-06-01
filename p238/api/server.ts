import app from './app.js'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import coapManager from './coap-manager.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

const wss = new WebSocketServer({
  server,
  path: '/ws',
  verifyClient: (info, callback) => {
    callback(true)
  },
})

wss.on('connection', (ws) => {
  console.log('[WS] Client connected')
  coapManager.addWsClient(ws)

  ws.on('close', () => {
    console.log('[WS] Client disconnected')
  })

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message)
  })
})

coapManager.init()

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  coapManager.destroy()
  wss.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  coapManager.destroy()
  wss.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app

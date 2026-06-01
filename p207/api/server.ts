import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import app, { simulationEngine } from './app.js'
import { setupWebSocket } from './simulation/wsHandler.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  setupWebSocket(ws, simulationEngine)
})

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log(`WebSocket server ready on ws://localhost:${PORT}/ws`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  simulationEngine.pause()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  simulationEngine.pause()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app

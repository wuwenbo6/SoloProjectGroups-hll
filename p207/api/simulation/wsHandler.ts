import type { WebSocket } from 'ws'
import type { WSMessage, WSCommand, GPDevice, GPFrame, SimulationStatus, VirtualClock, LightModel } from '../../shared/types.js'
import { SimulationEngine } from './simulationEngine.js'

let clientCounter = 0

export function setupWebSocket(ws: WebSocket, engine: SimulationEngine) {
  const clientId = `client-${++clientCounter}`

  const sendMessage = (type: string, payload: unknown) => {
    if (ws.readyState === ws.OPEN) {
      const message: WSMessage = {
        type: type as WSMessage['type'],
        payload: payload as GPDevice | GPFrame | SimulationStatus | VirtualClock | LightModel | { message: string },
      }
      ws.send(JSON.stringify(message))
    }
  }

  engine.addBroadcastListener(clientId, sendMessage)

  ws.on('close', () => {
    engine.removeBroadcastListener(clientId)
  })

  ws.on('message', (data: Buffer) => {
    try {
      const command: WSCommand = JSON.parse(data.toString())
      handleCommand(command, engine)
    } catch {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'Invalid command' } }))
    }
  })

  const devices = engine.getDevices()
  for (const device of devices) {
    sendMessage('device_state', device)
  }
  sendMessage('simulation_status', engine.getStatus())
  sendMessage('clock_update', engine.getVirtualClock())
  sendMessage('light_update', engine.getLightModel())

  const frames = engine.getAllFrames().slice(-20)
  for (const frame of frames) {
    sendMessage('gp_frame', frame)
  }
}

function handleCommand(command: WSCommand, engine: SimulationEngine) {
  switch (command.type) {
    case 'start':
      engine.start()
      break
    case 'pause':
      engine.pause()
      break
    case 'reset':
      engine.reset()
      break
    case 'set_config':
      if (command.payload) {
        engine.setConfig(command.payload)
      }
      break
  }
}

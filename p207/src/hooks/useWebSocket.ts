import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage, WSCommand, GPDevice, GPFrame, SimulationStatus, VirtualClock, LightModel, CollisionStats } from '../../shared/types'
import { useSimulationStore } from '../store/simulationStore'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { setDevice, addFrame, setSimulationStatus, setVirtualClock, setLightModel, setCollisionStats, setConnected, clearFrames } =
    useSimulationStore()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WSMessage = JSON.parse(event.data)

        switch (message.type) {
          case 'device_state':
            setDevice(message.payload as GPDevice)
            break
          case 'gp_frame':
            addFrame(message.payload as GPFrame)
            break
          case 'simulation_status':
            setSimulationStatus(message.payload as SimulationStatus)
            break
          case 'clock_update':
            setVirtualClock(message.payload as VirtualClock)
            break
          case 'light_update':
            setLightModel(message.payload as LightModel)
            break
          case 'collision_update':
            setCollisionStats(message.payload as CollisionStats)
            break
          case 'energy_update':
            break
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    },
    [setDevice, addFrame, setSimulationStatus, setVirtualClock, setLightModel, setCollisionStats]
  )

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = import.meta.env.VITE_WS_HOST || window.location.hostname
    const port = import.meta.env.VITE_WS_PORT || '3001'
    const wsUrl = `${protocol}//${host}:${port}/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      setConnected(false)
      setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          connect()
        }
      }, 2000)
    }

    ws.onerror = () => {
      setConnected(false)
    }
  }, [handleMessage, setConnected])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const sendCommand = useCallback((command: WSCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(command))
    }
  }, [])

  const startSimulation = useCallback(() => {
    sendCommand({ type: 'start' })
  }, [sendCommand])

  const pauseSimulation = useCallback(() => {
    sendCommand({ type: 'pause' })
  }, [sendCommand])

  const resetSimulation = useCallback(() => {
    clearFrames()
    sendCommand({ type: 'reset' })
  }, [sendCommand, clearFrames])

  const setConfig = useCallback(
    (
      config: Partial<{
        deviceCount?: number
        harvestRateMultiplier?: number
        energyThreshold?: number
        clockSpeedMultiplier?: number
      }>
    ) => {
      sendCommand({ type: 'set_config', payload: config })
    },
    [sendCommand]
  )

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    startSimulation,
    pauseSimulation,
    resetSimulation,
    setConfig,
  }
}

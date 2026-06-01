import { useEffect, useRef } from 'react'
import { useSimulatorStore } from '@/store/simulatorStore'
import type { WSMessage } from '@/types'

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const { setStatus, addEvent, addIOTick, setWsConnected } = useSimulatorStore()
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data)
          if (msg.type === 'status') {
            setStatus(msg.data)
          } else if (msg.type === 'event') {
            addEvent(msg.data)
          } else if (msg.type === 'io_tick') {
            addIOTick(msg.data)
          }
        } catch (e) {
          console.error('Failed to parse WS message', e)
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        reconnectTimeoutRef.current = setTimeout(connect, 2000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close()
    }
  }, [setStatus, addEvent, addIOTick, setWsConnected])
}

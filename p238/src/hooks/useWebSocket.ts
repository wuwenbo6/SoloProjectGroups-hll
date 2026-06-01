import { useEffect, useRef, useCallback } from 'react'
import { useSensorStore } from '@/store/sensorStore'

interface WsMessage {
  type: string
  [key: string]: unknown
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(false)

  const updateSensorData = useSensorStore((s) => s.updateSensorData)
  const setResourceList = useSensorStore((s) => s.setResourceList)
  const setConnectionStatus = useSensorStore((s) => s.setConnectionStatus)

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data as string)

        if (msg.type === 'sensor_data') {
          updateSensorData(
            msg.resource as string,
            msg.value as number,
            msg.unit as string,
            msg.timestamp as number,
            msg.sequence as number
          )
        } else if (msg.type === 'resource_list') {
          setResourceList(msg.resources as never[])
        } else if (msg.type === 'connection_status') {
          setConnectionStatus(
            msg.coapServer as 'online' | 'offline',
            msg.observer as 'active' | 'inactive'
          )
        }
      } catch {
        // ignore parse errors
      }
    },
    [updateSensorData, setResourceList, setConnectionStatus]
  )

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const isDev = import.meta.env.DEV
    const wsUrl = isDev
      ? `${protocol}//${window.location.hostname}:3001/ws`
      : `${protocol}//${window.location.host}/ws`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WS] Connected to server')
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      wsRef.current = null
      if (mountedRef.current) {
        reconnectTimerRef.current = setTimeout(connect, 3000)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [handleMessage])

  useEffect(() => {
    mountedRef.current = true
    reconnectTimerRef.current = setTimeout(connect, 500)

    return () => {
      mountedRef.current = false
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  return wsRef
}

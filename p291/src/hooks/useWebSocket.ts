import { useEffect, useRef, useCallback } from "react"
import { SnmpTrap } from "@/types"
import { useTrapStore } from "@/store/trapStore"

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const addTrap = useTrapStore((s) => s.addTrap)
  const setWsConnected = useTrapStore((s) => s.setWsConnected)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/ws/traps`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setWsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const trap: SnmpTrap = JSON.parse(event.data)
        addTrap(trap)
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setWsConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    wsRef.current = ws
  }, [addTrap, setWsConnected])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])
}

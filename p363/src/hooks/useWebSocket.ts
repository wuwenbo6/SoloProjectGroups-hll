import { useEffect, useRef, useCallback } from 'react'
import { useSimulatorStore } from '@/store'
import type { WSMessage } from '@/types'

const WS_URL = `ws://${window.location.host}/ws`

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    setSimState,
    setImages,
    addLatencyData,
    setConsistencyData,
    setClusterStatus,
    addLogs,
    setFlushStatus,
    setRoleSwitchData,
    setOrphanCleanupData,
    setSnapshotData,
    setConflictData,
    setHistogramData,
  } = useSimulatorStore()

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.debug('[WS] connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)
        switch (msg.type) {
          case 'sync_progress':
            setImages(msg.data as any[])
            break
          case 'latency':
            addLatencyData(msg.data as any)
            break
          case 'consistency':
            setConsistencyData(msg.data as any)
            break
          case 'cluster_status':
            setClusterStatus(msg.data as any)
            break
          case 'flush_status':
            setFlushStatus(msg.data as any)
            break
          case 'role_switch':
            setRoleSwitchData(msg.data as any)
            break
          case 'snapshot':
            setSnapshotData(msg.data as any)
            break
          case 'orphan_cleanup':
            setOrphanCleanupData(msg.data as any)
            break
          case 'conflict':
            setConflictData(msg.data as any)
            break
          case 'histogram':
            setHistogramData(msg.data as any)
            break
          case 'log':
            if (Array.isArray(msg.data)) {
              addLogs(msg.data as any[])
            } else {
              addLogs([msg.data as any])
            }
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      wsRef.current = null
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [
    setSimState,
    setImages,
    addLatencyData,
    setConsistencyData,
    setClusterStatus,
    addLogs,
    setFlushStatus,
    setRoleSwitchData,
    setOrphanCleanupData,
    setSnapshotData,
    setConflictData,
    setHistogramData,
  ])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}

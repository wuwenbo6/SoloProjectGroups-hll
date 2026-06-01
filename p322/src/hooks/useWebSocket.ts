import { useEffect, useRef, useCallback } from "react";
import { useStore } from "@/stores/appStore";
import type { WSEvent } from "@/utils/types";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const applyWSEvent = useStore((s) => s.applyWSEvent);
  const setWsConnected = useStore((s) => s.setWsConnected);
  const addDiscoveryEvent = useStore((s) => s.addDiscoveryEvent);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        applyWSEvent(event);
        if (event.type === "service_discovered" || event.type === "service_lost") {
          addDiscoveryEvent(event);
        }
      } catch {}
    };

    wsRef.current = ws;
  }, [applyWSEvent, setWsConnected, addDiscoveryEvent]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);
}

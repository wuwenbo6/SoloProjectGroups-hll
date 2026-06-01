import { useRef, useCallback, useEffect } from "react";
import { useSCTPStore } from "@/store";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  NetworkConfig,
} from "@/types";

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const sackIntervalRef = useRef<number | null>(null);

  const {
    setConnectionStatus,
    setClientId,
    initStreams,
    resetStore,
    receiveMessage,
    enqueueMessage,
    markMessageSent,
    generateSACK,
    setNetworkConfig,
  } = useSCTPStore();

  const sendSACK = useCallback((streamId: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const sack = generateSACK(streamId);
    const clientMessage: ClientToServerMessage = {
      type: "sack",
      streamId,
      sack,
    };

    wsRef.current.send(JSON.stringify(clientMessage));
  }, [generateSACK]);

  const sendNetworkConfig = useCallback((config: Partial<NetworkConfig>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const clientMessage: ClientToServerMessage = {
      type: "config",
      streamId: 0,
      config: config as NetworkConfig,
    };

    wsRef.current.send(JSON.stringify(clientMessage));
    setNetworkConfig(config);
  }, [setNetworkConfig]);

  const startSACKTimer = useCallback(() => {
    if (sackIntervalRef.current) {
      clearInterval(sackIntervalRef.current);
    }

    sackIntervalRef.current = window.setInterval(() => {
      sendSACK(0);
      sendSACK(1);
    }, 500);
  }, [sendSACK]);

  const stopSACKTimer = useCallback(() => {
    if (sackIntervalRef.current) {
      clearInterval(sackIntervalRef.current);
      sackIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (url: string) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      setConnectionStatus("connecting");

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus("connected");
        initStreams();
        startSACKTimer();
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        stopSACKTimer();
        resetStore();
        wsRef.current = null;
      };

      ws.onerror = () => {
        setConnectionStatus("error");
        stopSACKTimer();
      };

      ws.onmessage = (event) => {
        try {
          const message: ServerToClientMessage = JSON.parse(event.data);

          if (message.type === "connected" && message.clientId) {
            setClientId(message.clientId);
          } else if (
            message.type === "message" ||
            message.type === "sack" ||
            message.type === "expired"
          ) {
            receiveMessage(message);
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };
    },
    [
      setConnectionStatus,
      setClientId,
      initStreams,
      resetStore,
      receiveMessage,
      startSACKTimer,
      stopSACKTimer,
    ]
  );

  const disconnect = useCallback(() => {
    stopSACKTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [stopSACKTimer]);

  const send = useCallback(
    (
      streamId: number,
      content: string,
      lifetime?: number,
      isUnreliable = false
    ) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not connected");
      }

      const message = enqueueMessage(streamId, content, lifetime, isUnreliable);

      const clientMessage: ClientToServerMessage = {
        type: "send",
        streamId,
        content: message.content,
        lifetime,
        isUnreliable,
      };

      wsRef.current.send(JSON.stringify(clientMessage));
      markMessageSent(streamId, message.sequence);

      return message;
    },
    [enqueueMessage, markMessageSent]
  );

  const batchSend = useCallback(
    (streamId: number, count: number, lifetime?: number, isUnreliable = false) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not connected");
      }

      for (let i = 0; i < count; i++) {
        const message = enqueueMessage(
          streamId,
          `Batch message #${i}`,
          lifetime,
          isUnreliable
        );

        const clientMessage: ClientToServerMessage = {
          type: "send",
          streamId,
          content: message.content,
          lifetime,
          isUnreliable,
        };

        wsRef.current.send(JSON.stringify(clientMessage));
        markMessageSent(streamId, message.sequence);
      }
    },
    [enqueueMessage, markMessageSent]
  );

  useEffect(() => {
    return () => {
      stopSACKTimer();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopSACKTimer]);

  return {
    connect,
    disconnect,
    send,
    batchSend,
    sendSACK,
    sendNetworkConfig,
  };
}

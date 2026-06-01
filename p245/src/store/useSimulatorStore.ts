import { create } from "zustand";
import { useRef, useCallback, useEffect } from "react";
import type {
  SimulationConfig, WsServerMessage, FrameLogEntry, SimulatorState, TPMode, ReceiverNodeConfig } from "@/types";

export interface NodeState {
  node_id: number;
  node_name: string;
  node_address: number;
  total_packets: number;
  received_packets: number;
  missing_sequences: number[];
  lost_sequences: number[];
  sequence_error_count: number;
  complete: boolean;
  reassembled_data?: number[];
}

interface SimulatorStore {
  config: SimulationConfig;
  state: SimulatorState;
  mode: TPMode;
  connected: boolean;
  running: boolean;
  frameLogs: FrameLogEntry[];
  totalPackets: number;
  receivedPackets: number;
  missingSequences: number[];
  lostSequences: number[];
  originalMessage: number[];
  reassembledMessage: number[];
  reassemblyComplete: boolean;
  nodeStates: Record<number, NodeState>;
  setConfig: (config: Partial<SimulationConfig>) => void;
  setState: (state: SimulatorState) => void;
  setMode: (mode: TPMode) => void;
  setConnected: (connected: boolean) => void;
  setRunning: (running: boolean) => void;
  addFrameLog: (entry: FrameLogEntry) => void;
  updateProgress: (data: {
    total_packets: number;
    received_packets: number;
    missing_sequences: number[];
    complete: boolean;
    reassembled_data?: number[];
  }) => void;
  updateNodeProgress: (data: NodeState) => void;
  setComplete: (data: {
    total_packets: number;
    received_count: number;
    lost_sequences: number[];
    original_message: number[];
    reassembled_message: number[];
    reassembled_complete: boolean;
    node_results?: any[];
  }) => void;
  updateReceiverNode: (nodeId: number, updates: Partial<ReceiverNodeConfig>) => void;
  addReceiverNode: () => void;
  removeReceiverNode: (nodeId: number) => void;
  reset: () => void;
}

const defaultConfig: SimulationConfig = {
  mode: "bam",
  messageSize: 100,
  sourceAddress: 1,
  destinationAddress: 2,
  packetLossRate: 0,
  frameInterval: 50,
  outOfOrderRate: 0,
  ctsWindowSize: 255,
  ctsTimeout: 1.0,
  ctsLossRate: 0,
  maxRtsRetries: 3,
  receiverNodes: [
    { node_id: 0, name: "节点A", address: 16, packet_loss_rate: 0.0, out_of_order_rate: 0.0 },
    { node_id: 1, name: "节点B", address: 17, packet_loss_rate: 0.0, out_of_order_rate: 0.0 },
    { node_id: 2, name: "节点C", address: 18, packet_loss_rate: 0.0, out_of_order_rate: 0.0 },
  ],
};

export const useSimulatorStore = create<SimulatorStore>((set) => ({
  config: defaultConfig,
  state: "idle",
  mode: "bam",
  connected: false,
  running: false,
  frameLogs: [],
  totalPackets: 0,
  receivedPackets: 0,
  missingSequences: [],
  lostSequences: [],
  originalMessage: [],
  reassembledMessage: [],
  reassemblyComplete: false,
  nodeStates: {},

  setConfig: (config) =>
    set((prev) => ({ config: { ...prev.config, ...config } })),

  setState: (state) => set({ state }),

  setMode: (mode) =>
    set((prev) => ({ mode, config: { ...prev.config, mode } })),

  setConnected: (connected) => set({ connected }),

  setRunning: (running) => set({ running }),

  addFrameLog: (entry) =>
    set((prev) => ({ frameLogs: [...prev.frameLogs, entry] })),

  updateProgress: (data) =>
    set({
      totalPackets: data.total_packets,
      receivedPackets: data.received_packets,
      missingSequences: data.missing_sequences,
      reassemblyComplete: data.complete,
      reassembledMessage: data.reassembled_data || [],
    }),

  updateNodeProgress: (data) =>
    set((prev) => ({
      nodeStates: {
        ...prev.nodeStates,
        [data.node_id]: data,
      },
    })),

  setComplete: (data) =>
    set((prev) => {
      const newNodeStates: Record<number, NodeState> = {};
      if (data.node_results) {
        data.node_results.forEach((node: any) => {
          newNodeStates[node.node_id] = {
            node_id: node.node_id,
            node_name: node.node_name,
            node_address: node.node_address,
            total_packets: node.total_packets,
            received_packets: node.received_count,
            missing_sequences: [],
            lost_sequences: node.lost_sequences,
            sequence_error_count: node.sequence_error_count,
            complete: node.reassembled_complete,
            reassembled_data: node.reassembled_message,
          };
        });
      }
      return {
        totalPackets: data.total_packets,
        receivedPackets: data.received_count,
        lostSequences: data.lost_sequences,
        originalMessage: data.original_message,
        reassembledMessage: data.reassembled_message,
        reassemblyComplete: data.reassembled_complete,
        state: "complete",
        running: false,
        nodeStates: { ...prev.nodeStates, ...newNodeStates },
      };
    }),

  updateReceiverNode: (nodeId, updates) =>
    set((prev) => ({
      config: {
        ...prev.config,
        receiverNodes: prev.config.receiverNodes.map((node) =>
          node.node_id === nodeId ? { ...node, ...updates } : node
        ),
      },
    })),

  addReceiverNode: () =>
    set((prev) => {
      const newId = Math.max(...prev.config.receiverNodes.map((n) => n.node_id), -1) + 1;
      const names = ["节点A", "节点B", "节点C", "节点D", "节点E", "节点F", "节点G", "节点H"];
      const newNode: ReceiverNodeConfig = {
        node_id: newId,
        name: names[newId] || `节点${newId + 1}`,
        address: 0x10 + newId,
        packet_loss_rate: 0.0,
        out_of_order_rate: 0.0,
      };
      return {
        config: {
          ...prev.config,
          receiverNodes: [...prev.config.receiverNodes, newNode],
        },
      };
    }),

  removeReceiverNode: (nodeId) =>
    set((prev) => ({
      config: {
        ...prev.config,
        receiverNodes: prev.config.receiverNodes.filter((n) => n.node_id !== nodeId),
      },
    })),

  reset: () =>
    set({
      state: "idle",
      running: false,
      frameLogs: [],
      totalPackets: 0,
      receivedPackets: 0,
      missingSequences: [],
      lostSequences: [],
      originalMessage: [],
      reassembledMessage: [],
      reassemblyComplete: false,
      nodeStates: {},
    }),
}));

export function useWebSocket(autoConnect: boolean = true) {
  const wsRef = useRef<WebSocket | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const storeRef = useRef(useSimulatorStore.getState());

  useEffect(() => {
    const unsubscribe = useSimulatorStore.subscribe((state) => {
      storeRef.current = state;
    });
    return unsubscribe;
  }, []);

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WsServerMessage = JSON.parse(event.data);
      const store = storeRef.current;

      if (message.type === "state_change") {
        const payload = message.payload as any;
        store.setState(payload.to);
        store.addFrameLog({
          id: `log-${Date.now()}-${Math.random()}`,
          type: "state_change",
          timestamp: payload.timestamp,
          data: payload,
        });
      } else if (message.type === "reassembly_progress") {
        const payload = message.payload as any;
        store.updateProgress(payload);
      } else if (message.type === "node_progress") {
        const payload = message.payload as any;
        store.updateNodeProgress(payload);
      } else if (message.type === "simulation_complete") {
        const payload = message.payload as any;
        store.setComplete(payload);
      } else if (message.type === "simulation_started") {
        store.setRunning(true);
      } else if (message.type === "simulation_stopped") {
        store.setRunning(false);
      } else if (message.type === "simulation_reset") {
        store.reset();
      } else if (
        [
          "bam_announce",
          "rts_sent",
          "rts_retry",
          "rts_timeout",
          "cts_sent",
          "frame_sent",
          "frame_received",
          "frame_lost",
          "frame_retransmit",
          "sequence_error",
          "eom_ack",
          "node_receive",
        ].includes(message.type)
      ) {
        store.addFrameLog({
          id: `log-${Date.now()}-${Math.random()}`,
          type: message.type,
          timestamp: (message.payload as any).timestamp,
          data: message.payload,
        });
      }
    } catch (e) {
      console.error("WebSocket消息解析错误:", e);
    }
  }, []);

  const connect = useCallback((url: string = "ws://localhost:8000/ws") => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return () => {};
    }

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      storeRef.current.setConnected(true);
      const queue = messageQueueRef.current;
      while (queue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const msg = queue.shift();
        if (msg) ws.send(msg);
      }
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      storeRef.current.setConnected(false);
      wsRef.current = null;
    };

    ws.onerror = (error) => {
      console.error("WebSocket错误:", error);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [handleMessage]);

  const send = useCallback((message: object) => {
    const data = JSON.stringify(message);
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    } else {
      messageQueueRef.current.push(data);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!autoConnect) return () => {};
    const cleanup = connect();
    return cleanup;
  }, [autoConnect, connect]);

  return { connect, disconnect, send };
}

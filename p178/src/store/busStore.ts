import { create } from 'zustand';
import type { BusNode, LogEntry, WaveformSample, BusStatistics, ModbusRTUFrame } from '../types/bus';
import { NODE_COLORS } from '../types/bus';
import { generateNodeId } from '../engine/busEngine';

interface BusStore {
  nodes: BusNode[];
  selectedNodeIds: string[];
  waveform: WaveformSample[];
  logs: LogEntry[];
  winnerNodeId: string | null;
  loserNodeIds: string[];
  isSimulating: boolean;
  totalRounds: number;
  nodeBackoffCounts: Record<string, number>;
  nodeBackoffDelays: Record<string, number>;
  statistics: BusStatistics | null;
  successfulModbusFrames: ModbusRTUFrame[];
  useModbus: boolean;

  addNode: () => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, updates: Partial<BusNode>) => void;
  toggleNodeSelection: (id: string) => void;
  selectAllNodes: () => void;
  clearSelection: () => void;
  setSimulationResult: (
    waveform: WaveformSample[],
    logs: LogEntry[],
    winnerNodeId: string | null,
    loserNodeIds: string[],
    nodeBackoffCounts: Record<string, number>,
    nodeBackoffDelays: Record<string, number>,
    totalRounds: number,
    statistics: BusStatistics,
    successfulModbusFrames: ModbusRTUFrame[]
  ) => void;
  setSimulating: (simulating: boolean) => void;
  resetSimulation: () => void;
  clearLogs: () => void;
  toggleUseModbus: () => void;
}

let colorIndex = 0;

export const useBusStore = create<BusStore>((set, get) => ({
  nodes: [
    {
      id: generateNodeId(),
      address: 0x01,
      name: '节点A',
      data: 'A5',
      status: 'idle',
      color: NODE_COLORS[0],
      backoffCount: 0,
      backoffDelay: 0,
    },
    {
      id: generateNodeId(),
      address: 0x0F,
      name: '节点B',
      data: '5A',
      status: 'idle',
      color: NODE_COLORS[1],
      backoffCount: 0,
      backoffDelay: 0,
    },
    {
      id: generateNodeId(),
      address: 0x03,
      name: '节点C',
      data: 'FF',
      status: 'idle',
      color: NODE_COLORS[2],
      backoffCount: 0,
      backoffDelay: 0,
    },
  ],
  selectedNodeIds: [],
  waveform: [],
  logs: [],
  winnerNodeId: null,
  loserNodeIds: [],
  isSimulating: false,
  totalRounds: 0,
  nodeBackoffCounts: {},
  nodeBackoffDelays: {},
  statistics: null,
  successfulModbusFrames: [],
  useModbus: true,

  addNode: () => {
    const { nodes } = get();
    const maxAddress = nodes.reduce((max, n) => Math.max(max, n.address), 0);
    colorIndex = (colorIndex + 1) % NODE_COLORS.length;
    const newNode: BusNode = {
      id: generateNodeId(),
      address: Math.min(maxAddress + 1, 254),
      name: `节点${String.fromCharCode(65 + nodes.length)}`,
      data: '00',
      status: 'idle',
      color: NODE_COLORS[colorIndex],
      backoffCount: 0,
      backoffDelay: 0,
    };
    set({ nodes: [...nodes, newNode] });
  },

  removeNode: (id: string) => {
    const { nodes, selectedNodeIds } = get();
    set({
      nodes: nodes.filter(n => n.id !== id),
      selectedNodeIds: selectedNodeIds.filter(sid => sid !== id),
    });
  },

  updateNode: (id: string, updates: Partial<BusNode>) => {
    const { nodes } = get();
    set({
      nodes: nodes.map(n => (n.id === id ? { ...n, ...updates } : n)),
    });
  },

  toggleNodeSelection: (id: string) => {
    const { selectedNodeIds } = get();
    if (selectedNodeIds.includes(id)) {
      set({ selectedNodeIds: selectedNodeIds.filter(sid => sid !== id) });
    } else {
      set({ selectedNodeIds: [...selectedNodeIds, id] });
    }
  },

  selectAllNodes: () => {
    const { nodes } = get();
    set({ selectedNodeIds: nodes.map(n => n.id) });
  },

  clearSelection: () => {
    set({ selectedNodeIds: [] });
  },

  setSimulationResult: (
    waveform,
    logs,
    winnerNodeId,
    loserNodeIds,
    nodeBackoffCounts,
    nodeBackoffDelays,
    totalRounds,
    statistics,
    successfulModbusFrames
  ) => {
    const { nodes } = get();
    const updatedNodes = nodes.map(n => {
      if (n.id === winnerNodeId) {
        return { ...n, status: 'won' as const, backoffCount: 0, backoffDelay: 0 };
      }
      if (loserNodeIds.includes(n.id)) {
        const backoffCount = nodeBackoffCounts[n.id] || 0;
        const backoffDelay = nodeBackoffDelays[n.id] || 0;
        return { ...n, status: backoffCount > 0 ? 'backoff' as const : 'lost' as const, backoffCount, backoffDelay };
      }
      return { ...n, status: 'idle' as const, backoffCount: 0, backoffDelay: 0 };
    });
    set({
      waveform,
      logs,
      winnerNodeId,
      loserNodeIds,
      nodes: updatedNodes,
      isSimulating: false,
      totalRounds,
      nodeBackoffCounts,
      nodeBackoffDelays,
      statistics,
      successfulModbusFrames,
    });
  },

  setSimulating: (simulating: boolean) => {
    set({ isSimulating: simulating });
  },

  resetSimulation: () => {
    const { nodes } = get();
    const resetNodes = nodes.map(n => ({ ...n, status: 'idle' as const, backoffCount: 0, backoffDelay: 0 }));
    set({
      waveform: [],
      logs: [],
      winnerNodeId: null,
      loserNodeIds: [],
      nodes: resetNodes,
      isSimulating: false,
      totalRounds: 0,
      nodeBackoffCounts: {},
      nodeBackoffDelays: {},
      statistics: null,
      successfulModbusFrames: [],
    });
  },

  clearLogs: () => {
    set({ logs: [] });
  },

  toggleUseModbus: () => {
    const { useModbus } = get();
    set({ useModbus: !useModbus });
  },
}));

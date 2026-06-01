import { create } from "zustand";
import type { ParseResult, HistoryRecord, TimelineEvent, SimulationOperation } from "@/types/s7comm";

interface S7CommStore {
  parseResult: ParseResult | null;
  parseLoading: boolean;
  parseError: string | null;
  history: HistoryRecord[];
  sessionId: string | null;
  sessionConnected: boolean;
  simulationOperations: SimulationOperation[];
  timelineEvents: TimelineEvent[];
  wsConnected: boolean;

  setParseResult: (result: ParseResult | null) => void;
  setParseLoading: (loading: boolean) => void;
  setParseError: (error: string | null) => void;
  setHistory: (history: HistoryRecord[]) => void;
  addHistory: (record: HistoryRecord) => void;
  removeHistory: (id: number) => void;
  clearHistory: () => void;
  setSessionId: (id: string | null) => void;
  setSessionConnected: (connected: boolean) => void;
  addSimulationOperation: (op: SimulationOperation) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  clearTimeline: () => void;
  setWsConnected: (connected: boolean) => void;
}

export const useS7CommStore = create<S7CommStore>((set) => ({
  parseResult: null,
  parseLoading: false,
  parseError: null,
  history: [],
  sessionId: null,
  sessionConnected: false,
  simulationOperations: [],
  timelineEvents: [],
  wsConnected: false,

  setParseResult: (result) => set({ parseResult: result }),
  setParseLoading: (loading) => set({ parseLoading: loading }),
  setParseError: (error) => set({ parseError: error }),
  setHistory: (history) => set({ history }),
  addHistory: (record) => set((state) => ({ history: [record, ...state.history] })),
  removeHistory: (id) => set((state) => ({ history: state.history.filter((r) => r.id !== id) })),
  clearHistory: () => set({ history: [] }),
  setSessionId: (id) => set({ sessionId: id }),
  setSessionConnected: (connected) => set({ sessionConnected: connected }),
  addSimulationOperation: (op) => set((state) => ({ simulationOperations: [...state.simulationOperations, op] })),
  addTimelineEvent: (event) => set((state) => ({ timelineEvents: [...state.timelineEvents, event] })),
  clearTimeline: () => set({ timelineEvents: [] }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
}));

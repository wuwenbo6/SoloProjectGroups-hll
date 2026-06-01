import { create } from "zustand";
import type { ODUType, MappingType, SimulatorState, ODUOverhead, ClientSignalType, MuxDiagram } from "@/types/otn";
import { api } from "@/utils/api";

interface OTNStore {
  state: SimulatorState | null;
  loading: boolean;
  error: string | null;
  selectedOduType: ODUType;
  mappingType: MappingType;
  overheadDrawerOpen: boolean;
  selectedTimeslot: number | null;
  muxDiagram: MuxDiagram | null;
  diagramModalOpen: boolean;

  fetchState: (oduType?: ODUType) => Promise<void>;
  setOduType: (oduType: ODUType) => Promise<void>;
  setMappingType: (mappingType: MappingType) => Promise<void>;
  addODU0: (name?: string) => Promise<void>;
  addSignal: (name: string, signalType: ClientSignalType, tsCount: number, bitrateGbps?: number) => Promise<void>;
  removeODU0: (signalId: string) => Promise<void>;
  multiplex: (odu0Id: string, tsIndex?: number) => Promise<void>;
  demultiplex: (tsIndex: number) => Promise<void>;
  updateOverhead: (overhead: ODUOverhead) => Promise<void>;
  setOverheadDrawerOpen: (open: boolean) => void;
  setSelectedTimeslot: (index: number | null) => void;
  allocateTimeslot: (odu0Id: string, tsIndex: number) => Promise<void>;
  releaseTimeslot: (tsIndex: number) => Promise<void>;
  simulateSignalLoss: (tsIndex: number) => Promise<void>;
  clearAlarm: (tsIndex: number) => Promise<void>;
  fetchMuxDiagram: (format?: "json" | "mermaid" | "svg") => Promise<void>;
  setDiagramModalOpen: (open: boolean) => void;
}

const initialState: SimulatorState = {
  frame: {
    oduType: "ODU2",
    rows: 4,
    columns: 3824,
    payloadColumns: 3808,
    numTimeslots: 8,
    bitrateGbps: 10.037318,
    data: [],
    zones: [],
  },
  overhead: {
    fas: [0xf6, 0xf6, 0xf6, 0x28, 0x28, 0x28],
    mfas: 0,
    pm: { tti: [], bdi: false, tim: false, bei: 0, biae: false, status: 0 },
    tcm: [],
    aps: [0, 0, 0, 0],
    exp: [0, 0],
    opuk: { pt: 0x20, psi: [], jc: [0, 0, 0, 0], jo: [0, 0, 0, 0], njo: 0, pjo: 0 },
  },
  timeslots: Array.from({ length: 8 }, (_, i) => ({
    index: i + 1,
    occupied: false,
    odu0Id: null,
    mappingType: null as MappingType | null,
    lck: false,
    signalType: "ODU0" as ClientSignalType,
    tsCount: 1,
    isLead: false,
  })),
  odu0Signals: [],
  mappingType: "GMP",
  oduType: "ODU2",
  justification: {},
  alarms: [],
};

export const useOTNStore = create<OTNStore>((set, get) => ({
  state: initialState,
  loading: false,
  error: null,
  selectedOduType: "ODU2",
  mappingType: "GMP",
  overheadDrawerOpen: false,
  selectedTimeslot: null,
  muxDiagram: null,
  diagramModalOpen: false,

  fetchState: async (oduType?: ODUType) => {
    set({ loading: true, error: null });
    try {
      const state = await api.getFrame(oduType || get().selectedOduType);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setOduType: async (oduType: ODUType) => {
    set({ selectedOduType: oduType, loading: true, error: null });
    try {
      const state = await api.getFrame(oduType);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setMappingType: async (mappingType: MappingType) => {
    set({ mappingType });
    try {
      const state = await api.setMapping(get().selectedOduType, mappingType);
      set({ state });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  addODU0: async (name?: string) => {
    set({ loading: true, error: null });
    try {
      const result = await api.addODU0(get().selectedOduType, name);
      set({ state: result.state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  addSignal: async (name: string, signalType: ClientSignalType, tsCount: number, bitrateGbps?: number) => {
    set({ loading: true, error: null });
    try {
      const result = await api.addSignal(get().selectedOduType, name, signalType, tsCount, bitrateGbps);
      set({ state: result.state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  removeODU0: async (signalId: string) => {
    set({ loading: true, error: null });
    try {
      const state = await api.removeODU0(get().selectedOduType, signalId);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  multiplex: async (odu0Id: string, tsIndex?: number) => {
    set({ loading: true, error: null });
    try {
      const state = await api.multiplex(get().selectedOduType, odu0Id, tsIndex, get().mappingType);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  demultiplex: async (tsIndex: number) => {
    set({ loading: true, error: null });
    try {
      const state = await api.demultiplex(get().selectedOduType, tsIndex);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  updateOverhead: async (overhead: ODUOverhead) => {
    set({ loading: true, error: null });
    try {
      const state = await api.updateOverhead(get().selectedOduType, overhead);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setOverheadDrawerOpen: (open: boolean) => set({ overheadDrawerOpen: open }),
  setSelectedTimeslot: (index: number | null) => set({ selectedTimeslot: index }),

  allocateTimeslot: async (odu0Id: string, tsIndex: number) => {
    set({ loading: true, error: null });
    try {
      const timeslots = await api.allocateTimeslot(get().selectedOduType, odu0Id, tsIndex, get().mappingType);
      const state = get().state;
      if (state) {
        set({ state: { ...state, timeslots }, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  releaseTimeslot: async (tsIndex: number) => {
    set({ loading: true, error: null });
    try {
      const timeslots = await api.releaseTimeslot(get().selectedOduType, tsIndex);
      const state = get().state;
      if (state) {
        set({ state: { ...state, timeslots }, loading: false });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  simulateSignalLoss: async (tsIndex: number) => {
    set({ loading: true, error: null });
    try {
      const state = await api.simulateSignalLoss(get().selectedOduType, tsIndex);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  clearAlarm: async (tsIndex: number) => {
    set({ loading: true, error: null });
    try {
      const state = await api.clearAlarm(get().selectedOduType, tsIndex);
      set({ state, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchMuxDiagram: async (format: "json" | "mermaid" | "svg" = "svg") => {
    set({ loading: true, error: null });
    try {
      const diagram = await api.getMuxDiagram(get().selectedOduType, format);
      set({ muxDiagram: diagram, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  setDiagramModalOpen: (open: boolean) => set({ diagramModalOpen: open }),
}));

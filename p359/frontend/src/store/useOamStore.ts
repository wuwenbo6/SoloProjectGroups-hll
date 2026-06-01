import { create } from 'zustand';
import { OAMState, OAMEvent, PDUData, NodeConfig } from '../types';

interface OAMStore {
  state: OAMState;
  events: OAMEvent[];
  pdus: PDUData[];
  latestPdu: PDUData | null;
  setState: (state: OAMState) => void;
  addEvent: (event: OAMEvent) => void;
  addPdu: (pdu: PDUData) => void;
  setEvents: (events: OAMEvent[]) => void;
  setPdus: (pdus: PDUData[]) => void;
  reset: () => void;
}

const initialState: OAMState = {
  simulation_running: false,
  discovery_state: 'idle',
  link_status: 'down',
  nodes: [
    {
      id: 'node-a',
      name: 'Node A',
      mac_address: '00:11:22:33:44:55',
      mode: 'active',
      loopback_mode: 'none',
    },
    {
      id: 'node-b',
      name: 'Node B',
      mac_address: 'AA:BB:CC:DD:EE:FF',
      mode: 'passive',
      loopback_mode: 'none',
    },
  ],
  local_state: 'IDLE',
  remote_state: 'IDLE',
  local_mac: '00:11:22:33:44:55',
  remote_mac: 'AA:BB:CC:DD:EE:FF',
};

export const useOamStore = create<OAMStore>((set) => ({
  state: initialState,
  events: [],
  pdus: [],
  latestPdu: null,
  setState: (newState: OAMState) => set({ state: newState }),
  addEvent: (event: OAMEvent) => set((state) => ({
    events: [...state.events, event].slice(-200),
  })),
  addPdu: (pdu: PDUData) => set((state) => ({
    pdus: [...state.pdus, pdu].slice(-200),
    latestPdu: pdu,
  })),
  setEvents: (events: OAMEvent[]) => set({ events }),
  setPdus: (pdus: PDUData[]) => set({ pdus, latestPdu: pdus[pdus.length - 1] || null }),
  reset: () => set({
    state: initialState,
    events: [],
    pdus: [],
    latestPdu: null,
  }),
}));

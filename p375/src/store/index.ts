import { create } from 'zustand';
import type { Port, MacTableEntry, MirrorRule, PacketInfo, SwitchStatus, LogEntry, PacketStats } from '../types';

interface SimulatorState {
  switchStatus: SwitchStatus | null;
  ports: Port[];
  macTable: MacTableEntry[];
  mirrorRules: MirrorRule[];
  originalPackets: PacketInfo[];
  mirrorPackets: PacketInfo[];
  logs: LogEntry[];
  selectedPacket: PacketInfo | null;
  stats: PacketStats;

  setSwitchStatus: (status: SwitchStatus) => void;
  setPorts: (ports: Port[]) => void;
  updatePort: (port: Port) => void;
  setMacTable: (entries: MacTableEntry[]) => void;
  addMacEntry: (entry: MacTableEntry) => void;
  setMirrorRules: (rules: MirrorRule[]) => void;
  addOriginalPacket: (packet: PacketInfo) => void;
  addMirrorPacket: (packet: PacketInfo) => void;
  addLog: (log: LogEntry) => void;
  setSelectedPacket: (packet: PacketInfo | null) => void;
  clearAll: () => void;
  clearLogs: () => void;
  calculateStats: () => void;
}

const MAX_PACKETS = 100;
const MAX_LOGS = 200;

const initialStats: PacketStats = {
  total: 0,
  original: 0,
  mirror: 0,
  tcp: 0,
  udp: 0,
  icmp: 0,
  other: 0,
};

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  switchStatus: null,
  ports: [],
  macTable: [],
  mirrorRules: [],
  originalPackets: [],
  mirrorPackets: [],
  logs: [],
  selectedPacket: null,
  stats: initialStats,

  setSwitchStatus: (status) => set({ switchStatus: status }),

  setPorts: (ports) => set({ ports }),

  updatePort: (port) =>
    set((state) => ({
      ports: state.ports.map((p) => (p.id === port.id ? port : p)),
    })),

  setMacTable: (entries) => set({ macTable: entries }),

  addMacEntry: (entry) =>
    set((state) => {
      const exists = state.macTable.some((e) => e.macAddress === entry.macAddress);
      if (exists) {
        return {
          macTable: state.macTable.map((e) =>
            e.macAddress === entry.macAddress ? entry : e
          ),
        };
      }
      return { macTable: [...state.macTable, entry] };
    }),

  setMirrorRules: (rules) => set({ mirrorRules: rules }),

  addOriginalPacket: (packet) =>
    set((state) => {
      const newPackets = [packet, ...state.originalPackets].slice(0, MAX_PACKETS);
      return { originalPackets: newPackets };
    }),

  addMirrorPacket: (packet) =>
    set((state) => {
      const newPackets = [packet, ...state.mirrorPackets].slice(0, MAX_PACKETS);
      return { mirrorPackets: newPackets };
    }),

  addLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs].slice(0, MAX_LOGS),
    })),

  setSelectedPacket: (packet) => set({ selectedPacket: packet }),

  clearAll: () =>
    set({
      originalPackets: [],
      mirrorPackets: [],
      logs: [],
      macTable: [],
      stats: initialStats,
    }),

  clearLogs: () =>
    set({
      logs: [],
    }),

  calculateStats: () => {
    const { originalPackets, mirrorPackets } = get();
    const allPackets = [...originalPackets, ...mirrorPackets];

    const stats: PacketStats = {
      total: allPackets.length,
      original: originalPackets.length,
      mirror: mirrorPackets.length,
      tcp: 0,
      udp: 0,
      icmp: 0,
      other: 0,
    };

    allPackets.forEach((p) => {
      const proto = p.transport?.protocol;
      if (proto === 'tcp') stats.tcp++;
      else if (proto === 'udp') stats.udp++;
      else if (proto === 'icmp') stats.icmp++;
      else stats.other++;
    });

    set({ stats });
  },
}));

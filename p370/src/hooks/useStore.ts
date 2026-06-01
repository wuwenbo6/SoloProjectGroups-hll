import { create } from 'zustand';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'recovering' | 'fault';
export type CommandStatus = 'PENDING' | 'ACTIVE' | 'RETRANSMITTING' | 'COMPLETED' | 'FAILED';

export interface TargetStatus {
  is_running: boolean;
  connection_state: ConnectionState;
  erl_level: 0 | 1 | 2;
  uptime: number;
  initiator_iqn: string | null;
  target_iqn: string;
  listen_address: string;
}

export interface Statistics {
  totalCommands: number;
  successfulCommands: number;
  retransmittedCommands: number;
  failedCommands: number;
  totalRetries: number;
  activeCommands: number;
  faultCount: number;
  recoveryCount: number;
  averageRecoveryTime: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'INFO' | 'DEBUG' | 'WARNING' | 'ERROR';
  direction: 'IN' | 'OUT' | 'SYSTEM';
  message: string;
  pduType?: string;
  connectionId?: string;
}

export interface CommandRecord {
  id: string;
  cmdSN: number;
  expStatSN: number;
  opcode: string;
  status: CommandStatus;
  retryCount: number;
  createdAt: number;
  completedAt?: number;
  events: CommandEvent[];
}

export interface CommandEvent {
  type: string;
  timestamp: number;
  connectionId?: string;
  reason?: string;
}

interface StoreState {
  status: TargetStatus;
  stats: Statistics;
  logs: LogEntry[];
  commands: CommandRecord[];
  logFilter: string;
  isLogPaused: boolean;

  setStatus: (status: Partial<TargetStatus>) => void;
  setStats: (stats: Partial<Statistics>) => void;
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  setCommands: (commands: CommandRecord[]) => void;
  setLogFilter: (filter: string) => void;
  toggleLogPause: () => void;
}

const defaultStatus: TargetStatus = {
  is_running: false,
  connection_state: 'disconnected',
  erl_level: 1,
  uptime: 0,
  initiator_iqn: null,
  target_iqn: 'iqn.2024.com.example:iscsi-target',
  listen_address: '0.0.0.0:3260',
};

const defaultStats: Statistics = {
  totalCommands: 0,
  successfulCommands: 0,
  retransmittedCommands: 0,
  failedCommands: 0,
  totalRetries: 0,
  activeCommands: 0,
  faultCount: 0,
  recoveryCount: 0,
  averageRecoveryTime: 0,
};

export const useStore = create<StoreState>((set) => ({
  status: defaultStatus,
  stats: defaultStats,
  logs: [],
  commands: [],
  logFilter: '',
  isLogPaused: false,

  setStatus: (status) =>
    set((state) => ({ status: { ...state.status, ...status } })),

  setStats: (stats) =>
    set((state) => ({ stats: { ...state.stats, ...stats } })),

  addLog: (log) =>
    set((state) => {
      if (state.isLogPaused) return state;
      const logs = [...state.logs, log].slice(-500);
      return { logs };
    }),

  clearLogs: () => set({ logs: [] }),

  setCommands: (commands) => set({ commands }),

  setLogFilter: (filter) => set({ logFilter: filter }),

  toggleLogPause: () => set((state) => ({ isLogPaused: !state.isLogPaused })),
}));

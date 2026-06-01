import { create } from 'zustand';
import type { UartConfig, TelnetConfig, TransportType } from '../../shared/types';

interface ConnectionHistoryEntry {
  transport: TransportType;
  config: UartConfig | TelnetConfig;
  label: string;
  timestamp: number;
}

interface FileUploadState {
  filename: string;
  percent: number;
  status: 'idle' | 'uploading' | 'complete' | 'error';
  error?: string;
}

interface OutputHistoryEntry {
  type: 'input' | 'output';
  content: string;
  timestamp: number;
}

interface ReplState {
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  transportType: TransportType;
  uartConfig: UartConfig;
  telnetConfig: TelnetConfig;
  commandHistory: string[];
  connectionHistory: ConnectionHistoryEntry[];
  outputHistory: OutputHistoryEntry[];
  errorMessage: string;
  fileUpload: FileUploadState;
}

interface ReplActions {
  setTransportType: (type: TransportType) => void;
  updateUartConfig: (config: Partial<UartConfig>) => void;
  updateTelnetConfig: (config: Partial<TelnetConfig>) => void;
  setConnectionState: (state: ReplState['connectionState']) => void;
  setErrorMessage: (message: string) => void;
  addCommandHistory: (command: string) => void;
  addConnectionHistory: (entry: ConnectionHistoryEntry) => void;
  removeConnectionHistory: (timestamp: number) => void;
  loadConnectionHistory: () => void;
  clearError: () => void;
  addOutputHistory: (entry: OutputHistoryEntry) => void;
  clearOutputHistory: () => void;
  setFileUpload: (state: Partial<FileUploadState>) => void;
  resetFileUpload: () => void;
}

const CONNECTION_HISTORY_KEY = 'repl-connection-history';
const MAX_COMMAND_HISTORY = 100;
const MAX_CONNECTION_HISTORY = 10;

const useReplStore = create<ReplState & ReplActions>((set) => ({
  connectionState: 'disconnected',
  transportType: 'uart',
  uartConfig: { path: '', baudRate: 115200 },
  telnetConfig: { host: '', port: 23, password: '' },
  commandHistory: [],
  connectionHistory: [],
  outputHistory: [],
  errorMessage: '',
  fileUpload: {
    filename: '',
    percent: 0,
    status: 'idle',
  },

  setTransportType: (type) => set({ transportType: type }),

  updateUartConfig: (config) =>
    set((state) => ({ uartConfig: { ...state.uartConfig, ...config } })),

  updateTelnetConfig: (config) =>
    set((state) => ({ telnetConfig: { ...state.telnetConfig, ...config } })),

  setConnectionState: (connectionState) => set({ connectionState }),

  setErrorMessage: (errorMessage) => set({ errorMessage }),

  addCommandHistory: (command) =>
    set((state) => {
      const filtered = state.commandHistory.filter((c) => c !== command);
      const updated = [...filtered, command].slice(-MAX_COMMAND_HISTORY);
      return { commandHistory: updated };
    }),

  addConnectionHistory: (entry) =>
    set((state) => {
      const filtered = state.connectionHistory.filter(
        (h) => !(h.transport === entry.transport && h.label === entry.label)
      );
      const updated = [entry, ...filtered].slice(0, MAX_CONNECTION_HISTORY);
      try {
        localStorage.setItem(CONNECTION_HISTORY_KEY, JSON.stringify(updated));
      } catch { /* ignore storage errors */ }
      return { connectionHistory: updated };
    }),

  removeConnectionHistory: (timestamp) =>
    set((state) => {
      const updated = state.connectionHistory.filter((h) => h.timestamp !== timestamp);
      try {
        localStorage.setItem(CONNECTION_HISTORY_KEY, JSON.stringify(updated));
      } catch { /* ignore storage errors */ }
      return { connectionHistory: updated };
    }),

  loadConnectionHistory: () => {
    try {
      const stored = localStorage.getItem(CONNECTION_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ConnectionHistoryEntry[];
        set({ connectionHistory: parsed });
      }
    } catch { /* ignore storage errors */ }
  },

  clearError: () => set({ errorMessage: '' }),

  addOutputHistory: (entry) =>
    set((state) => ({
      outputHistory: [...state.outputHistory, entry].slice(-500),
    })),

  clearOutputHistory: () => set({ outputHistory: [] }),

  setFileUpload: (state) =>
    set((prev) => ({
      fileUpload: { ...prev.fileUpload, ...state },
    })),

  resetFileUpload: () =>
    set({
      fileUpload: {
        filename: '',
        percent: 0,
        status: 'idle',
      },
    }),
}));

export default useReplStore;
export type { ConnectionHistoryEntry, FileUploadState, OutputHistoryEntry };

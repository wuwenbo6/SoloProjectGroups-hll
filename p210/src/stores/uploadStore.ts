import { create } from 'zustand';

export interface LogEntry {
  timestamp: number;
  type: 'send' | 'ack' | 'error' | 'info';
  message: string;
  blockNum?: number;
  blockSize?: number;
  moreBlocks?: boolean;
}

export interface UploadProgress {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  currentBlock: number;
  totalBlocks: number;
  bytesSent: number;
  totalBytes: number;
  blockSize: number;
  speed: number;
  logs: LogEntry[];
  createdAt: number;
  completedAt?: number;
  lastSuccessfulBlock: number;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'completed' | 'failed';
  totalBlocks: number;
  blockSize: number;
  createdAt: number;
  completedAt?: number;
  lastSuccessfulBlock: number;
}

export interface CompletedFileInfo {
  fileName: string;
  size: number;
  completedAt: number;
}

interface UploadState {
  currentUpload: UploadProgress | null;
  records: UploadRecord[];
  wsConnected: boolean;
  isUploading: boolean;
  pendingFile: File | null;
  observerCount: number;
  completedFiles: CompletedFileInfo[];
  coapNotifications: Array<{ type: string; uploadId: string; blockNum: number; timestamp: number }>;
  setPendingFile: (file: File | null) => void;

  setCurrentUpload: (upload: UploadProgress | null) => void;
  updateProgress: (data: Partial<UploadProgress>) => void;
  setRecords: (records: UploadRecord[]) => void;
  setWsConnected: (connected: boolean) => void;
  setIsUploading: (uploading: boolean) => void;
  clearAll: () => void;
  setObserverCount: (count: number) => void;
  setCompletedFiles: (files: CompletedFileInfo[]) => void;
  addCoapNotification: (n: { type: string; uploadId: string; blockNum: number; timestamp: number }) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  currentUpload: null,
  records: [],
  wsConnected: false,
  isUploading: false,
  pendingFile: null,
  observerCount: 0,
  completedFiles: [],
  coapNotifications: [],

  setPendingFile: (file) => set({ pendingFile: file }),

  setCurrentUpload: (upload) => set({ currentUpload: upload }),

  updateProgress: (data) =>
    set((state) => ({
      currentUpload: state.currentUpload
        ? { ...state.currentUpload, ...data }
        : null,
    })),

  setRecords: (records) => set({ records }),

  setWsConnected: (connected) => set({ wsConnected: connected }),

  setIsUploading: (uploading) => set({ isUploading: uploading }),

  clearAll: () => set({
    currentUpload: null,
    isUploading: false,
    pendingFile: null,
  }),

  setObserverCount: (count) => set({ observerCount: count }),

  setCompletedFiles: (files) => set({ completedFiles: files }),

  addCoapNotification: (n) => set((state) => ({
    coapNotifications: [...state.coapNotifications.slice(-49), n],
  })),
}));

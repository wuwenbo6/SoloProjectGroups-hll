import { create } from 'zustand'
import type { SectorData, ReaderInfo, LogEntry, KeyEntry } from '../types'

interface CardStore {
  sectors: SectorData[]
  readerInfo: ReaderInfo
  selectedSector: number | null
  selectedBlock: number | null
  logs: LogEntry[]
  authKey: string
  authKeyType: 'A' | 'B'
  writeData: string
  isConnecting: boolean
  isLoading: boolean
  keyEntries: KeyEntry[]
  showKeyManager: boolean

  setSectors: (sectors: SectorData[]) => void
  setReaderInfo: (info: ReaderInfo) => void
  setSelectedSector: (sector: number | null) => void
  setSelectedBlock: (block: number | null) => void
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
  setAuthKey: (key: string) => void
  setAuthKeyType: (keyType: 'A' | 'B') => void
  setWriteData: (data: string) => void
  setIsConnecting: (val: boolean) => void
  setIsLoading: (val: boolean) => void
  addKeyEntry: (entry: Omit<KeyEntry, 'id' | 'createdAt'>) => void
  removeKeyEntry: (id: string) => void
  updateKeyEntry: (id: string, entry: Partial<KeyEntry>) => void
  setKeyEntries: (entries: KeyEntry[]) => void
  setShowKeyManager: (show: boolean) => void
  importKeyEntries: (entries: KeyEntry[]) => void
}

function generateId(): string {
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function loadKeysFromStorage(): KeyEntry[] {
  try {
    const saved = localStorage.getItem('mifare-keys')
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveKeysToStorage(entries: KeyEntry[]): void {
  try {
    localStorage.setItem('mifare-keys', JSON.stringify(entries))
  } catch {
    // ignore
  }
}

export const useCardStore = create<CardStore>((set, get) => ({
  sectors: [],
  readerInfo: { id: '', name: '', isVirtual: true, connected: false },
  selectedSector: null,
  selectedBlock: null,
  logs: [],
  authKey: 'FF FF FF FF FF FF',
  authKeyType: 'A',
  writeData: '',
  isConnecting: false,
  isLoading: false,
  keyEntries: loadKeysFromStorage(),
  showKeyManager: false,

  setSectors: (sectors) => set({ sectors }),
  setReaderInfo: (readerInfo) => set({ readerInfo }),
  setSelectedSector: (selectedSector) => set({ selectedSector }),
  setSelectedBlock: (selectedBlock) => set({ selectedBlock }),
  addLog: (entry) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now()
        }
      ]
    })),
  clearLogs: () => set({ logs: [] }),
  setAuthKey: (authKey) => set({ authKey }),
  setAuthKeyType: (authKeyType) => set({ authKeyType }),
  setWriteData: (writeData) => set({ writeData }),
  setIsConnecting: (isConnecting) => set({ isConnecting }),
  setIsLoading: (isLoading) => set({ isLoading }),

  addKeyEntry: (entry) => {
    const newEntry: KeyEntry = {
      ...entry,
      id: generateId(),
      createdAt: Date.now()
    }
    set((state) => {
      const entries = [...state.keyEntries, newEntry]
      saveKeysToStorage(entries)
      return { keyEntries: entries }
    })
  },

  removeKeyEntry: (id) => {
    set((state) => {
      const entries = state.keyEntries.filter((e) => e.id !== id)
      saveKeysToStorage(entries)
      return { keyEntries: entries }
    })
  },

  updateKeyEntry: (id, entry) => {
    set((state) => {
      const entries = state.keyEntries.map((e) =>
        e.id === id ? { ...e, ...entry } : e
      )
      saveKeysToStorage(entries)
      return { keyEntries: entries }
    })
  },

  setKeyEntries: (entries) => {
    saveKeysToStorage(entries)
    set({ keyEntries: entries })
  },

  setShowKeyManager: (showKeyManager) => set({ showKeyManager }),

  importKeyEntries: (entries) => {
    set((state) => {
      const merged = [...state.keyEntries, ...entries]
      saveKeysToStorage(merged)
      return { keyEntries: merged }
    })
  }
}))

import { create } from 'zustand'

export interface SatelliteInfo {
  svId: number
  system: string
  signalType: string
  avgSnr: number
}

export interface SnrEntry {
  time: string
  snr: number
}

export interface SnrDataSet {
  svId: number
  system: string
  signalType: string
  snrData: SnrEntry[]
  stats: { avg: number; max: number; min: number; median: number }
}

export interface MwSummary {
  system: string
  svId: number
  signalType1: string
  signalType2: string
  meanMW: number
  stdMW: number
  cycleSlipCount: number
  halfCycleCount: number
  epochCount: number
}

export interface PositionResult {
  lat: number
  lon: number
  height: number
  sigmaLat: number
  sigmaLon: number
  sigmaHeight: number
  avgPdop: number
  avgSats: number
}

export interface PositionEpoch {
  epoch: string
  lat: number
  lon: number
  height: number
  numSats: number
  pdop: number
  hdop: number
  vdop: number
}

export interface FileStats {
  epochCount: number
  satelliteCount: number
  signalTypes: string[]
  timeRange: { start: string; end: string } | null
  satellites: SatelliteInfo[]
}

interface FileState {
  fileId: string | null
  fileName: string | null
  fileSize: number | null
  stats: FileStats | null
  snrData: SnrDataSet[]
  mwSummary: MwSummary[]
  position: PositionResult | null
  positionEpochs: PositionEpoch[]
  uploading: boolean
  uploadProgress: number
  error: string | null
  setFile: (data: {
    fileId: string
    fileName: string
    fileSize: number
    stats: FileStats
    snrData: SnrDataSet[]
    mwData: MwSummary[]
    position: PositionResult | null
  }) => void
  setPositionEpochs: (epochs: PositionEpoch[]) => void
  setUploading: (v: boolean) => void
  setUploadProgress: (v: number) => void
  setError: (v: string | null) => void
  reset: () => void
}

export const useFileStore = create<FileState>((set) => ({
  fileId: null,
  fileName: null,
  fileSize: null,
  stats: null,
  snrData: [],
  mwSummary: [],
  position: null,
  positionEpochs: [],
  uploading: false,
  uploadProgress: 0,
  error: null,
  setFile: (data) =>
    set({
      fileId: data.fileId,
      fileName: data.fileName,
      fileSize: data.fileSize,
      stats: data.stats,
      snrData: data.snrData,
      mwSummary: data.mwData,
      position: data.position,
      uploading: false,
      uploadProgress: 100,
      error: null,
    }),
  setPositionEpochs: (epochs) => set({ positionEpochs: epochs }),
  setUploading: (v) => set({ uploading: v, error: null }),
  setUploadProgress: (v) => set({ uploadProgress: v }),
  setError: (v) => set({ error: v, uploading: false }),
  reset: () =>
    set({
      fileId: null,
      fileName: null,
      fileSize: null,
      stats: null,
      snrData: [],
      mwSummary: [],
      position: null,
      positionEpochs: [],
      uploading: false,
      uploadProgress: 0,
      error: null,
    }),
}))

import { create } from 'zustand';
import type { ParseResult, ParseResultWithOptions, PacketSummary, PacketDetail, PacketType, TimeReferenceConfig, PcmDeinterleaveConfig } from '../../shared/types';

interface AppState {
  isLoading: boolean;
  isDragging: boolean;
  uploadProgress: number;
  parseResult: ParseResult | null;
  selectedPacket: PacketSummary | null;
  selectedDetail: PacketDetail | null;
  activeFilter: number | null;
  error: string | null;
  timeReference: TimeReferenceConfig;
  pcmDeinterleave: PcmDeinterleaveConfig;
  useIndexCache: boolean;
  showSettings: boolean;
  
  setIsLoading: (loading: boolean) => void;
  setIsDragging: (dragging: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setParseResult: (result: ParseResult | null) => void;
  setSelectedPacket: (packet: PacketSummary | null) => void;
  setSelectedDetail: (detail: PacketDetail | null) => void;
  setActiveFilter: (filter: number | null) => void;
  setError: (error: string | null) => void;
  setTimeReference: (config: Partial<TimeReferenceConfig>) => void;
  setPcmDeinterleave: (config: Partial<PcmDeinterleaveConfig>) => void;
  setUseIndexCache: (enabled: boolean) => void;
  setShowSettings: (show: boolean) => void;
  clearAll: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isLoading: false,
  isDragging: false,
  uploadProgress: 0,
  parseResult: null,
  selectedPacket: null,
  selectedDetail: null,
  activeFilter: null,
  error: null,
  timeReference: {
    enabled: false,
    autoDetectFromTmats: true
  },
  pcmDeinterleave: {
    enabled: false,
    channelCount: 4,
    frameSize: 32
  },
  useIndexCache: false,
  showSettings: false,

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setUploadProgress: (progress) => set({ uploadProgress: progress }),
  setParseResult: (result) => set({ parseResult: result }),
  setSelectedPacket: (packet) => set({ selectedPacket: packet }),
  setSelectedDetail: (detail) => set({ selectedDetail: detail }),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setError: (error) => set({ error }),
  setTimeReference: (config) => set((state) => ({
    timeReference: { ...state.timeReference, ...config }
  })),
  setPcmDeinterleave: (config) => set((state) => ({
    pcmDeinterleave: { ...state.pcmDeinterleave, ...config }
  })),
  setUseIndexCache: (enabled) => set({ useIndexCache: enabled }),
  setShowSettings: (show) => set({ showSettings: show }),
  clearAll: () => set({
    parseResult: null,
    selectedPacket: null,
    selectedDetail: null,
    activeFilter: null,
    error: null,
    uploadProgress: 0
  })
}));

export const useFilteredPackets = () => {
  const { parseResult, activeFilter } = useAppStore();
  
  if (!parseResult) return [];
  
  if (activeFilter === null) return parseResult.packets;
  
  return parseResult.packets.filter(p => p.type === activeFilter);
};

export const useStats = () => {
  const { parseResult } = useAppStore();
  
  if (!parseResult) return {
    total: 0,
    tmats: 0,
    pcm: 0,
    mil1553: 0,
    other: 0
  };
  
  return {
    total: parseResult.totalPackets,
    tmats: parseResult.stats[1] || 0,
    pcm: parseResult.stats[2] || 0,
    mil1553: parseResult.stats[7] || 0,
    other: Object.entries(parseResult.stats)
      .filter(([key]) => ![1, 2, 7].includes(parseInt(key)))
      .reduce((sum, [, count]) => sum + count, 0)
  };
};

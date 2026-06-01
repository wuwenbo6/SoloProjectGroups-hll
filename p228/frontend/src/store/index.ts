import { create } from 'zustand';
import type { SlotStatus } from '@/types';

interface AppState {
  selectedSlot: number | null;
  setSelectedSlot: (slot: number | null) => void;
  selectedSlotData: SlotStatus | null;
  setSelectedSlotData: (data: SlotStatus | null) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedSlot: null,
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  selectedSlotData: null,
  setSelectedSlotData: (data) => set({ selectedSlotData: data }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
}));

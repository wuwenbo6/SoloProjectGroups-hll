import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ChipInfo, JTAGChain, ParsingError } from '../types';
import { createJTAGChain } from '../generator/svfGenerator';

interface BSDLStore {
  chips: ChipInfo[];
  selectedChipId: string | null;
  jtagChain: JTAGChain | null;
  parsingErrors: ParsingError[];
  isLoading: boolean;
  
  addChip: (chip: ChipInfo) => void;
  removeChip: (chipId: string) => void;
  selectChip: (chipId: string | null) => void;
  clearAll: () => void;
  setParsingErrors: (errors: ParsingError[]) => void;
  setLoading: (loading: boolean) => void;
  addToChain: (chipId: string) => void;
  removeFromChain: (chipId: string) => void;
  reorderChain: (fromIndex: number, toIndex: number) => void;
  updateChain: (devices: ChipInfo[]) => void;
}

export const useBSDLStore = create<BSDLStore>()(
  persist(
    (set, get) => ({
      chips: [],
      selectedChipId: null,
      jtagChain: null,
      parsingErrors: [],
      isLoading: false,

      addChip: (chip) => {
        set((state) => {
          const exists = state.chips.some(c => c.name === chip.name && c.fileName === chip.fileName);
          if (exists) return state;
          return {
            chips: [...state.chips, chip],
            selectedChipId: state.selectedChipId || chip.id
          };
        });
      },

      removeChip: (chipId) => {
        set((state) => {
          const newChips = state.chips.filter(c => c.id !== chipId);
          const newSelectedId = state.selectedChipId === chipId 
            ? (newChips.length > 0 ? newChips[0].id : null)
            : state.selectedChipId;
          
          let newChain = state.jtagChain;
          if (state.jtagChain) {
            const newDevices = state.jtagChain.devices.filter(d => d.id !== chipId);
            newChain = newDevices.length > 0 ? createJTAGChain(newDevices) : null;
          }
          
          return {
            chips: newChips,
            selectedChipId: newSelectedId,
            jtagChain: newChain
          };
        });
      },

      selectChip: (chipId) => {
        set({ selectedChipId: chipId });
      },

      clearAll: () => {
        set({
          chips: [],
          selectedChipId: null,
          jtagChain: null,
          parsingErrors: []
        });
      },

      setParsingErrors: (errors) => {
        set({ parsingErrors: errors });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      addToChain: (chipId) => {
        set((state) => {
          const chip = state.chips.find(c => c.id === chipId);
          if (!chip) return state;
          
          const currentDevices = state.jtagChain?.devices || [];
          if (currentDevices.some(d => d.id === chipId)) return state;
          
          const newDevices = [...currentDevices, chip];
          return {
            jtagChain: createJTAGChain(newDevices)
          };
        });
      },

      removeFromChain: (chipId) => {
        set((state) => {
          if (!state.jtagChain) return state;
          
          const newDevices = state.jtagChain.devices.filter(d => d.id !== chipId);
          return {
            jtagChain: newDevices.length > 0 ? createJTAGChain(newDevices) : null
          };
        });
      },

      reorderChain: (fromIndex, toIndex) => {
        set((state) => {
          if (!state.jtagChain) return state;
          
          const newDevices = [...state.jtagChain.devices];
          const [removed] = newDevices.splice(fromIndex, 1);
          newDevices.splice(toIndex, 0, removed);
          
          return {
            jtagChain: createJTAGChain(newDevices)
          };
        });
      },

      updateChain: (devices) => {
        set({
          jtagChain: devices.length > 0 ? createJTAGChain(devices) : null
        });
      }
    }),
    {
      name: 'bsdl-storage',
      partialize: (state) => ({
        chips: state.chips,
        selectedChipId: state.selectedChipId,
        jtagChain: state.jtagChain
      })
    }
  )
);

export const useSelectedChip = (): ChipInfo | null => {
  const { chips, selectedChipId } = useBSDLStore();
  return chips.find(c => c.id === selectedChipId) || null;
};

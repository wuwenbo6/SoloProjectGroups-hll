import { create } from 'zustand';
import type { GSDMLDevice, DeviceConfig, TreeNode, ParsedGSDML } from '../types/gsdml';

interface AppState {
  parsedGSDML: ParsedGSDML | null;
  deviceConfig: DeviceConfig | null;
  moduleTree: TreeNode[];
  selectedNodeId: string | null;
  isLoading: boolean;
  error: string | null;
  warnings: string[];
  expandedNodes: Set<string>;

  setParsedGSDML: (parsed: ParsedGSDML | null) => void;
  setDeviceConfig: (config: DeviceConfig | null) => void;
  setModuleTree: (tree: TreeNode[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWarnings: (warnings: string[]) => void;
  toggleNodeExpanded: (nodeId: string) => void;
  updateConfig: (updates: Partial<DeviceConfig>) => void;
  resetState: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  parsedGSDML: null,
  deviceConfig: null,
  moduleTree: [],
  selectedNodeId: null,
  isLoading: false,
  error: null,
  warnings: [],
  expandedNodes: new Set<string>(),

  setParsedGSDML: (parsed) => set({ parsedGSDML: parsed }),
  setDeviceConfig: (config) => set({ deviceConfig: config }),
  setModuleTree: (tree) => set({ moduleTree: tree }),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setWarnings: (warnings) => set({ warnings }),

  toggleNodeExpanded: (nodeId) => {
    const { expandedNodes } = get();
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    set({ expandedNodes: newExpanded });
  },

  updateConfig: (updates) => {
    const { deviceConfig } = get();
    if (deviceConfig) {
      set({
        deviceConfig: {
          ...deviceConfig,
          ...updates,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  },

  resetState: () =>
    set({
      parsedGSDML: null,
      deviceConfig: null,
      moduleTree: [],
      selectedNodeId: null,
      isLoading: false,
      error: null,
      warnings: [],
      expandedNodes: new Set(),
    }),
}));

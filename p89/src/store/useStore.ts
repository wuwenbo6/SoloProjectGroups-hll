import { create } from 'zustand';
import type { VirtualMachine, ClusterNode, OperationLog } from '../../shared/types';

interface AppState {
  vms: VirtualMachine[];
  nodes: ClusterNode[];
  logs: OperationLog[];
  loading: boolean;
  sidebarCollapsed: boolean;
  currentPage: string;

  setVMs: (vms: VirtualMachine[]) => void;
  setNodes: (nodes: ClusterNode[]) => void;
  setLogs: (logs: OperationLog[]) => void;
  setLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
  setCurrentPage: (page: string) => void;
}

export const useStore = create<AppState>((set) => ({
  vms: [],
  nodes: [],
  logs: [],
  loading: false,
  sidebarCollapsed: false,
  currentPage: 'dashboard',

  setVMs: (vms) => set({ vms }),
  setNodes: (nodes) => set({ nodes }),
  setLogs: (logs) => set({ logs }),
  setLoading: (loading) => set({ loading }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCurrentPage: (page) => set({ currentPage: page }),
}));

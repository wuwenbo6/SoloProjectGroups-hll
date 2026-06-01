import { create } from "zustand"
import type { TopologyData } from "@/types"

interface TopologyStore {
  topology: TopologyData
  selectedDeviceId: string | null
  sidebarOpen: boolean
  setTopology: (data: TopologyData) => void
  selectDevice: (id: string | null) => void
  toggleSidebar: () => void
}

export const useTopologyStore = create<TopologyStore>((set) => ({
  topology: { devices: [], links: [] },
  selectedDeviceId: null,
  sidebarOpen: true,
  setTopology: (data) => set({ topology: data }),
  selectDevice: (id) => set({ selectedDeviceId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))

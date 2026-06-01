import { create } from "zustand";
import type { Subnet, MDnsService, ReflectorStatus, WSEvent, ServiceRecords } from "@/utils/types";

interface AppState {
  subnets: Subnet[];
  services: MDnsService[];
  reflectorStatus: ReflectorStatus | null;
  serviceRecords: Record<string, ServiceRecords>;
  discoveryLog: WSEvent[];
  wsConnected: boolean;

  setSubnets: (subnets: Subnet[]) => void;
  setServices: (services: MDnsService[]) => void;
  setReflectorStatus: (status: ReflectorStatus) => void;
  setServiceRecords: (serviceId: string, records: ServiceRecords) => void;
  addDiscoveryEvent: (event: WSEvent) => void;
  setWsConnected: (connected: boolean) => void;
  applyWSEvent: (event: WSEvent) => void;
}

const MAX_LOG_SIZE = 50;

export const useStore = create<AppState>((set) => ({
  subnets: [],
  services: [],
  reflectorStatus: null,
  serviceRecords: {},
  discoveryLog: [],
  wsConnected: false,

  setSubnets: (subnets) => set({ subnets }),
  setServices: (services) => set({ services }),
  setReflectorStatus: (status) => set({ reflectorStatus: status }),
  setServiceRecords: (serviceId, records) =>
    set((state) => ({ serviceRecords: { ...state.serviceRecords, [serviceId]: records } })),
  addDiscoveryEvent: (event) =>
    set((state) => ({
      discoveryLog: [event, ...state.discoveryLog].slice(0, MAX_LOG_SIZE),
    })),
  setWsConnected: (connected) => set({ wsConnected: connected }),

  applyWSEvent: (event) =>
    set((state) => {
      if (event.type === "service_discovered" && event.service) {
        const exists = state.services.find((s) => s.id === event.service!.id);
        if (exists) return { discoveryLog: [event, ...state.discoveryLog].slice(0, MAX_LOG_SIZE) };
        const newSubnets = state.subnets.map((s) =>
          s.id === event.subnetId ? { ...s, serviceCount: s.serviceCount + 1 } : s
        );
        return {
          services: [...state.services, event.service],
          subnets: newSubnets,
          discoveryLog: [event, ...state.discoveryLog].slice(0, MAX_LOG_SIZE),
        };
      }
      if (event.type === "service_lost" && event.serviceId) {
        const newServices = state.services.map((s) =>
          s.id === event.serviceId ? { ...s, status: "offline" as const } : s
        );
        const svc = state.services.find((s) => s.id === event.serviceId);
        const newSubnets = svc
          ? state.subnets.map((s) =>
              s.id === svc.subnetId ? { ...s, serviceCount: Math.max(0, s.serviceCount - 1) } : s
            )
          : state.subnets;
        return {
          services: newServices,
          subnets: newSubnets,
          discoveryLog: [event, ...state.discoveryLog].slice(0, MAX_LOG_SIZE),
        };
      }
      if (event.type === "ttl_expired" && event.serviceId) {
        const newServices = state.services.map((s) =>
          s.id === event.serviceId ? { ...s, status: "offline" as const, ttlRemaining: 0 } : s
        );
        return {
          services: newServices,
          discoveryLog: [event, ...state.discoveryLog].slice(0, MAX_LOG_SIZE),
        };
      }
      if (event.type === "reflector_stats" && state.reflectorStatus) {
        return {
          reflectorStatus: {
            ...state.reflectorStatus,
            uptime: event.uptime ?? state.reflectorStatus.uptime,
            packetsForwarded: event.packetsForwarded ?? state.reflectorStatus.packetsForwarded,
          },
        };
      }
      return state;
    }),
}));

import { create } from "zustand";
import {
  OspfState,
  OspfEvent,
  OspfPacketType,
  RouterInfo,
  LinkInfo,
  RouterDetail,
  LogEntry,
  PacketDetails,
  StateChange,
  stateColor,
  packetColor,
} from "@/types";

interface SimulatorState {
  connected: boolean;
  routers: RouterInfo[];
  links: LinkInfo[];
  selectedRouter: string | null;
  selectedTarget: string | null;
  routerDetail: RouterDetail | null;
  logs: LogEntry[];
  neighborStates: Record<string, Record<string, OspfState>>;
  packetAnimations: PacketAnimation[];
  autoRunning: boolean;

  setConnected: (v: boolean) => void;
  setRouters: (r: RouterInfo[]) => void;
  setLinks: (l: LinkInfo[]) => void;
  selectRouter: (id: string | null) => void;
  selectTarget: (id: string | null) => void;
  setRouterDetail: (d: RouterDetail | null) => void;
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  updateNeighborState: (routerId: string, neighborId: string, state: OspfState) => void;
  addPacketAnimation: (a: PacketAnimation) => void;
  removePacketAnimation: (id: string) => void;
  setAutoRunning: (v: boolean) => void;

  sendMessage: (msg: Record<string, unknown>) => void;
  triggerEvent: (event: OspfEvent) => void;
  resetAll: () => void;
  autoDemo: () => void;
  initWebSocket: () => void;
}

export interface PacketAnimation {
  id: string;
  from: string;
  to: string;
  packetType: OspfPacketType;
  color: string;
  createdAt: number;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getNeighborKey(routerId: string, neighborId: string): string {
  return `${routerId}-${neighborId}`;
}

export const useSimulatorStore = create<SimulatorState>((set, get) => ({
  connected: false,
  routers: [],
  links: [],
  selectedRouter: null,
  selectedTarget: null,
  routerDetail: null,
  logs: [],
  neighborStates: {},
  packetAnimations: [],
  autoRunning: false,

  setConnected: (v) => set({ connected: v }),
  setRouters: (r) => set({ routers: r }),
  setLinks: (l) => set({ links: l }),
  selectRouter: (id) => set({ selectedRouter: id }),
  selectTarget: (id) => set({ selectedTarget: id }),
  setRouterDetail: (d) => set({ routerDetail: d }),
  addLog: (entry) => set((s) => ({ logs: [...s.logs.slice(-499), entry] })),
  clearLogs: () => set({ logs: [] }),
  updateNeighborState: (routerId, neighborId, state) =>
    set((s) => ({
      neighborStates: {
        ...s.neighborStates,
        [routerId]: {
          ...s.neighborStates[routerId],
          [neighborId]: state,
        },
      },
    })),
  addPacketAnimation: (a) =>
    set((s) => ({ packetAnimations: [...s.packetAnimations, a] })),
  removePacketAnimation: (id) =>
    set((s) => ({
      packetAnimations: s.packetAnimations.filter((a) => a.id !== id),
    })),
  setAutoRunning: (v) => set({ autoRunning: v }),

  sendMessage: (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  },

  triggerEvent: (event) => {
    const { selectedRouter, selectedTarget, sendMessage } = get();
    if (!selectedRouter) return;
    sendMessage({
      type: "trigger_event",
      event,
      routerId: selectedRouter,
      targetId: selectedTarget || "",
    });
  },

  resetAll: () => {
    get().sendMessage({ type: "reset_all" });
  },

  autoDemo: () => {
    const { selectedRouter, selectedTarget, sendMessage } = get();
    if (!selectedRouter || !selectedTarget) return;
    set({ autoRunning: true });
    sendMessage({
      type: "auto_demo",
      routerId: selectedRouter,
      targetId: selectedTarget,
    });
  },

  initWebSocket: () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.port === "5173"
      ? `${window.location.hostname}:8080`
      : window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      set({ connected: true });
      get().addLog({
        id: crypto.randomUUID(),
        message: "Connected to OSPFv3 simulator backend",
        level: "info",
        timestamp: Date.now(),
      });
    };

    ws.onclose = () => {
      set({ connected: false });
      get().addLog({
        id: crypto.randomUUID(),
        message: "Disconnected from backend, reconnecting...",
        level: "warn",
        timestamp: Date.now(),
      });
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => get().initWebSocket(), 3000);
    };

    ws.onerror = () => {
      ws?.close();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data, get, set);
      } catch {
        // ignore parse errors
      }
    };
  },
}));

function handleServerMessage(
  data: Record<string, unknown>,
  get: () => SimulatorState,
  set: (fn: (s: SimulatorState) => Partial<SimulatorState>) => void
) {
  const msgType = data.type as string;
  const payload = data.payload as Record<string, unknown> | undefined;

  switch (msgType) {
    case "topology_update": {
      const routers = (payload?.routers || data.routers) as RouterInfo[];
      const links = (payload?.links || data.links) as LinkInfo[];
      if (routers) set(() => ({ routers }));
      if (links) set(() => ({ links }));
      break;
    }

    case "state_change": {
      const p = payload!;
      const routerId = p.routerId as string;
      const neighborId = p.neighborId as string;
      const oldState = p.oldState as OspfState;
      const newState = p.newState as OspfState;

      get().updateNeighborState(routerId, neighborId, newState);

      if (routerId === get().selectedRouter) {
        get().sendMessage({ type: "select_router", routerId });
      }

      const stateC = stateColor(newState);
      get().addLog({
        id: crypto.randomUUID(),
        message: `[${routerId.toUpperCase()}] Neighbor ${neighborId}: ${oldState} → ${newState}`,
        level: "info",
        timestamp: Date.now(),
        type: "state_change",
      });

      void stateC;
      break;
    }

    case "packet_sent": {
      const p = payload as unknown as PacketDetails;
      const color = packetColor(p.messageType);
      const animId = crypto.randomUUID();
      get().addPacketAnimation({
        id: animId,
        from: p.sourceRouter,
        to: p.destRouter,
        packetType: p.messageType,
        color,
        createdAt: Date.now(),
      });
      setTimeout(() => get().removePacketAnimation(animId), 1500);

      const fieldsStr = Object.entries(p.fields)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      get().addLog({
        id: crypto.randomUUID(),
        message: `→ ${p.messageType} ${p.sourceRouter} → ${p.destRouter} | ${fieldsStr}`,
        level: "info",
        timestamp: Date.now(),
        type: "packet_sent",
        details: p,
      });
      break;
    }

    case "packet_received": {
      const p = payload as unknown as PacketDetails;
      const fieldsStr = Object.entries(p.fields)
        .slice(0, 3)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      get().addLog({
        id: crypto.randomUUID(),
        message: `← ${p.messageType} ${p.sourceRouter} → ${p.destRouter} | ${fieldsStr}`,
        level: "info",
        timestamp: Date.now(),
        type: "packet_received",
        details: p,
      });
      break;
    }

    case "router_detail": {
      const router = (payload?.router || data.router) as RouterDetail;
      if (router) set(() => ({ routerDetail: router }));
      break;
    }

    case "log": {
      const message = (payload?.message || data.message) as string;
      const level = (payload?.level || data.level || "info") as "info" | "warn" | "error";
      const timestamp = (payload?.timestamp || data.timestamp || Date.now()) as number;
      const type = (payload?.type || data.type) as string;
      if (message) {
        get().addLog({
          id: crypto.randomUUID(),
          message,
          level,
          timestamp: timestamp || Date.now(),
          type,
        });
      }
      if (message && message.includes("Auto demo completed")) {
        set(() => ({ autoRunning: false }));
      }
      break;
    }

    case "lsa_flooded": {
      const p = payload!;
      const fromRouter = p.fromRouter as string;
      const toRouter = p.toRouter as string;
      const lsaType = p.lsaType as string;
      const lsa = p.lsa as Record<string, unknown>;

      get().addLog({
        id: crypto.randomUUID(),
        message: `🌊 LSA Flood: ${fromRouter.toUpperCase()} → ${toRouter.toUpperCase()} | ${lsaType} | LSID: ${lsa.lsId} | Seq: 0x${(lsa.sequence as number).toString(16).toUpperCase().padStart(8, "0")}`,
        level: "info",
        timestamp: Date.now(),
        type: "lsa_flood",
      });

      if (toRouter === get().selectedRouter) {
        get().sendMessage({ type: "select_router", routerId: toRouter });
      }
      break;
    }

    case "prefix_installed": {
      const p = payload!;
      const toRouter = p.toRouter as string;
      const prefix = p.prefix as string;
      const prefixLen = p.prefixLen as number;
      const advRouter = p.advRouter as string;
      const routeType = p.routeType as string;

      get().addLog({
        id: crypto.randomUUID(),
        message: `📡 Prefix Install: ${toRouter.toUpperCase()} | ${prefix}/${prefixLen} | Adv: ${advRouter} | Type: ${routeType}`,
        level: "info",
        timestamp: Date.now(),
        type: "prefix_install",
      });

      if (toRouter === get().selectedRouter) {
        get().sendMessage({ type: "select_router", routerId: toRouter });
      }
      break;
    }

    case "routing_table_update": {
      const p = payload!;
      const routerId = p.routerId as string;

      if (routerId === get().selectedRouter) {
        get().sendMessage({ type: "select_router", routerId });
      }
      break;
    }
  }
}

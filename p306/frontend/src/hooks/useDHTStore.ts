import { create } from 'zustand';
import {
  api,
  NodeStatus,
  PingResult,
  FindNodeResult,
  GetPeersResult,
  AnnouncePeerResult,
  BucketInfo,
  QueryLogEntry,
  SimulatedNodeInfo,
  ResourcesData,
  ExportedRoutingTable,
} from '@/utils/api';

interface DHTState {
  nodeStatus: NodeStatus | null;
  routingTable: BucketInfo[];
  logs: QueryLogEntry[];
  simulatedNodes: SimulatedNodeInfo[];
  resources: ResourcesData | null;
  exportedRoutingTable: ExportedRoutingTable | null;
  loading: boolean;
  pingResult: PingResult | null;
  findNodeResult: FindNodeResult | null;
  getPeersResult: GetPeersResult | null;
  announcePeerResult: AnnouncePeerResult | null;
  lastToken: string;
  lastInfoHash: string;

  fetchNodeStatus: () => Promise<void>;
  fetchRoutingTable: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  fetchSimulatedNodes: () => Promise<void>;
  fetchResources: () => Promise<void>;
  startNode: () => Promise<void>;
  stopNode: () => Promise<void>;
  sendPing: (targetAddr: string) => Promise<void>;
  sendFindNode: (targetId: string, askAddr: string) => Promise<void>;
  sendGetPeers: (infoHash: string, askAddr: string) => Promise<void>;
  sendAnnouncePeer: (infoHash: string, askAddr: string, port: number, token: string) => Promise<void>;
  bootstrap: (count: number) => Promise<void>;
  exportRoutingTable: () => Promise<ExportedRoutingTable | null>;
  exportRoutingTableAsText: () => Promise<void>;
}

export const useDHTStore = create<DHTState>((set) => ({
  nodeStatus: null,
  routingTable: [],
  logs: [],
  simulatedNodes: [],
  resources: null,
  exportedRoutingTable: null,
  loading: false,
  pingResult: null,
  findNodeResult: null,
  getPeersResult: null,
  announcePeerResult: null,
  lastToken: '',
  lastInfoHash: '',

  fetchNodeStatus: async () => {
    try {
      const status = await api.getNodeStatus();
      set({ nodeStatus: status });
    } catch {
      set({ nodeStatus: null });
    }
  },

  fetchRoutingTable: async () => {
    try {
      const data = await api.getRoutingTable();
      set({ routingTable: data.buckets || [] });
    } catch {
      set({ routingTable: [] });
    }
  },

  fetchLogs: async () => {
    try {
      const data = await api.getLogs();
      set({ logs: data.logs || [] });
    } catch {
      set({ logs: [] });
    }
  },

  fetchSimulatedNodes: async () => {
    try {
      const data = await api.getSimulatedNodes();
      set({ simulatedNodes: data.nodes || [] });
    } catch {
      set({ simulatedNodes: [] });
    }
  },

  fetchResources: async () => {
    try {
      const data = await api.getResources();
      set({ resources: data });
    } catch {
      set({ resources: null });
    }
  },

  startNode: async () => {
    set({ loading: true });
    try {
      await api.startNode();
      const status = await api.getNodeStatus();
      set({ nodeStatus: status, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  stopNode: async () => {
    set({ loading: true });
    try {
      await api.stopNode();
      const status = await api.getNodeStatus();
      set({ nodeStatus: status, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendPing: async (targetAddr: string) => {
    set({ loading: true, pingResult: null });
    try {
      const result = await api.ping(targetAddr);
      set({ pingResult: result, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendFindNode: async (targetId: string, askAddr: string) => {
    set({ loading: true, findNodeResult: null });
    try {
      const result = await api.findNode(targetId, askAddr);
      set({ findNodeResult: result, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendGetPeers: async (infoHash: string, askAddr: string) => {
    set({ loading: true, getPeersResult: null });
    try {
      const result = await api.getPeers(infoHash, askAddr);
      set({ getPeersResult: result, lastToken: result.token, lastInfoHash: infoHash, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  sendAnnouncePeer: async (infoHash: string, askAddr: string, port: number, token: string) => {
    set({ loading: true, announcePeerResult: null });
    try {
      const result = await api.announcePeer(infoHash, askAddr, port, token);
      set({ announcePeerResult: result, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  bootstrap: async (count: number) => {
    set({ loading: true });
    try {
      await api.bootstrap(count);
      const [status, nodes, routingTable] = await Promise.all([
        api.getNodeStatus(),
        api.getSimulatedNodes(),
        api.getRoutingTable(),
      ]);
      set({
        nodeStatus: status,
        simulatedNodes: nodes.nodes || [],
        routingTable: routingTable.buckets || [],
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  exportRoutingTable: async () => {
    try {
      const result = await api.exportRoutingTable('json');
      const data = await result.json();
      set({ exportedRoutingTable: data });
      return data;
    } catch {
      set({ exportedRoutingTable: null });
      return null;
    }
  },

  exportRoutingTableAsText: async () => {
    try {
      const result = await api.exportRoutingTable('text');
      const text = await result.text();
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `routing-table-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  },
}));

import axios from 'axios';
import { TopologyNode, TopologyLink, FlowRule, PacketTrace, SimulationStatus, Topology } from '@/types';

const API_BASE = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const topologyApi = {
  getAll: () => api.get<{ id: number; name: string; created_at: string }[]>('/topologies'),
  get: (id: number) => api.get<Topology>(`/topologies/${id}`),
  create: (name: string, nodes: TopologyNode[], links: TopologyLink[]) =>
    api.post<Topology>('/topologies', { name, nodes, links }),
  update: (id: number, nodes: TopologyNode[], links: TopologyLink[]) =>
    api.put<Topology>(`/topologies/${id}`, { nodes, links }),
  delete: (id: number) => api.delete(`/topologies/${id}`),
};

export const simulationApi = {
  start: (topology?: { nodes: TopologyNode[]; links: TopologyLink[] }, topologyId?: number) =>
    api.post<{ status: string; message: string }>('/simulation/start', { topology, topologyId }),
  stop: () => api.post<{ status: string }>('/simulation/stop'),
  status: () => api.get<SimulationStatus>('/simulation/status'),
  stats: () => api.get<any>('/simulation/stats'),
  commitPending: () => api.post<{ committed: number; rules: any[] }>('/simulation/commit-pending'),
  getPendingRules: (switchId?: string) => 
    api.get<any>(`/simulation/pending-rules${switchId ? `?switch_id=${switchId}` : ''}`),
};

export const flowRuleApi = {
  add: (rule: FlowRule) => api.post<FlowRule>('/flowrules', rule),
  getBySwitch: (switchId: string) => api.get<FlowRule[]>(`/flowrules/${switchId}`),
  delete: (ruleId: string) => api.delete(`/flowrules/${ruleId}`),
};

export const packetApi = {
  send: (src: string, dst: string, type: string = 'ICMP') =>
    api.post<{ packetId: string }>('/packet/send', { src, dst, type }),
  getPath: (packetId: string) => api.get<PacketTrace>(`/packet/${packetId}/path`),
};

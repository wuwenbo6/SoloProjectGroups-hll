import { create } from 'zustand';
import { Node, Edge } from 'reactflow';
import { TopologyNode, TopologyLink, FlowRule, PacketTrace, SimulationStatus } from '@/types';

interface NodeData {
  label: string;
  nodeType: 'switch' | 'host';
  ip?: string;
}

interface AppState {
  nodes: Node<NodeData>[];
  edges: Edge[];
  flowRules: FlowRule[];
  selectedNode: string | null;
  simulationRunning: boolean;
  simulationStatus: SimulationStatus | null;
  packetTraces: PacketTrace[];
  activePath: string[];
  topologyName: string;

  setNodes: (nodes: Node<NodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node<NodeData>) => void;
  addEdge: (edge: Edge) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  
  setSelectedNode: (id: string | null) => void;
  
  addFlowRule: (rule: FlowRule) => void;
  removeFlowRule: (id: string) => void;
  setFlowRules: (rules: FlowRule[]) => void;
  
  setSimulationRunning: (running: boolean) => void;
  setSimulationStatus: (status: SimulationStatus) => void;
  
  addPacketTrace: (trace: PacketTrace) => void;
  setActivePath: (path: string[]) => void;
  clearActivePath: () => void;
  
  setTopologyName: (name: string) => void;
  loadTopology: (nodes: TopologyNode[], links: TopologyLink[]) => void;
  resetTopology: () => void;
}

export const useStore = create<AppState>((set) => ({
  nodes: [],
  edges: [],
  flowRules: [],
  selectedNode: null,
  simulationRunning: false,
  simulationStatus: null,
  packetTraces: [],
  activePath: [],
  topologyName: 'Untitled Topology',

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  addEdge: (edge) => set((state) => ({ edges: [...state.edges, edge] })),
  removeNode: (id) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== id),
    edges: state.edges.filter((e) => e.source !== id && e.target !== id),
  })),
  removeEdge: (id) => set((state) => ({
    edges: state.edges.filter((e) => e.id !== id),
  })),
  updateNodePosition: (id, x, y) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === id ? { ...n, position: { x, y } } : n
    ),
  })),

  setSelectedNode: (id) => set({ selectedNode: id }),

  addFlowRule: (rule) => set((state) => ({
    flowRules: [...state.flowRules, rule],
  })),
  removeFlowRule: (id) => set((state) => ({
    flowRules: state.flowRules.filter((r) => r.id !== id),
  })),
  setFlowRules: (rules) => set({ flowRules: rules }),

  setSimulationRunning: (running) => set({ simulationRunning: running }),
  setSimulationStatus: (status) => set({ simulationStatus: status }),

  addPacketTrace: (trace) => set((state) => ({
    packetTraces: [...state.packetTraces, trace],
  })),
  setActivePath: (path) => set({ activePath: path }),
  clearActivePath: () => set({ activePath: [] }),

  setTopologyName: (name) => set({ topologyName: name }),
  loadTopology: (topologyNodes, topologyLinks) => {
    const nodes: Node<NodeData>[] = topologyNodes.map((n) => ({
      id: n.id,
      type: n.type === 'switch' ? 'switchNode' : 'hostNode',
      position: { x: n.x, y: n.y },
      data: {
        label: n.name,
        nodeType: n.type,
        ip: n.ip,
      },
    }));
    const edges: Edge[] = topologyLinks.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      animated: false,
      style: { stroke: '#64748b', strokeWidth: 2 },
    }));
    set({ nodes, edges });
  },
  resetTopology: () => set({
    nodes: [],
    edges: [],
    flowRules: [],
    selectedNode: null,
    packetTraces: [],
    activePath: [],
    topologyName: 'Untitled Topology',
  }),
}));

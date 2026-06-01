import React, { useCallback, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  Connection,
  Edge,
  Node,
  useReactFlow,
  BackgroundProps,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useStore } from '@/store/useStore';
import SwitchNode from './SwitchNode';
import HostNode from './HostNode';

const nodeTypes = {
  switchNode: SwitchNode,
  hostNode: HostNode,
};

interface NodeData {
  label: string;
  nodeType: 'switch' | 'host';
  ip?: string;
}

let switchCounter = 1;
let hostCounter = 1;

const TopologyEditorContent: React.FC = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes,
    setEdges,
    setSelectedNode,
    selectedNode,
    activePath,
    removeNode,
    removeEdge,
  } = useStore();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const isSwitch = type === 'switchNode';
      const label = isSwitch ? `S${switchCounter++}` : `h${hostCounter++}`;

      const newNode: Node<NodeData> = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: {
          label,
          nodeType: isSwitch ? 'switch' : 'host',
          ip: !isSwitch ? `10.0.0.${hostCounter - 1}` : undefined,
        },
      };

      setNodes([...storeNodes, newNode]);
    },
    [screenToFlowPosition, storeNodes, setNodes]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, storeNodes);
      setNodes(updatedNodes);
    },
    [storeNodes, setNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updatedEdges = applyEdgeChanges(changes, storeEdges);
      setEdges(updatedEdges);
    },
    [storeEdges, setEdges]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `edge_${Date.now()}`,
        animated: false,
        style: { stroke: '#64748b', strokeWidth: 2 },
      };
      setEdges(addEdge(newEdge, storeEdges));
    },
    [storeEdges, setEdges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<NodeData>) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Delete' && selectedNode) {
        removeNode(selectedNode);
        setSelectedNode(null);
      }
    },
    [selectedNode, removeNode, setSelectedNode]
  );

  const edgesWithHighlight = storeEdges.map((edge) => {
    const sourceInPath = activePath.includes(edge.source);
    const targetInPath = activePath.includes(edge.target);
    const isOnPath = sourceInPath && targetInPath;

    return {
      ...edge,
      animated: isOnPath,
      style: isOnPath
        ? { stroke: '#3b82f6', strokeWidth: 3 }
        : edge.style,
    };
  });

  const nodesWithHighlight = storeNodes.map((node) => ({
    ...node,
    selected: node.id === selectedNode || activePath.includes(node.id),
  }));

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 bg-slate-950"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodesWithHighlight}
        edges={edgesWithHighlight}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          type: 'smoothstep',
        }}
      >
        <Background
          variant={BackgroundVariant.Dots as BackgroundProps['variant']}
          gap={20}
          size={1}
          color="#334155"
        />
        <Controls
          className="bg-slate-800 border-slate-700"
          position="bottom-right"
        />
        <MiniMap
          className="bg-slate-800 border-slate-700"
          nodeColor={(node) => {
            const data = node.data as NodeData;
            return data.nodeType === 'switch' ? '#6366f1' : '#10b981';
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>
    </div>
  );
};

const TopologyEditor: React.FC = () => {
  return (
    <ReactFlowProvider>
      <TopologyEditorContent />
    </ReactFlowProvider>
  );
};

export default TopologyEditor;

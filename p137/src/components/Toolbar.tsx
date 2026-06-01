import React, { useState } from 'react';
import {
  Play,
  Pause,
  Save,
  FolderOpen,
  Trash2,
  Send,
  Zap,
  Download,
  Activity,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { topologyApi, simulationApi, packetApi } from '@/services/api';
import { TopologyNode, TopologyLink } from '@/types';

const Toolbar: React.FC<{ onTogglePerformance?: () => void }> = ({ onTogglePerformance }) => {
  const {
    nodes,
    edges,
    topologyName,
    simulationRunning,
    setSimulationRunning,
    setTopologyName,
    resetTopology,
    addPacketTrace,
    setActivePath,
  } = useStore();

  const [savedTopologies, setSavedTopologies] = useState<
    { id: number; name: string; created_at: string }[]
  >([]);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showPacketDialog, setShowPacketDialog] = useState(false);
  const [packetSrc, setPacketSrc] = useState('');
  const [packetDst, setPacketDst] = useState('');
  const [packetType, setPacketType] = useState('ICMP');

  const hostNodes = nodes.filter((n) => n.data.nodeType === 'host');

  const handleSave = async () => {
    const topologyNodes: TopologyNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.label,
      x: n.position?.x || 0,
      y: n.position?.y || 0,
      ip: n.data.ip,
    }));

    const topologyLinks: TopologyLink[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    try {
      await topologyApi.create(topologyName, topologyNodes, topologyLinks);
      alert('拓扑已保存！');
    } catch (error) {
      console.error('Failed to save topology:', error);
    }
  };

  const handleLoad = async () => {
    try {
      const response = await topologyApi.getAll();
      setSavedTopologies(response.data);
      setShowLoadDialog(true);
    } catch (error) {
      console.error('Failed to load topologies:', error);
    }
  };

  const handleLoadTopology = async (id: number) => {
    try {
      const response = await topologyApi.get(id);
      const { nodes: topoNodes, links: topoLinks } = response.data;
      
      const mappedNodes = topoNodes.map((n: any) => ({
        ...n,
        type: n.type === 'switch' ? 'switchNode' : 'hostNode',
        position: { x: n.x, y: n.y },
        data: {
          label: n.name,
          nodeType: n.type,
          ip: n.ip,
        },
      }));
      
      const mappedEdges = topoLinks.map((l: any) => ({
        ...l,
        animated: false,
        style: { stroke: '#64748b', strokeWidth: 2 },
      }));

      useStore.getState().setNodes(mappedNodes);
      useStore.getState().setEdges(mappedEdges);
      setTopologyName(response.data.name);
      setShowLoadDialog(false);
    } catch (error) {
      console.error('Failed to load topology:', error);
    }
  };

  const handleStartSimulation = async () => {
    const topologyNodes: TopologyNode[] = nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType,
      name: n.data.label,
      x: n.position?.x || 0,
      y: n.position?.y || 0,
      ip: n.data.ip,
    }));

    const topologyLinks: TopologyLink[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    try {
      await simulationApi.start({ nodes: topologyNodes, links: topologyLinks });
      setSimulationRunning(true);
    } catch (error) {
      console.error('Failed to start simulation:', error);
    }
  };

  const handleStopSimulation = async () => {
    try {
      await simulationApi.stop();
      setSimulationRunning(false);
      setActivePath([]);
    } catch (error) {
      console.error('Failed to stop simulation:', error);
    }
  };

  const handleSendPacket = async () => {
    if (!packetSrc || !packetDst) return;

    try {
      const response = await packetApi.send(packetSrc, packetDst, packetType);
      const pathResponse = await packetApi.getPath(response.data.packetId);
      addPacketTrace(pathResponse.data);
      setActivePath(pathResponse.data.path);
      setShowPacketDialog(false);
    } catch (error) {
      console.error('Failed to send packet:', error);
    }
  };

  return (
    <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-4">
      <div className="flex items-center gap-2">
        <Zap className="w-6 h-6 text-blue-400" />
        <h1 className="text-white font-bold text-lg">Mininet 仿真平台</h1>
      </div>

      <div className="h-6 w-px bg-slate-600" />

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={topologyName}
          onChange={(e) => setTopologyName(e.target.value)}
          className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500 w-48"
          placeholder="拓扑名称"
        />
      </div>

      <div className="h-6 w-px bg-slate-600" />

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          保存
        </button>
        <button
          onClick={handleLoad}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          加载
        </button>
        <button
          onClick={resetTopology}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-red-500/20 text-slate-300 hover:text-red-400 text-sm rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          清空
        </button>
      </div>

      <div className="h-6 w-px bg-slate-600" />

      <div className="flex items-center gap-2">
        {!simulationRunning ? (
          <button
            onClick={handleStartSimulation}
            disabled={nodes.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
          >
            <Play className="w-4 h-4" />
            启动仿真
          </button>
        ) : (
          <button
            onClick={handleStopSimulation}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
          >
            <Pause className="w-4 h-4" />
            停止仿真
          </button>
        )}
      </div>

      <div className="flex-1" />

      <button
        onClick={() => {
          if (hostNodes.length >= 2) {
            setPacketSrc(hostNodes[0].id);
            setPacketDst(hostNodes[1].id);
          }
          setShowPacketDialog(true);
        }}
        disabled={!simulationRunning || hostNodes.length < 2}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
      >
        <Send className="w-4 h-4" />
        发送测试包
      </button>

      <button
        onClick={onTogglePerformance}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
        title="性能监控"
      >
        <Activity className="w-4 h-4" />
        监控
      </button>

      <div
        className={`w-3 h-3 rounded-full ${
          simulationRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
        }`}
      />

      {showLoadDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700">
            <h3 className="text-white text-lg font-semibold mb-4">加载拓扑</h3>
            <div className="space-y-2 max-h-64 overflow-auto">
              {savedTopologies.length === 0 ? (
                <p className="text-slate-400 text-sm">暂无保存的拓扑</p>
              ) : (
                savedTopologies.map((topo) => (
                  <button
                    key={topo.id}
                    onClick={() => handleLoadTopology(topo.id)}
                    className="w-full text-left p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  >
                    <div className="text-white font-medium">{topo.name}</div>
                    <div className="text-slate-400 text-xs">{topo.created_at}</div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => setShowLoadDialog(false)}
              className="mt-4 w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {showPacketDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-96 border border-slate-700">
            <h3 className="text-white text-lg font-semibold mb-4">发送测试数据包</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-1">源主机</label>
                <select
                  value={packetSrc}
                  onChange={(e) => setPacketSrc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">选择源主机</option>
                  {hostNodes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.data.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1">目的主机</label>
                <select
                  value={packetDst}
                  onChange={(e) => setPacketDst(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">选择目的主机</option>
                  {hostNodes.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.data.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 text-sm mb-1">数据包类型</label>
                <select
                  value={packetType}
                  onChange={(e) => setPacketType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="ICMP">ICMP</option>
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowPacketDialog(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSendPacket}
                disabled={!packetSrc || !packetDst}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Toolbar;

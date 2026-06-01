import { useCallback, useEffect, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, Node, Edge, MarkerType, useNodesState, useEdgesState, addEdge, Connection } from "reactflow";
import "reactflow/dist/style.css";
import { Plus, Trash2, Scale, Network, Route, Layers, X, Settings, Download, Activity } from "lucide-react";
import { VnfNode } from "@/components/VnfNode";
import { useManoStore } from "@/store";

const nodeTypes = {
  vnf: VnfNode,
};

const statusLabels: Record<string, string> = {
  running: "运行中",
  instantiating: "实例化中",
  scaling: "伸缩中",
  terminating: "终止中",
  stopped: "已停止",
  error: "异常",
  waiting: "等待中",
};

interface InstantiateDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { vnfdId: string; name: string; positionX: number; positionY: number; dependsOn?: string[] }) => void;
}

function InstantiateDialog({ open, onClose, onSubmit }: InstantiateDialogProps) {
  const { vnfds, vnfs } = useManoStore();
  const [name, setName] = useState("");
  const [vnfdId, setVnfdId] = useState(vnfds[0]?.id || "");
  const [dependsOn, setDependsOn] = useState<string[]>([]);

  if (!open) return null;

  const handleSubmit = () => {
    onSubmit({ vnfdId, name, positionX: 300, positionY: 200, dependsOn: dependsOn.length ? dependsOn : undefined });
    setName("");
    setDependsOn([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-cyan-900/40 bg-[#0F1A2E] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-900/20">
          <h3 className="font-semibold text-gray-200">实例化 VNF</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">VNF 名称</label>
            <input
              type="text"
              placeholder="my-vnf"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">VNFD 模板</label>
            <select
              className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
              value={vnfdId}
              onChange={(e) => setVnfdId(e.target.value)}
            >
              {vnfds.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">依赖 VNF (可选)</label>
            <div className="max-h-32 overflow-y-auto space-y-1 border border-cyan-900/30 rounded-lg p-2 bg-[#0D1525]">
              {vnfs.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-2">暂无可用 VNF</div>
              ) : (
                vnfs.map((v) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm text-gray-300 p-2 rounded hover:bg-cyan-900/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dependsOn.includes(v.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setDependsOn([...dependsOn, v.id]);
                        } else {
                          setDependsOn(dependsOn.filter((id) => id !== v.id));
                        }
                      }}
                      className="rounded border-cyan-900/50 bg-[#0D1525] text-cyan-500 focus:ring-cyan-500/30"
                    />
                    {v.name} ({v.type})
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-cyan-900/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name || !vnfdId}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
}

interface BatchDialogProps {
  open: boolean;
  onClose: () => void;
}

function BatchDialog({ open, onClose }: BatchDialogProps) {
  const { vnfds, batchInstantiateVnfs } = useManoStore();
  const [items, setItems] = useState<{ id: string; name: string; vnfdId: string }[]>([]);

  if (!open) return null;

  const addItem = () => {
    setItems([...items, { id: `item-${Date.now()}`, name: `vnf-${items.length + 1}`, vnfdId: vnfds[0]?.id || "" }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, field: "name" | "vnfdId", value: string) => {
    setItems(items.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const handleSubmit = () => {
    batchInstantiateVnfs(items.map((i) => ({ name: i.name, vnfdId: i.vnfdId })));
    setItems([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[80vh] rounded-xl border border-cyan-900/40 bg-[#0F1A2E] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-900/20">
          <h3 className="font-semibold text-gray-200">批量实例化 VNF (拓扑排序)</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2 p-3 bg-[#0D1525] rounded-lg border border-cyan-900/20">
              <span className="text-sm text-gray-500 w-6 font-mono">{idx + 1}.</span>
              <input
                type="text"
                placeholder="VNF 名称"
                value={item.name}
                onChange={(e) => updateItem(item.id, "name", e.target.value)}
                className="flex-1 h-9 px-2 rounded border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
              />
              <select
                className="h-9 px-2 rounded border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50 w-28"
                value={item.vnfdId}
                onChange={(e) => updateItem(item.id, "vnfdId", e.target.value)}
              >
                {vnfds.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.type}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeItem(item.id)}
                className="p-1.5 rounded hover:bg-rose-900/20 text-gray-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addItem}
            className="w-full h-10 rounded-lg border border-dashed border-cyan-900/40 text-gray-400 text-sm hover:bg-cyan-900/10 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            添加 VNF
          </button>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-cyan-900/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={items.length < 2}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            批量创建 ({items.length})
          </button>
        </div>
      </div>
    </div>
  );
}

interface RouteTablePanelProps {
  vnfId: string;
  onClose: () => void;
}

function RouteTablePanel({ vnfId, onClose }: RouteTablePanelProps) {
  const { vnfs, routeTables, fetchRouteTable } = useManoStore();
  const vnf = vnfs.find((v) => v.id === vnfId);
  const rt = routeTables[vnfId];

  useEffect(() => {
    fetchRouteTable(vnfId);
  }, [vnfId, fetchRouteTable]);

  if (!vnf) return null;

  return (
    <div className="absolute top-4 right-4 w-96 rounded-xl border border-cyan-900/40 bg-[#0F1A2E]/95 backdrop-blur shadow-xl z-10 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-900/20 bg-[#0D1525]">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-cyan-400" />
          <span className="font-medium text-sm text-gray-200">路由表 - {vnf.name}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>
      <div className="p-4 max-h-80 overflow-y-auto">
        {!rt || rt.entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">暂无路由条目</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>版本: {rt.version}</span>
              <span>更新: {new Date(rt.lastUpdated).toLocaleTimeString()}</span>
            </div>
            {rt.entries.map((entry, idx) => (
              <div key={idx} className="p-3 bg-[#0D1525] rounded-lg text-xs border border-cyan-900/20">
                <div className="flex justify-between mb-2">
                  <span className="text-cyan-400 font-mono">{entry.destinationCidr}</span>
                  <span className="px-2 py-0.5 rounded border border-cyan-900/30 text-gray-400">{entry.protocol}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-gray-500">
                  <div>下一跳: {entry.nextHopIp}</div>
                  <div>接口: {entry.interfaceName}</div>
                  <div>度量: {entry.metric}</div>
                </div>
              </div>
            ))}
        )}
      </div>
    </div>
  );
}

interface AutoScalingDialogProps {
  vnfId: string;
  open: boolean;
  onClose: () => void;
}

function AutoScalingDialog({ vnfId, open, onClose }: AutoScalingDialogProps) {
  const { vnfs, autoScalingConfigs, fetchAutoScalingConfig, updateAutoScalingConfig } = useManoStore();
  const vnf = vnfs.find((v) => v.id === vnfId);
  const config = autoScalingConfigs[vnfId];
  const [localConfig, setLocalConfig] = useState({
    minReplicas: 1,
    maxReplicas: 10,
    scaleUpThreshold: 70,
    scaleDownThreshold: 30,
    cooldownSeconds: 300,
    enabled: false,
  });

  useEffect(() => {
    if (open && vnfId) {
      fetchAutoScalingConfig(vnfId);
    }
  }, [open, vnfId, fetchAutoScalingConfig]);

  useEffect(() => {
    if (config) {
      setLocalConfig({
        minReplicas: config.minReplicas,
        maxReplicas: config.maxReplicas,
        scaleUpThreshold: config.scaleUpThreshold,
        scaleDownThreshold: config.scaleDownThreshold,
        cooldownSeconds: config.cooldownSeconds,
        enabled: config.enabled,
      });
    }
  }, [config]);

  if (!open || !vnf) return null;

  const handleSave = () => {
    updateAutoScalingConfig(vnfId, localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-cyan-900/40 bg-[#0F1A2E] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-900/20">
          <h3 className="font-semibold text-gray-200 flex items-center gap-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            自动扩容配置 - {vnf.name}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">启用自动扩容</label>
            <button
              onClick={() => setLocalConfig({ ...localConfig, enabled: !localConfig.enabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                localConfig.enabled ? "bg-cyan-500" : "bg-gray-600"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
                  localConfig.enabled ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">最小副本数</label>
              <input
                type="number"
                value={localConfig.minReplicas}
                onChange={(e) => setLocalConfig({ ...localConfig, minReplicas: parseInt(e.target.value) || 1 })}
                className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                min="1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">最大副本数</label>
              <input
                type="number"
                value={localConfig.maxReplicas}
                onChange={(e) => setLocalConfig({ ...localConfig, maxReplicas: parseInt(e.target.value) || 10 })}
                className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                min="1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">扩容阈值 (%)</label>
              <input
                type="number"
                value={localConfig.scaleUpThreshold}
                onChange={(e) => setLocalConfig({ ...localConfig, scaleUpThreshold: parseInt(e.target.value) || 70 })}
                className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                min="1"
                max="100"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">缩容阈值 (%)</label>
              <input
                type="number"
                value={localConfig.scaleDownThreshold}
                onChange={(e) => setLocalConfig({ ...localConfig, scaleDownThreshold: parseInt(e.target.value) || 30 })}
                className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
                min="1"
                max="100"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">冷却时间 (秒)</label>
            <input
              type="number"
              value={localConfig.cooldownSeconds}
              onChange={(e) => setLocalConfig({ ...localConfig, cooldownSeconds: parseInt(e.target.value) || 300 })}
              className="w-full h-10 px-3 rounded-lg border border-cyan-900/30 bg-[#0D1525] text-gray-200 text-sm focus:outline-none focus:border-cyan-500/50"
              min="60"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-cyan-900/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm hover:bg-cyan-700 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

interface ToscaExportDialogProps {
  vnfId: string;
  open: boolean;
  onClose: () => void;
}

function ToscaExportDialog({ vnfId, open, onClose }: ToscaExportDialogProps) {
  const { vnfs, exportToscaTemplate } = useManoStore();
  const vnf = vnfs.find((v) => v.id === vnfId);
  const [template, setTemplate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && vnfId) {
      setLoading(true);
      exportToscaTemplate(vnfId).then((t) => {
        setTemplate(t);
        setLoading(false);
      });
    }
  }, [open, vnfId, exportToscaTemplate]);

  if (!open || !vnf) return null;

  const handleDownload = () => {
    const blob = new Blob([template], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${vnf.name}-tosca.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-cyan-900/40 bg-[#0F1A2E] shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-900/20">
          <h3 className="font-semibold text-gray-200 flex items-center gap-2">
            <Download className="w-4 h-4 text-emerald-400" />
            TOSCA 模板 - {vnf.name}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="text-center py-12 text-gray-500">加载中...</div>
          ) : (
            <pre className="p-4 bg-[#0D1525] rounded-lg text-xs text-gray-300 overflow-auto max-h-96 font-mono border border-cyan-900/20">
              {template}
            </pre>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-cyan-900/20">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            下载 YAML
          </button>
        </div>
      </div>
    </div>
  );
}

export function Topology() {
  const { vnfs, links, instantiateVnf, terminateVnf, scaleVnf, selectVnf, selectedVnfId, metrics, fetchMetrics, autoScalingConfigs } = useManoStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [instantiateOpen, setInstantiateOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [showRouteTable, setShowRouteTable] = useState<string | null>(null);
  const [autoScalingOpen, setAutoScalingOpen] = useState(false);
  const [toscaOpen, setToscaOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "routes" | "deps" | "metrics" | "autoscaling">("info");

  useEffect(() => {
    const newNodes: Node[] = vnfs.map((vnf) => ({
      id: vnf.id,
      type: "vnf",
      position: { x: vnf.positionX, y: vnf.positionY },
      data: { label: vnf.name, type: vnf.type, status: vnf.status, replicas: vnf.replicaCount },
    }));
    setNodes(newNodes);

    const newEdges: Edge[] = links.map((link) => ({
      id: link.id,
      source: link.sourceId,
      target: link.targetId,
      label: `${link.bandwidth} Mbps`,
      animated: link.status === "active",
      style: { stroke: link.status === "active" ? "#00F0FF" : "#6e7681", strokeWidth: 2 },
      labelStyle: { fill: "#8b949e", fontSize: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: link.status === "active" ? "#00F0FF" : "#6e7681" },
    }));
    setEdges(newEdges);
  }, [vnfs, links, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleInstantiate = (data: { vnfdId: string; name: string; positionX: number; positionY: number; dependsOn?: string[] }) => {
    instantiateVnf(data);
  };

  const selectedVnf = vnfs.find((v) => v.id === selectedVnfId);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-900/20 bg-[#0F1A2E]">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-gray-200">VNF 拓扑</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBatchOpen(true)}
            className="px-4 py-2 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            批量实例化
          </button>
          <button
            onClick={() => setInstantiateOpen(true)}
            className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm hover:bg-cyan-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            实例化 VNF
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => selectVnf(node.id)}
          onPaneClick={() => selectVnf(null)}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#0D1117]"
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#21262d" gap={20} />
          <MiniMap nodeColor={(n) => (n.data.status === "running" ? "#00FF88" : "#8b949e")} maskColor="#0D1117" />
          <Controls />
        </ReactFlow>

        {showRouteTable && <RouteTablePanel vnfId={showRouteTable} onClose={() => setShowRouteTable(null)} />}

        {selectedVnf && (
          <div className="absolute bottom-4 left-4 w-80 rounded-xl border border-cyan-900/40 bg-[#0F1A2E]/95 backdrop-blur shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-900/20">
              <div>
                <div className="font-medium text-gray-200">{selectedVnf.name}</div>
                <div className="text-xs text-gray-500">{selectedVnf.type}</div>
              </div>
              <span className="px-2 py-1 rounded text-xs font-medium bg-cyan-900/30 text-cyan-400">
                {statusLabels[selectedVnf.status] || selectedVnf.status}
              </span>
            </div>

            <div className="border-b border-cyan-900/20">
              <div className="flex flex-wrap">
                {(["info", "metrics", "autoscaling", "routes", "deps"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab ? "text-cyan-400 border-b-2 border-cyan-400" : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {tab === "info" ? "信息" : tab === "routes" ? "路由" : tab === "deps" ? "依赖" : tab === "metrics" ? "监控" : "扩缩容"}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 max-h-52 overflow-y-auto">
              {activeTab === "info" && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">实例数</span>
                    <span className="text-gray-300 font-mono">{selectedVnf.replicaCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CPU</span>
                    <span className="text-gray-300 font-mono">{selectedVnf.cpu} vCPU</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">内存</span>
                    <span className="text-gray-300 font-mono">{selectedVnf.memory} MB</span>
                  </div>
                </div>
              )}

              {activeTab === "metrics" && (
                <MetricsContent vnfId={selectedVnf.id} />
              )}

              {activeTab === "autoscaling" && (
                <AutoScalingContent
                  vnfId={selectedVnf.id}
                  onConfigure={() => setAutoScalingOpen(true)}
                />
              )}

              {activeTab === "routes" && (
                <button
                  onClick={() => setShowRouteTable(selectedVnf.id)}
                  className="w-full h-10 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors flex items-center justify-center gap-2"
                >
                  <Route className="w-4 h-4" />
                  查看路由表
                </button>
              )}

              {activeTab === "deps" && (
                <div className="text-sm">
                  {!selectedVnf.dependsOn || selectedVnf.dependsOn.length === 0 ? (
                    <div className="text-gray-500 text-center py-2">无依赖</div>
                  ) : (
                    <div className="space-y-1">
                      {selectedVnf.dependsOn.map((depId) => {
                        const depVnf = vnfs.find((v) => v.id === depId);
                        return (
                          <div key={depId} className="flex items-center gap-2 p-2 bg-[#0D1525] rounded border border-cyan-900/20">
                            <span className="px-2 py-0.5 rounded text-xs bg-cyan-900/30 text-cyan-400">
                              {depVnf?.name || depId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-4 py-3 border-t border-cyan-900/20">
              <button
                onClick={() => setToscaOpen(true)}
                className="flex-1 h-9 rounded-lg border border-emerald-900/30 text-emerald-400 text-sm hover:bg-emerald-900/20 transition-colors flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                TOSCA
              </button>
              <button
                onClick={() => scaleVnf(selectedVnf.id, { replicaCount: selectedVnf.replicaCount + 1 })}
                disabled={selectedVnf.status !== "running"}
                className="flex-1 h-9 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Scale className="w-4 h-4" />
                伸缩
              </button>
              <button
                onClick={() => terminateVnf(selectedVnf.id)}
                className="flex-1 h-9 rounded-lg bg-rose-900/30 text-rose-400 text-sm hover:bg-rose-900/50 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                终止
              </button>
            </div>
          </div>
        )}
      </div>

      <InstantiateDialog open={instantiateOpen} onClose={() => setInstantiateOpen(false)} onSubmit={handleInstantiate} />
      <BatchDialog open={batchOpen} onClose={() => setBatchOpen(false)} />
      {selectedVnfId && (
        <>
          <AutoScalingDialog vnfId={selectedVnfId} open={autoScalingOpen} onClose={() => setAutoScalingOpen(false)} />
          <ToscaExportDialog vnfId={selectedVnfId} open={toscaOpen} onClose={() => setToscaOpen(false)} />
        </>
      )}
    </div>
  );
}

function MetricsContent({ vnfId }: { vnfId: string }) {
  const { metrics, fetchMetrics } = useManoStore();
  const vnfMetrics = metrics[vnfId] || [];

  useEffect(() => {
    fetchMetrics(vnfId);
  }, [vnfId, fetchMetrics]);

  if (vnfMetrics.length === 0) {
    return <div className="text-gray-500 text-center py-4 text-sm">暂无监控数据</div>;
  }

  const latest = vnfMetrics[vnfMetrics.length - 1];
  const cpuColor = latest.cpuUsage > 70 ? "text-rose-400" : latest.cpuUsage > 50 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-sm flex items-center gap-2">
          <Activity className="w-4 h-4" />
          CPU 使用率
        </span>
        <span className={`font-mono text-sm ${cpuColor}`}>{latest.cpuUsage.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-[#0D1525] rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${latest.cpuUsage > 70 ? "bg-rose-500" : latest.cpuUsage > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${Math.min(latest.cpuUsage, 100)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
          <div className="text-gray-500 text-xs">内存</div>
          <div className="font-mono text-cyan-400">{latest.memoryUsage.toFixed(1)}%</div>
        </div>
        <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
          <div className="text-gray-500 text-xs">网络入</div>
          <div className="font-mono text-cyan-400">{latest.networkIn.toFixed(0)} Mbps</div>
        </div>
      </div>
    </div>
  );
}

function AutoScalingContent({ vnfId, onConfigure }: { vnfId: string; onConfigure: () => void }) {
  const { autoScalingConfigs, fetchAutoScalingConfig } = useManoStore();
  const config = autoScalingConfigs[vnfId];

  useEffect(() => {
    fetchAutoScalingConfig(vnfId);
  }, [vnfId, fetchAutoScalingConfig]);

  return (
    <div className="space-y-3">
      {config && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-gray-500 text-sm">状态</span>
            <span className={`text-sm font-medium ${config.enabled ? "text-emerald-400" : "text-gray-500"}`}>
              {config.enabled ? "已启用" : "已禁用"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
              <div className="text-gray-500 text-xs">扩容阈值</div>
              <div className="font-mono text-cyan-400">{config.scaleUpThreshold}%</div>
            </div>
            <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
              <div className="text-gray-500 text-xs">缩容阈值</div>
              <div className="font-mono text-cyan-400">{config.scaleDownThreshold}%</div>
            </div>
            <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
              <div className="text-gray-500 text-xs">最小副本</div>
              <div className="font-mono text-cyan-400">{config.minReplicas}</div>
            </div>
            <div className="p-2 bg-[#0D1525] rounded border border-cyan-900/20">
              <div className="text-gray-500 text-xs">最大副本</div>
              <div className="font-mono text-cyan-400">{config.maxReplicas}</div>
            </div>
          </div>
        </>
      )}
      <button
        onClick={onConfigure}
        className="w-full h-9 rounded-lg border border-cyan-900/30 text-gray-300 text-sm hover:bg-cyan-900/10 transition-colors flex items-center justify-center gap-2"
      >
        <Settings className="w-4 h-4" />
        配置自动扩容
      </button>
    </div>
  );
}

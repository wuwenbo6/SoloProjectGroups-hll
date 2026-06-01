import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import type { OpcuaNode, NodeHistory } from '../../shared/types';
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  Database, 
  Hash,
  Box,
  RefreshCw,
  Copy,
  Check,
  Search,
  Clock,
  Trash2
} from 'lucide-react';

const NodeBrowser: React.FC = () => {
  const { 
    opcuaNodes, 
    selectedNode, 
    fetchOpcuaNodes, 
    selectNode,
    fetchHistory,
    historyData,
    loading 
  } = useAppStore();

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['i=85', 'ns=1;s=Devices']));
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(50);

  useEffect(() => {
    fetchOpcuaNodes();
    const interval = setInterval(fetchOpcuaNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleNodeClick = (node: OpcuaNode) => {
    selectNode(node);
    if (node.children.length > 0) {
      toggleExpand(node.nodeId);
    }
    if (node.nodeClass === 'Variable') {
      fetchHistory({ nodeId: node.nodeId, limit: historyLimit });
      setShowHistory(true);
    } else {
      setShowHistory(false);
    }
  };

  const copyNodeId = (nodeId: string) => {
    navigator.clipboard.writeText(nodeId);
    setCopiedNodeId(nodeId);
    setTimeout(() => setCopiedNodeId(null), 2000);
  };

  const filterNodes = (node: OpcuaNode, search: string): OpcuaNode | null => {
    if (!search) return node;
    
    const lowerSearch = search.toLowerCase();
    const matchesSelf = 
      node.browseName.toLowerCase().includes(lowerSearch) ||
      node.displayName.toLowerCase().includes(lowerSearch) ||
      node.nodeId.toLowerCase().includes(lowerSearch);
    
    const filteredChildren = node.children
      .map(child => filterNodes(child, search))
      .filter((child): child is OpcuaNode => child !== null);
    
    if (matchesSelf || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }
    return null;
  };

  const renderValue = (node: OpcuaNode) => {
    if (node.value === undefined || node.value === null) return '-';
    if (typeof node.value === 'boolean') {
      return (
        <span className={`px-2 py-0.5 rounded text-xs ${node.value ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {node.value ? 'TRUE' : 'FALSE'}
        </span>
      );
    }
    if (typeof node.value === 'number') {
      return <span className="text-cyan-400 font-mono">{node.value}</span>;
    }
    return String(node.value);
  };

  const getNodeIcon = (node: OpcuaNode) => {
    if (node.children.length > 0) {
      return <Folder className="w-4 h-4 text-amber-400" />;
    }
    if (node.nodeClass === 'Variable') {
      return <Hash className="w-4 h-4 text-cyan-400" />;
    }
    return <Box className="w-4 h-4 text-slate-400" />;
  };

  const renderTreeNode = (node: OpcuaNode, depth = 0) => {
    const isExpanded = expandedNodes.has(node.nodeId);
    const isSelected = selectedNode?.nodeId === node.nodeId;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.nodeId}>
        <div
          className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded transition-colors ${
            isSelected 
              ? 'bg-cyan-600/20 text-cyan-300' 
              : 'hover:bg-slate-700/50 text-slate-300'
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.nodeId); }}
              className="p-0.5 hover:bg-slate-600 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}
          {getNodeIcon(node)}
          <span className="text-sm truncate flex-1">{node.displayName}</span>
          {node.nodeClass === 'Variable' && node.value !== undefined && (
            <span className="text-xs text-slate-400 ml-2">
              {renderValue(node)}
            </span>
          )}
        </div>
        {isExpanded && hasChildren && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredTree = searchTerm && opcuaNodes ? filterNodes(opcuaNodes, searchTerm) : opcuaNodes;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">节点浏览器</h1>
          <p className="text-slate-400 mt-1">浏览OPC UA服务器地址空间，查看节点属性和值</p>
        </div>
        <button
          onClick={fetchOpcuaNodes}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading.opcuaNodes ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
            <Database className="w-5 h-5 text-cyan-400" />
            <h2 className="font-semibold text-white">地址空间</h2>
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索节点..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
          <div className="h-[600px] overflow-auto p-2">
            {!opcuaNodes ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                  <p>加载节点树...</p>
                </div>
              </div>
            ) : !filteredTree || (filteredTree.children.length === 0 && searchTerm) ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <div className="text-center">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{searchTerm ? '没有匹配的节点' : '暂无节点数据，请先配置映射规则'}</p>
                </div>
              </div>
            ) : (
              <div className="font-mono text-sm">
                {filteredTree.children.map(child => renderTreeNode(child, 0))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-3">
            <Box className="w-5 h-5 text-cyan-400" />
            <h2 className="font-semibold text-white">节点属性</h2>
          </div>
          <div className="p-4">
            {!selectedNode ? (
              <div className="flex items-center justify-center h-[550px] text-slate-400">
                <div className="text-center">
                  <Box className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>选择一个节点查看属性</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-900 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">显示名称</span>
                    <span className="text-white font-medium">{selectedNode.displayName}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-400 text-sm">浏览名称</span>
                    <span className="text-white font-mono text-sm">{selectedNode.browseName}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">NodeId</span>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-mono text-sm">{selectedNode.nodeId}</span>
                      <button
                        onClick={() => copyNodeId(selectedNode.nodeId)}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        title="复制NodeId"
                      >
                        {copiedNodeId === selectedNode.nodeId ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900 rounded-lg p-3">
                    <span className="text-slate-400 text-xs">节点类</span>
                    <p className="text-white font-medium mt-1">{selectedNode.nodeClass}</p>
                  </div>
                  {selectedNode.dataType && (
                    <div className="bg-slate-900 rounded-lg p-3">
                      <span className="text-slate-400 text-xs">数据类型</span>
                      <p className="text-white font-medium mt-1">{selectedNode.dataType}</p>
                    </div>
                  )}
                  <div className="bg-slate-900 rounded-lg p-3">
                    <span className="text-slate-400 text-xs">子节点数</span>
                    <p className="text-white font-medium mt-1">{selectedNode.children.length}</p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-3">
                    <span className="text-slate-400 text-xs">访问级别</span>
                    <p className={`font-medium mt-1 ${selectedNode.readOnly ? 'text-amber-400' : 'text-green-400'}`}>
                      {selectedNode.readOnly ? '只读' : '可读写'}
                    </p>
                  </div>
                </div>

                {selectedNode.description && (
                  <div className="bg-slate-900 rounded-lg p-3">
                    <span className="text-slate-400 text-xs">描述</span>
                    <p className="text-white text-sm mt-1">{selectedNode.description}</p>
                  </div>
                )}

                {selectedNode.nodeClass === 'Variable' && (
                  <div className="bg-slate-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-slate-400 text-sm">当前值</span>
                      <span className="text-xs text-slate-500">每5秒自动刷新</span>
                    </div>
                    <div className="flex items-center justify-center py-6">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-white mb-2">
                          {renderValue(selectedNode)}
                        </div>
                        <div className="text-xs text-slate-500">
                          最后更新: {new Date().toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedNode.children.length > 0 && (
                  <div className="bg-slate-900 rounded-lg p-4">
                    <span className="text-slate-400 text-sm">子节点列表</span>
                    <div className="mt-3 space-y-1 max-h-48 overflow-auto">
                      {selectedNode.children.map((child, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors"
                          onClick={() => selectNode(child)}
                        >
                          {getNodeIcon(child)}
                          <span className="text-white text-sm flex-1">{child.displayName}</span>
                          <span className="text-xs text-slate-400">{child.nodeClass}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {showHistory && selectedNode.nodeClass === 'Variable' && (
                  <div className="bg-slate-900 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        <span className="text-slate-300 text-sm font-medium">历史数据</span>
                        <span className="text-xs text-slate-500">({historyData.length} 条)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={historyLimit}
                          onChange={(e) => {
                            const newLimit = parseInt(e.target.value, 10);
                            setHistoryLimit(newLimit);
                            fetchHistory({ nodeId: selectedNode.nodeId, limit: newLimit });
                          }}
                          className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-xs"
                        >
                          <option value={10}>10条</option>
                          <option value={50}>50条</option>
                          <option value={100}>100条</option>
                          <option value={500}>500条</option>
                        </select>
                        <button
                          onClick={() => fetchHistory({ nodeId: selectedNode.nodeId, limit: historyLimit })}
                          className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                          title="刷新历史数据"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {historyData.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 text-sm">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        暂无历史数据
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                              <th className="text-left py-2 px-2">时间</th>
                              <th className="text-right py-2 px-2">值</th>
                              <th className="text-center py-2 px-2">质量</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.map((record: NodeHistory) => (
                              <tr key={record.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                                <td className="py-2 px-2 text-slate-300 font-mono">
                                  {record.sourceTimestamp?.replace('T', ' ').substring(0, 19)}
                                </td>
                                <td className="py-2 px-2 text-right text-cyan-400 font-mono">
                                  {record.value}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                                    record.quality === 'Good' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                  }`}>
                                    {record.quality}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeBrowser;

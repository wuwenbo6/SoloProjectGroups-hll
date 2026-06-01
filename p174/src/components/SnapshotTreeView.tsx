import { useState } from 'react';
import { ChevronRight, HardDrive, Camera, Shield, Clock, Copy, RotateCcw, Trash2, Download, Calendar } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatBytes, formatDate } from '../utils/format';
import type { SnapshotTreeNode } from '../types';

interface TreeNodeProps {
  node: SnapshotTreeNode;
  onSelect: (node: SnapshotTreeNode) => void;
  selectedId: string | null;
}

function TreeNode({ node, onSelect, selectedId }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const getNodeStyle = () => {
    if (node.type === 'image') {
      return {
        bg: isSelected ? 'bg-cyan-500/20 border-cyan-500/50' : 'bg-slate-800/80 border-slate-700',
        icon: HardDrive,
        iconColor: 'text-cyan-400',
      };
    }
    return {
      bg: isSelected ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-800/50 border-slate-700/50',
      icon: Camera,
      iconColor: node.isProtected ? 'text-emerald-400' : 'text-amber-400',
    };
  };

  const style = getNodeStyle();
  const IconComponent = style.icon;

  return (
    <div className="relative">
      <div
        className={`flex items-center gap-2 rounded-lg border transition-all duration-200 cursor-pointer hover:shadow-lg ${style.bg}`}
        onClick={() => onSelect(node)}
        style={{ marginLeft: `${node.level * 24}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className={`p-1 transition-transform duration-200 ${hasChildren ? '' : 'invisible'} ${
            expanded ? 'rotate-90' : ''
          }`}
        >
          <ChevronRight className="w-3 h-3 text-slate-500" />
        </button>
        <IconComponent className={`w-4 h-4 ${style.iconColor}`} />
        <span className="font-mono text-sm text-white truncate max-w-48">{node.name}</span>
        {node.type === 'snapshot' && node.isProtected && (
          <Shield className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        )}
        {node.size && (
          <span className="text-xs text-slate-500 ml-auto pr-2">{formatBytes(node.size)}</span>
        )}
      </div>

      {hasChildren && expanded && (
        <div className="relative mt-1">
          <div
            className="absolute w-px bg-slate-700"
            style={{ left: `${node.level * 24 + 16}px`, top: 0, bottom: 0 }}
          />
          {node.children!.map((child, index) => (
            <div key={child.id} className="relative pl-4 mt-1">
              <div
                className="absolute w-4 h-px bg-slate-700"
                style={{ left: `${node.level * 24 + 16}px`, top: '16px' }}
              />
              <TreeNode node={child} onSelect={onSelect} selectedId={selectedId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SnapshotTreeView() {
  const {
    snapshotTree,
    loadingSnapshotTree,
    selectedNode,
    setSelectedNode,
    fetchSnapshotTree,
    setCloneDialogOpen,
    setScheduleDialogOpen,
    setExportDiffDialogOpen,
    showConfirm,
    rollbackSnapshot,
    deleteSnapshot,
  } = useRbdStore();

  const handleRollback = () => {
    if (!selectedNode || selectedNode.type !== 'snapshot') return;
    const [pool, image] = (selectedNode.parent || '').split('/');
    showConfirm(
      '回滚快照',
      `确定要将镜像回滚到快照 ${selectedNode.name} 吗？此操作将覆盖当前数据，且无法撤销。`,
      () => rollbackSnapshot(pool, image, selectedNode.name),
      true
    );
  };

  const handleDelete = () => {
    if (!selectedNode || selectedNode.type !== 'snapshot') return;
    const [pool, image] = (selectedNode.parent || '').split('/');
    showConfirm(
      '删除快照',
      `确定要删除快照 ${selectedNode.name} 吗？${selectedNode.isProtected ? '该快照受保护，将先解除保护。' : ''}`,
      () => deleteSnapshot(pool, image, selectedNode.name, selectedNode.isProtected),
      true
    );
  };

  const handleClone = () => {
    if (!selectedNode || selectedNode.type !== 'snapshot') return;
    setCloneDialogOpen(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      <div className="lg:col-span-2 bg-slate-900/50 rounded-xl border border-slate-800 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">快照树</h2>
          <button
            onClick={fetchSnapshotTree}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        </div>

        {loadingSnapshotTree ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : snapshotTree.length === 0 ? (
          <div className="text-center py-20 text-slate-500">
            <HardDrive className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">暂无 RBD 镜像</p>
            <p className="text-sm mt-1">请先在 Ceph 集群中创建镜像</p>
          </div>
        ) : (
          <div className="space-y-2">
            {snapshotTree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                onSelect={setSelectedNode}
                selectedId={selectedNode?.id || null}
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">节点详情</h3>

        {!selectedNode ? (
          <div className="text-center py-12 text-slate-500">
            <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">点击左侧节点查看详情</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-slate-500 text-xs mb-1">类型</p>
              <p className="text-white font-semibold flex items-center gap-2">
                {selectedNode.type === 'image' ? (
                  <><HardDrive className="w-4 h-4 text-cyan-400" /> 镜像</>
                ) : (
                  <><Camera className="w-4 h-4 text-amber-400" /> 快照</>
                )}
              </p>
            </div>

            <div>
              <p className="text-slate-500 text-xs mb-1">名称</p>
              <p className="font-mono text-sm text-white">{selectedNode.name}</p>
            </div>

            {selectedNode.pool && (
              <div>
                <p className="text-slate-500 text-xs mb-1">存储池</p>
                <p className="font-mono text-sm text-cyan-400">{selectedNode.pool}</p>
              </div>
            )}

            {selectedNode.size && (
              <div>
                <p className="text-slate-500 text-xs mb-1">大小</p>
                <p className="text-white font-semibold">{formatBytes(selectedNode.size)}</p>
              </div>
            )}

            {selectedNode.timestamp && (
              <div>
                <p className="text-slate-500 text-xs mb-1">时间</p>
                <p className="text-sm text-slate-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatDate(selectedNode.timestamp)}
                </p>
              </div>
            )}

            {selectedNode.type === 'snapshot' && (
              <div>
                <p className="text-slate-500 text-xs mb-1">状态</p>
                <p className="text-sm flex items-center gap-1">
                  {selectedNode.isProtected ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Shield className="w-3 h-3" /> 受保护
                    </span>
                  ) : (
                    <span className="text-slate-400">未受保护</span>
                  )}
                </p>
              </div>
            )}

            {selectedNode.children && selectedNode.children.length > 0 && (
              <div>
                <p className="text-slate-500 text-xs mb-1">子节点</p>
                <p className="text-white font-semibold">{selectedNode.children.length} 个</p>
              </div>
            )}

            {selectedNode.type === 'image' && (
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => setScheduleDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-violet-500/20"
                >
                  <Calendar className="w-4 h-4" />
                  设置定时快照
                </button>
                <button
                  onClick={() => setExportDiffDialogOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-amber-500/20"
                >
                  <Download className="w-4 h-4" />
                  导出快照差异
                </button>
              </div>
            )}

            {selectedNode.type === 'snapshot' && (
              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={handleClone}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-emerald-500/20"
                >
                  <Copy className="w-4 h-4" />
                  克隆为新镜像
                </button>
                <button
                  onClick={handleRollback}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                >
                  <RotateCcw className="w-4 h-4" />
                  回滚到此快照
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/90 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-red-500/20"
                >
                  <Trash2 className="w-4 h-4" />
                  删除快照
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

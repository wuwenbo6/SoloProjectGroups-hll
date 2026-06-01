import { X, HardDrive, Camera, Clock, Shield, ShieldOff, RotateCcw, Trash2, Copy, Download, Calendar } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatBytes, formatDate, getPoolColor } from '../utils/format';
import type { RbdSnapshot } from '../types';

export default function ImageDetailDrawer() {
  const {
    drawerOpen,
    setDrawerOpen,
    selectedImage,
    loadingImageDetail,
    setCreateSnapDialogOpen,
    setScheduleDialogOpen,
    setExportDiffDialogOpen,
    showConfirm,
    rollbackSnapshot,
    deleteSnapshot,
    cloneSnapshot,
  } = useRbdStore();

  if (!drawerOpen || !selectedImage) return null;

  const handleRollback = (snap: RbdSnapshot) => {
    showConfirm(
      '回滚快照',
      `确定要将镜像 ${selectedImage.pool}/${selectedImage.name} 回滚到快照 ${snap.name} 吗？此操作将覆盖当前数据，且无法撤销。`,
      () => rollbackSnapshot(selectedImage.pool, selectedImage.name, snap.name),
      true
    );
  };

  const handleDelete = (snap: RbdSnapshot) => {
    showConfirm(
      '删除快照',
      `确定要删除快照 ${snap.name} 吗？${snap.isProtected ? '该快照受保护，将先解除保护。' : ''}`,
      () => deleteSnapshot(selectedImage.pool, selectedImage.name, snap.name, snap.isProtected),
      true
    );
  };

  const handleClone = (snap: RbdSnapshot) => {
    const newName = prompt('输入新镜像名称:', `${selectedImage.name}-clone`);
    if (newName) {
      cloneSnapshot(selectedImage.pool, selectedImage.name, snap.name, selectedImage.pool, newName);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setDrawerOpen(false)}
      />
      <div className="relative ml-auto w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full overflow-y-auto animate-slide-in">
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${getPoolColor(selectedImage.pool)}/20 bg-cyan-500/10 flex items-center justify-center`}>
              <HardDrive className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">{selectedImage.name}</h2>
              <p className="text-slate-500 text-xs font-mono">{selectedImage.pool}</p>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-2 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-500 text-xs mb-1">大小</p>
              <p className="text-white font-semibold">{formatBytes(selectedImage.size)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-500 text-xs mb-1">格式</p>
              <p className="text-white font-semibold">v{selectedImage.format}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-500 text-xs mb-1">快照数量</p>
              <p className="text-white font-semibold">{selectedImage.snapshotCount}</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-slate-500 text-xs mb-1">创建时间</p>
              <p className="text-white font-semibold text-sm">{formatDate(selectedImage.createTime)}</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">特性</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedImage.features.map((feature) => (
                <span
                  key={feature}
                  className="px-2 py-1 bg-slate-800 text-cyan-400 text-xs font-mono rounded"
                >
                  {feature}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">快照列表</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setScheduleDialogOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-violet-500/20"
                >
                  <Calendar className="w-4 h-4" />
                  定时
                </button>
                <button
                  onClick={() => setExportDiffDialogOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-amber-500/20"
                >
                  <Download className="w-4 h-4" />
                  导出差异
                </button>
                <button
                  onClick={() => setCreateSnapDialogOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Camera className="w-4 h-4" />
                  创建快照
                </button>
              </div>
            </div>

            {loadingImageDetail ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : selectedImage.snapshots.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Camera className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无快照</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedImage.snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4 text-cyan-400" />
                        <span className="font-mono text-sm text-white">{snap.name}</span>
                        {snap.isProtected && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            受保护
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRollback(snap)}
                          className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded transition-colors"
                          title="回滚到此快照"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleClone(snap)}
                          className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                          title="克隆为新镜像"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(snap)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="删除快照"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(snap.timestamp)}
                      </span>
                      <span>{formatBytes(snap.size)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

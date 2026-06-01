import { useState } from 'react';
import { X, Download, ArrowRightLeft } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import type { RbdSnapshot } from '../types';

export default function ExportDiffDialog() {
  const { exportDiffDialogOpen, setExportDiffDialogOpen, exportDiff, selectedImage, selectedNode } = useRbdStore();
  const [fromSnapshot, setFromSnapshot] = useState('');
  const [toSnapshot, setToSnapshot] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [loading, setLoading] = useState(false);

  const pool = selectedImage?.pool || (selectedNode?.type === 'image' ? selectedNode.pool : undefined);
  const imageName = selectedImage?.name || (selectedNode?.type === 'image' ? selectedNode.name : undefined);
  const snapshots = selectedImage?.snapshots || [];

  if (!exportDiffDialogOpen || !pool || !imageName) return null;

  const handleSubmit = async () => {
    setLoading(true);
    await exportDiff(pool, imageName, {
      fromSnapshot: fromSnapshot || undefined,
      toSnapshot: toSnapshot || undefined,
      outputPath: outputPath || undefined,
    });
    setFromSnapshot('');
    setToSnapshot('');
    setOutputPath('');
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setExportDiffDialogOpen(false)}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">导出快照差异</h3>
            </div>
            <button
              onClick={() => setExportDiffDialogOpen(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              目标镜像
            </label>
            <div className="px-4 py-3 bg-slate-800 rounded-lg text-slate-400 text-sm font-mono">
              {pool}/{imageName}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              起始快照 (可选, 留空则导出全量)
            </label>
            <select
              value={fromSnapshot}
              onChange={(e) => setFromSnapshot(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            >
              <option value="">-- 导出全量 --</option>
              {snapshots.map((snap: RbdSnapshot) => (
                <option key={snap.id} value={snap.name}>
                  {snap.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              结束快照 (可选, 留空则使用当前状态)
            </label>
            <select
              value={toSnapshot}
              onChange={(e) => setToSnapshot(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            >
              <option value="">-- 当前状态 --</option>
              {snapshots.map((snap: RbdSnapshot) => (
                <option key={snap.id} value={snap.name}>
                  {snap.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              输出路径 (可选)
            </label>
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              placeholder="/tmp/diff-export.bin"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              留空则自动生成路径
            </p>
          </div>

          {fromSnapshot && toSnapshot && (
            <div className="mb-4 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="text-sm text-cyan-300 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                将导出 {fromSnapshot} → {toSnapshot} 之间的差异
              </p>
            </div>
          )}

          {!fromSnapshot && !toSnapshot && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <p className="text-sm text-amber-300">
                将导出完整镜像
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={() => setExportDiffDialogOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-lg shadow-amber-500/25"
          >
            {loading ? '导出中...' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}

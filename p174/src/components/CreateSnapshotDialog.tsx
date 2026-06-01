import { useState } from 'react';
import { X, Camera } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';

export default function CreateSnapshotDialog() {
  const { createSnapDialogOpen, setCreateSnapDialogOpen, createSnapshot, selectedImage } = useRbdStore();
  const [snapshotName, setSnapshotName] = useState('');
  const [loading, setLoading] = useState(false);

  if (!createSnapDialogOpen || !selectedImage) return null;

  const handleSubmit = async () => {
    if (!snapshotName.trim()) return;
    setLoading(true);
    await createSnapshot(selectedImage.pool, selectedImage.name, snapshotName.trim());
    setSnapshotName('');
    setLoading(false);
    setCreateSnapDialogOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setCreateSnapDialogOpen(false)}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Camera className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">创建快照</h3>
            </div>
            <button
              onClick={() => setCreateSnapDialogOpen(false)}
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
              {selectedImage.pool}/{selectedImage.name}
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              快照名称
            </label>
            <input
              type="text"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="输入快照名称，如 snap-20240101"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={() => setCreateSnapDialogOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!snapshotName.trim() || loading}
            className="px-4 py-2 text-sm font-medium bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-lg shadow-cyan-500/25"
          >
            {loading ? '创建中...' : '创建快照'}
          </button>
        </div>
      </div>
    </div>
  );
}

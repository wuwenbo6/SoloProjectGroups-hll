import { useState } from 'react';
import { X, Copy, HardDrive } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatBytes } from '../utils/format';

const sizeUnits = [
  { label: 'MB', factor: 1024 * 1024 },
  { label: 'GB', factor: 1024 * 1024 * 1024 },
  { label: 'TB', factor: 1024 * 1024 * 1024 * 1024 },
];

export default function CloneDialog() {
  const { cloneDialogOpen, setCloneDialogOpen, cloneSnapshot, selectedNode } = useRbdStore();
  const [newPool, setNewPool] = useState('rbd');
  const [newImageName, setNewImageName] = useState('');
  const [sizeValue, setSizeValue] = useState<string>('');
  const [sizeUnit, setSizeUnit] = useState<string>('GB');
  const [loading, setLoading] = useState(false);

  if (!cloneDialogOpen || !selectedNode || selectedNode.type !== 'snapshot') return null;

  const calculateSizeBytes = (): number | undefined => {
    if (sizeValue.trim() === '' || isNaN(parseFloat(sizeValue))) return undefined;
    const unit = sizeUnits.find((u) => u.label === sizeUnit);
    if (!unit) return undefined;
    return Math.floor(parseFloat(sizeValue) * unit.factor);
  };

  const handleSubmit = async () => {
    if (!newPool.trim() || !newImageName.trim()) return;
    setLoading(true);
    const [parentPool, parentImage] = (selectedNode.parent || '').split('/');
    const sizeBytes = calculateSizeBytes();
    await cloneSnapshot(
      parentPool || 'rbd',
      parentImage || '',
      selectedNode.name,
      newPool.trim(),
      newImageName.trim(),
      sizeBytes
    );
    setNewPool('rbd');
    setNewImageName('');
    setSizeValue('');
    setSizeUnit('GB');
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setCloneDialogOpen(false)}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-scale-in">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Copy className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">克隆为新镜像</h3>
            </div>
            <button
              onClick={() => setCloneDialogOpen(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              源快照
            </label>
            <div className="px-4 py-3 bg-slate-800 rounded-lg text-slate-400 text-sm font-mono">
              {selectedNode.parent}@{selectedNode.name}
            </div>
            {selectedNode.size && (
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                源镜像大小: {formatBytes(selectedNode.size)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                目标存储池
              </label>
              <input
                type="text"
                value={newPool}
                onChange={(e) => setNewPool(e.target.value)}
                placeholder="rbd"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                新镜像名称
              </label>
              <input
                type="text"
                value={newImageName}
                onChange={(e) => setNewImageName(e.target.value)}
                placeholder="new-image-name"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                autoFocus
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              新镜像大小 (可选, 留空使用源镜像大小)
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={sizeValue}
                onChange={(e) => setSizeValue(e.target.value)}
                placeholder="10"
                min="0"
                step="0.1"
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
              <select
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value)}
                className="w-24 px-3 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              >
                {sizeUnits.map((unit) => (
                  <option key={unit.label} value={unit.label}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              支持小于原镜像大小（精简配置）
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={() => setCloneDialogOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!newPool.trim() || !newImageName.trim() || loading}
            className="px-4 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-lg shadow-emerald-500/25"
          >
            {loading ? '克隆中...' : '克隆镜像'}
          </button>
        </div>
      </div>
    </div>
  );
}

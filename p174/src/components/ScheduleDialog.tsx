import { useState } from 'react';
import { X, Clock, Calendar } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';

const cronPresets = [
  { label: '每小时', value: '0 * * * *', description: '每小时的第0分钟执行' },
  { label: '每天凌晨', value: '0 0 * * *', description: '每天00:00执行' },
  { label: '每天凌晨2点', value: '0 2 * * *', description: '每天02:00执行' },
  { label: '每周日', value: '0 0 * * 0', description: '每周日00:00执行' },
  { label: '每月1号', value: '0 0 1 * *', description: '每月1号00:00执行' },
];

export default function ScheduleDialog() {
  const { scheduleDialogOpen, setScheduleDialogOpen, createSchedule, images, selectedImage } = useRbdStore();
  const [name, setName] = useState('');
  const [pool, setPool] = useState(selectedImage?.pool || 'rbd');
  const [imageName, setImageName] = useState(selectedImage?.name || '');
  const [cronExpression, setCronExpression] = useState('0 0 * * *');
  const [prefix, setPrefix] = useState('auto-snap-');
  const [retentionCount, setRetentionCount] = useState<number>(10);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);

  if (!scheduleDialogOpen) return null;

  const handleSubmit = async () => {
    if (!name.trim() || !pool.trim() || !imageName.trim() || !cronExpression.trim() || !prefix.trim()) return;
    setLoading(true);
    await createSchedule({
      name: name.trim(),
      pool: pool.trim(),
      imageName: imageName.trim(),
      cronExpression: cronExpression.trim(),
      prefix: prefix.trim(),
      retentionCount,
      enabled,
    });
    setName('');
    setPool('rbd');
    setImageName('');
    setCronExpression('0 0 * * *');
    setPrefix('auto-snap-');
    setRetentionCount(10);
    setEnabled(true);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setScheduleDialogOpen(false)}
      />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">创建定时快照策略</h3>
            </div>
            <button
              onClick={() => setScheduleDialogOpen(false)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                策略名称
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daily Backup"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                快照前缀
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="auto-snap-"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                存储池
              </label>
              <input
                type="text"
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                placeholder="rbd"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                镜像名称
              </label>
              <input
                type="text"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                placeholder="my-image"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Cron 表达式
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 0 * * *"
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors font-mono text-sm"
              />
              <Clock className="w-5 h-5 text-slate-500 self-center" />
            </div>
            <div className="flex flex-wrap gap-2">
              {cronPresets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setCronExpression(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    cronExpression === preset.value
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2 font-mono">
              格式: 分 时 日 月 周 (e.g. 0 2 * * * = 每天凌晨2点)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                保留数量 (0 = 不限制)
              </label>
              <input
                type="number"
                value={retentionCount}
                onChange={(e) => setRetentionCount(parseInt(e.target.value) || 0)}
                min="0"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
                  onClick={() => setEnabled(!enabled)}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'} mt-0.5`}
                  />
                </div>
                <span className="text-sm font-medium text-slate-300">启用</span>
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-800/50 flex justify-end gap-3">
          <button
            onClick={() => setScheduleDialogOpen(false)}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !pool.trim() || !imageName.trim() || !cronExpression.trim() || loading}
            className="px-4 py-2 text-sm font-medium bg-violet-500 hover:bg-violet-600 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition-all shadow-lg shadow-violet-500/25"
          >
            {loading ? '创建中...' : '创建策略'}
          </button>
        </div>
      </div>
    </div>
  );
}

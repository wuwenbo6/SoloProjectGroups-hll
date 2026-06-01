import { useEffect } from 'react';
import { Calendar, Play, Pause, Trash2, Plus, RefreshCw, Clock, HardDrive, CheckCircle, XCircle } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatDate } from '../utils/format';

export default function SnapshotSchedule() {
  const {
    schedules,
    loadingSchedules,
    fetchSchedules,
    setScheduleDialogOpen,
    toggleSchedule,
    deleteSchedule,
    showConfirm,
    reloadSchedules,
  } = useRbdStore();

  useEffect(() => {
    fetchSchedules();
  }, []);

  const handleDelete = (id: string, name: string) => {
    showConfirm(
      '删除定时策略',
      `确定要删除定时策略 "${name}" 吗？`,
      () => deleteSchedule(id),
      true
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">定时快照策略</h1>
          <p className="text-slate-500 text-sm mt-1">管理自动快照计划和保留策略</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={reloadSchedules}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            重载
          </button>
          <button
            onClick={() => setScheduleDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-violet-500/25"
          >
            <Plus className="w-4 h-4" />
            创建策略
          </button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        {loadingSchedules ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-slate-700" />
            <p className="text-slate-500 text-lg">暂无定时快照策略</p>
            <p className="text-slate-600 text-sm mt-1">点击上方按钮创建第一个策略</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {schedules.map((schedule) => (
              <div key={schedule.id} className="p-5 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-white font-semibold">{schedule.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          schedule.enabled
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {schedule.enabled ? (
                          <><CheckCircle className="w-3 h-3" /> 已启用</>
                        ) : (
                          <><XCircle className="w-3 h-3" /> 已禁用</>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400 mb-3">
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-4 h-4" />
                        {schedule.pool}/{schedule.imageName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        <code className="px-2 py-0.5 bg-slate-800 rounded font-mono text-xs">
                          {schedule.cronExpression}
                        </code>
                      </span>
                      <span className="text-slate-500">
                        前缀: {schedule.prefix}
                      </span>
                      <span className="text-slate-500">
                        保留: {schedule.retentionCount || '无限'} 个
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-slate-500">
                      {schedule.lastRun && (
                        <span>上次执行: {formatDate(schedule.lastRun)}</span>
                      )}
                      {schedule.lastSnapshotName && (
                        <span>上次快照: {schedule.lastSnapshotName}</span>
                      )}
                      <span>创建时间: {formatDate(schedule.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSchedule(schedule.id, !schedule.enabled)}
                      className={`p-2 rounded-lg transition-colors ${
                        schedule.enabled
                          ? 'text-amber-400 hover:bg-amber-500/10'
                          : 'text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title={schedule.enabled ? '暂停' : '启用'}
                    >
                      {schedule.enabled ? (
                        <Pause className="w-5 h-5" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id, schedule.name)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

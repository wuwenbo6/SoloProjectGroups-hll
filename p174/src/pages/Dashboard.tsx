import { useEffect } from 'react';
import { HardDrive, Camera, Database, Activity as ActivityIcon, Clock, ArrowUpRight, Calendar } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatBytes, formatDate } from '../utils/format';
import { Link } from 'react-router-dom';

const activityTypeLabels: Record<string, string> = {
  create: '创建',
  rollback: '回滚',
  delete: '删除',
  clone: '克隆',
  protect: '保护',
  unprotect: '解除保护',
  'export-diff': '导出差异',
  schedule: '定时策略',
};

const activityTypeColors: Record<string, string> = {
  create: 'bg-cyan-500/10 text-cyan-400',
  rollback: 'bg-amber-500/10 text-amber-400',
  delete: 'bg-red-500/10 text-red-400',
  clone: 'bg-emerald-500/10 text-emerald-400',
  protect: 'bg-teal-500/10 text-teal-400',
  unprotect: 'bg-slate-500/10 text-slate-400',
  'export-diff': 'bg-amber-500/10 text-amber-400',
  schedule: 'bg-violet-500/10 text-violet-400',
};

export default function Dashboard() {
  const { images, poolStats, activities, schedules, fetchImages, fetchPoolStats, fetchSchedules } = useRbdStore();

  useEffect(() => {
    fetchImages();
    fetchPoolStats();
    fetchSchedules();
  }, []);

  const totalSnapshots = images.reduce((sum, img) => sum + img.snapshotCount, 0);
  const totalSize = images.reduce((sum, img) => sum + img.size, 0);

  const statCards = [
    {
      label: '镜像总数',
      value: images.length.toString(),
      icon: HardDrive,
      color: 'from-cyan-500 to-blue-600',
      iconBg: 'bg-cyan-500/10',
      iconColor: 'text-cyan-400',
    },
    {
      label: '快照总数',
      value: totalSnapshots.toString(),
      icon: Camera,
      color: 'from-amber-500 to-orange-600',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-400',
    },
    {
      label: '定时策略',
      value: schedules.length.toString(),
      icon: Calendar,
      color: 'from-violet-500 to-purple-600',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-400',
    },
    {
      label: '已用容量',
      value: formatBytes(totalSize),
      icon: Database,
      color: 'from-emerald-500 to-teal-600',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">仪表盘</h1>
          <p className="text-slate-500 text-sm mt-1">Ceph RBD 存储概览</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/images"
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-cyan-500/25"
          >
            管理镜像
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => (
          <div
            key={index}
            className="bg-slate-900 rounded-xl border border-slate-800 p-5 hover:border-slate-700 transition-all duration-300 hover:shadow-lg"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div className={`w-12 h-1 rounded-full bg-gradient-to-r ${card.color}`} />
            </div>
            <p className="text-3xl font-bold text-white mb-1">{card.value}</p>
            <p className="text-sm text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {poolStats && poolStats.totalBytes > 0 && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">存储池容量</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">使用情况</span>
                <span className="text-sm text-white font-medium">
                  {formatBytes(poolStats.usedBytes)} / {formatBytes(poolStats.totalBytes)}
                </span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full transition-all duration-500"
                  style={{ width: `${(poolStats.usedBytes / poolStats.totalBytes) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">最近镜像</h3>
          <div className="space-y-3">
            {images.slice(0, 5).map((image) => (
              <div
                key={`${image.pool}/${image.name}`}
                className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center">
                    <HardDrive className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <p className="font-mono text-sm text-white">{image.name}</p>
                    <p className="text-xs text-slate-500">{image.pool}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-300">{formatBytes(image.size)}</p>
                  <p className="text-xs text-slate-500">{image.snapshotCount} 个快照</p>
                </div>
              </div>
            ))}
            {images.length === 0 && (
              <p className="text-center py-8 text-slate-500 text-sm">暂无镜像</p>
            )}
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">最近活动</h3>
          <div className="space-y-3">
            {activities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex items-start gap-3">
                <div
                  className={`px-2 py-0.5 rounded text-xs font-medium ${activityTypeColors[activity.type] || 'bg-slate-500/10 text-slate-400'}`}
                >
                  {activityTypeLabels[activity.type] || activity.type}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">{activity.message}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(activity.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            {activities.length === 0 && (
              <p className="text-center py-8 text-slate-500 text-sm">暂无活动记录</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

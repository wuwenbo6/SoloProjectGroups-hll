import { Send, CheckCircle, XCircle, TrendingUp, Download, FileJson, FileSpreadsheet } from 'lucide-react';
import { useProducerStore } from '../store/useProducerStore';

export function StatsCard() {
  const { stats, exportStats } = useProducerStore();

  const statItems = [
    {
      label: '总发送数',
      value: stats?.totalSent ?? 0,
      icon: Send,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
    },
    {
      label: '成功接受',
      value: stats?.accepted ?? 0,
      icon: CheckCircle,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
    },
    {
      label: '重复丢弃',
      value: stats?.discarded ?? 0,
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
    },
    {
      label: '去重率',
      value: `${(stats?.deduplicationRate ?? 0).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/20',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((item, index) => (
          <div
            key={index}
            className="glass-card rounded-xl p-4 transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">{item.label}</p>
                <p className={`text-3xl font-bold ${item.color} animate-count-up`}>
                  {item.value}
                </p>
              </div>
              <div className={`p-3 ${item.bgColor} rounded-xl`}>
                <item.icon className={`w-6 h-6 ${item.color}`} />
              </div>
            </div>
            
            {item.label === '去重率' && stats && stats.totalSent > 0 && (
              <div className="mt-3">
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(stats.deduplicationRate, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium text-gray-300">导出去重统计</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => exportStats('json')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/30 transition-all text-sm font-medium"
            >
              <FileJson className="w-4 h-4" />
              导出 JSON
            </button>
            <button
              onClick={() => exportStats('csv')}
              className="flex items-center gap-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-all text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" />
              导出 CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

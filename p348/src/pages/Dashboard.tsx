import { useQuery } from '@tanstack/react-query';
import { PlugZap, Zap, DollarSign, Activity, Inbox } from 'lucide-react';
import { api } from '@/services/api';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/StatusBadge';
import { formatEnergy, formatCurrency, formatDateTime } from '@/lib/format';

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: api.getDashboardStats,
    refetchInterval: 5000
  });

  const { data: chargePoints, isLoading: cpLoading } = useQuery({
    queryKey: ['chargepoints'],
    queryFn: api.getChargePoints,
    refetchInterval: 10000
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', { limit: 5 }],
    queryFn: () => api.getTransactions({ limit: 5 }),
    refetchInterval: 10000
  });

  const { data: queueStats } = useQuery({
    queryKey: ['queue-stats'],
    queryFn: api.getQueueStats,
    refetchInterval: 5000
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">仪表盘</h1>
        <p className="mt-2 text-gray-600">实时监控充电桩网络运行状态</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="在线充电桩"
          value={statsLoading ? '...' : `${stats?.onlineChargePoints ?? 0}/${stats?.totalChargePoints ?? 0}`}
          icon={PlugZap}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          trend={{ value: 12, positive: true }}
        />
        <StatCard
          title="当前充电中"
          value={statsLoading ? '...' : stats?.activeTransactions ?? 0}
          icon={Zap}
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
        />
        <StatCard
          title="今日充电量"
          value={statsLoading ? '...' : formatEnergy(stats?.todayEnergy ?? 0)}
          icon={Activity}
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          trend={{ value: 8, positive: true }}
        />
        <StatCard
          title="今日收入"
          value={statsLoading ? '...' : formatCurrency(stats?.todayRevenue ?? 0)}
          icon={DollarSign}
          gradient="bg-gradient-to-br from-cyan-500 to-cyan-600"
          trend={{ value: 15, positive: true }}
        />
        <StatCard
          title="待发送消息"
          value={queueStats?.pendingCount ?? 0}
          icon={Inbox}
          gradient="bg-gradient-to-br from-violet-500 to-violet-600"
        />
      </div>

      {queueStats && queueStats.pendingCount > 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-violet-200">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900">离线消息队列</h2>
            <span className="ml-auto text-sm text-violet-600">{queueStats.pendingCount} 条待发送</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">充电桩上线后将自动重传这些消息</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(queueStats.byChargePoint).map(([cpId, count]) => (
              <div key={cpId} className="flex items-center justify-between rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{cpId}</p>
                  <p className="text-xs text-gray-500">{count} 条待发送</p>
                </div>
                <StatusBadge status="offline" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">充电桩状态</h2>
            <span className="text-sm text-gray-500">共 {chargePoints?.length ?? 0} 台</span>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cpLoading ? (
              <div className="col-span-2 text-center py-8 text-gray-500">加载中...</div>
            ) : chargePoints?.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-gray-500">暂无充电桩数据</div>
            ) : (
              chargePoints?.map((cp) => (
                <div
                  key={cp.id}
                  className="rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{cp.id}</p>
                      <p className="text-sm text-gray-500">{cp.chargePointVendor} {cp.chargePointModel}</p>
                    </div>
                    <StatusBadge status={cp.isOnline ? cp.status : 'offline'} />
                  </div>
                  {cp.lastHeartbeat && (
                    <p className="mt-2 text-xs text-gray-400">
                      最后心跳: {formatDateTime(cp.lastHeartbeat)}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">最近充电会话</h2>
            <span className="text-sm text-gray-500">最近 5 条</span>
          </div>
          <div className="mt-6 space-y-4">
            {txLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : transactions?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无充电会话</div>
            ) : (
              transactions?.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-gray-100 p-4 transition-all duration-200 hover:border-gray-200"
                >
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-gray-100 p-2">
                      <Zap className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">#{tx.id} · {tx.chargePointId}</p>
                      <p className="text-sm text-gray-500">{formatDateTime(tx.startTime)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {tx.energyConsumed !== undefined && (
                      <p className="font-medium text-gray-900">{formatEnergy(tx.energyConsumed)}</p>
                    )}
                    <StatusBadge status={tx.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

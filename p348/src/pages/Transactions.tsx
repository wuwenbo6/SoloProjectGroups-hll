import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronRight, Filter, Search, Download, Square, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatEnergy, formatDuration } from '@/lib/format';

export default function Transactions() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  const { data: chargePoints } = useQuery({
    queryKey: ['chargepoints'],
    queryFn: api.getChargePoints
  });

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transactions', filter],
    queryFn: () => api.getTransactions({ status: filter === 'all' ? undefined : filter })
  });

  const remoteStopMutation = useMutation({
    mutationFn: ({ chargePointId, transactionId }: { chargePointId: string; transactionId: number }) =>
      api.remoteStopTransaction(chargePointId, transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['chargepoints'] });
    }
  });

  const cpOnlineMap = new Map(chargePoints?.map(cp => [cp.id, cp.isOnline]) || []);

  const handleRemoteStop = async (chargePointId: string, transactionId: number) => {
    if (!confirm(`确认停止会话 #${transactionId}？`)) return;

    setStoppingId(transactionId);
    try {
      await remoteStopMutation.mutateAsync({ chargePointId, transactionId });
      alert('远程停止命令已发送');
    } catch (e: any) {
      alert('发送失败: ' + e.message);
    } finally {
      setStoppingId(null);
    }
  };

  const filteredTransactions = transactions?.filter(tx =>
    tx.chargePointId.toLowerCase().includes(search.toLowerCase()) ||
    tx.idTag.toLowerCase().includes(search.toLowerCase()) ||
    String(tx.id).includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">充电会话</h1>
          <p className="mt-2 text-gray-600">查看所有充电会话记录</p>
        </div>
        <button
          onClick={() => api.exportTransactionsCSV()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Download className="h-4 w-4" />
          导出 CSV
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索充电桩ID、用户标签、会话ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="all">全部状态</option>
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="stopped">已停止</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">加载中...</div>
        ) : filteredTransactions?.length === 0 ? (
          <div className="text-center py-16 text-gray-500">暂无充电会话记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    会话ID
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    充电桩
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    用户标签
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    开始时间
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    充电量
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    时长
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    状态
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredTransactions?.map((tx) => (
                  <tr key={tx.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-mono text-sm font-medium text-gray-900">#{tx.id}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">{tx.chargePointId}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm text-gray-600">{tx.idTag}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm text-gray-600">{formatDateTime(tx.startTime)}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm font-medium text-gray-900">
                        {tx.energyConsumed !== undefined ? formatEnergy(tx.energyConsumed) : '-'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {tx.duration !== undefined ? formatDuration(tx.duration) : '-'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {tx.status === 'active' && cpOnlineMap.get(tx.chargePointId) && (
                          <button
                            onClick={() => handleRemoteStop(tx.chargePointId, tx.id!)}
                            disabled={stoppingId === tx.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            {stoppingId === tx.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Square className="h-3.5 w-3.5" />
                            )}
                            停止
                          </button>
                        )}
                        <Link
                          to={`/transactions/${tx.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          详情
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

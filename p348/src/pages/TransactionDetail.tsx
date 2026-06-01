import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Clock, Zap, User, Plug, DollarSign, Calendar } from 'lucide-react';
import { api } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime, formatEnergy, formatDuration, formatCurrency } from '@/lib/format';

export default function TransactionDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: transaction, isLoading } = useQuery({
    queryKey: ['transaction', id],
    queryFn: () => api.getTransaction(Number(id)),
    enabled: !!id
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">会话不存在</p>
        <Link to="/transactions" className="mt-4 inline-block text-blue-600 hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/transactions"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        返回充电会话列表
      </Link>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              充电会话 #{transaction.id}
            </h1>
            <p className="mt-1 text-gray-500">
              {transaction.chargePointId} · 连接器 {transaction.connectorId}
            </p>
          </div>
          <StatusBadge status={transaction.status} className="text-sm" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <User className="h-4 w-4" />
              <span className="text-sm">用户标签</span>
            </div>
            <p className="mt-2 font-mono font-medium text-gray-900">{transaction.idTag}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Plug className="h-4 w-4" />
              <span className="text-sm">充电桩</span>
            </div>
            <p className="mt-2 font-medium text-gray-900">{transaction.chargePointId}</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Zap className="h-4 w-4" />
              <span className="text-sm">充电量</span>
            </div>
            <p className="mt-2 font-medium text-gray-900">
              {transaction.energyConsumed !== undefined ? formatEnergy(transaction.energyConsumed) : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-500">
              <Clock className="h-4 w-4" />
              <span className="text-sm">充电时长</span>
            </div>
            <p className="mt-2 font-medium text-gray-900">
              {transaction.duration !== undefined ? formatDuration(transaction.duration) : '-'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">充电时间线</h3>
            <div className="mt-4 space-y-4">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                  <div className="h-full w-px bg-gray-200"></div>
                </div>
                <div className="pb-6">
                  <p className="text-sm font-medium text-gray-900">开始充电</p>
                  <p className="text-sm text-gray-500">{formatDateTime(transaction.startTime)}</p>
                  <p className="mt-1 text-xs text-gray-400">起始读数: {transaction.startMeterValue} Wh</p>
                </div>
              </div>
              {transaction.stopTime && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-3 w-3 rounded-full bg-gray-400"></div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">结束充电</p>
                    <p className="text-sm text-gray-500">{formatDateTime(transaction.stopTime)}</p>
                    {transaction.stopMeterValue !== undefined && (
                      <p className="mt-1 text-xs text-gray-400">结束读数: {transaction.stopMeterValue} Wh</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {transaction.billing && (
            <div className="rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-semibold text-gray-900">费用明细</h3>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">充电电量</span>
                  <span className="font-medium text-gray-900">{formatEnergy(transaction.billing.energyConsumed)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">充电时长</span>
                  <span className="font-medium text-gray-900">{transaction.billing.durationMinutes} 分钟</span>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">电价</span>
                    <span className="text-gray-900">¥{transaction.billing.energyPrice.toFixed(2)} / kWh</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">电费</span>
                    <span className="text-gray-900">{formatCurrency(transaction.billing.energyCost)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">服务费</span>
                  <span className="text-gray-900">¥{transaction.billing.servicePrice.toFixed(2)} / kWh</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">服务费小计</span>
                  <span className="text-gray-900">{formatCurrency(transaction.billing.serviceCost)}</span>
                </div>
                <div className="border-t border-gray-100 pt-3">
                  <div className="flex justify-between">
                    <span className="font-semibold text-gray-900">总费用</span>
                    <span className="text-xl font-bold text-emerald-600">{formatCurrency(transaction.billing.totalCost)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

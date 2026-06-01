import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Receipt, Zap, Clock, DollarSign, TrendingUp } from 'lucide-react';
import { api } from '@/services/api';
import { formatEnergy, formatCurrency, formatDateTime, formatDuration } from '@/lib/format';

export default function Billing() {
  const { data: billingDetails, isLoading } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.getBillingDetails()
  });

  const { data: pricingRules } = useQuery({
    queryKey: ['pricing'],
    queryFn: api.getPricingRules
  });

  const chartData = billingDetails?.slice(0, 10).map(b => ({
    id: `#${b.transactionId}`,
    电费: b.energyCost,
    服务费: b.serviceCost,
    date: b.transaction?.startTime ? new Date(b.transaction.startTime).toLocaleDateString() : ''
  })).reverse() || [];

  const totalRevenue = billingDetails?.reduce((sum, b) => sum + b.totalCost, 0) || 0;
  const totalEnergy = billingDetails?.reduce((sum, b) => sum + b.energyConsumed, 0) || 0;
  const avgCostPerKwh = totalEnergy > 0 ? (totalRevenue / (totalEnergy / 1000)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">费用明细</h1>
        <p className="mt-2 text-gray-600">查看所有充电订单的费用结算记录</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-3">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">累计收入</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-sm text-emerald-600">
            <TrendingUp className="h-4 w-4" />
            <span>共 {billingDetails?.length ?? 0} 笔订单</span>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">总充电量</p>
              <p className="text-2xl font-bold text-gray-900">{formatEnergy(totalEnergy)}</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 p-3">
              <Clock className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">平均单价</p>
              <p className="text-2xl font-bold text-gray-900">¥{avgCostPerKwh.toFixed(2)}/kWh</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900">费用构成趋势</h2>
          <p className="text-sm text-gray-500">最近 10 笔订单电费与服务费对比</p>
          <div className="mt-6 h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="id" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="电费" stackId="a" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#3b82f6" />
                    ))}
                  </Bar>
                  <Bar dataKey="服务费" stackId="a" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill="#60a5fa" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                暂无数据
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">电价规则</h2>
          <div className="mt-6 space-y-4">
            {pricingRules?.map((rule) => (
              <div
                key={rule.id}
                className={`rounded-xl border p-4 transition-all ${
                  rule.isActive
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-gray-200 bg-gray-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{rule.name}</span>
                  <span className={`text-xs font-medium ${
                    rule.isActive ? 'text-emerald-600' : 'text-gray-500'
                  }`}>
                    {rule.isActive ? '启用中' : '已停用'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-600">
                  {rule.startTime} - {rule.endTime}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">电价</span>
                    <p className="font-semibold text-gray-900">¥{rule.energyRate.toFixed(2)}/kWh</p>
                  </div>
                  <div>
                    <span className="text-gray-500">服务费</span>
                    <p className="font-semibold text-gray-900">¥{rule.serviceRate.toFixed(2)}/kWh</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">费用明细列表</h2>
        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : billingDetails?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">暂无费用记录</div>
          ) : (
            billingDetails?.map((billing) => (
              <div
                key={billing.id}
                className="flex flex-col gap-4 rounded-xl border border-gray-100 p-5 transition-all hover:border-gray-200 hover:bg-gray-50/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200 p-3">
                    <Receipt className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      订单 #{billing.transactionId} · {billing.transaction?.chargePointId}
                    </p>
                    <p className="text-sm text-gray-500">
                      {billing.transaction?.startTime ? formatDateTime(billing.transaction.startTime) : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {formatEnergy(billing.energyConsumed)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(billing.durationMinutes * 60)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="hidden h-16 w-40 sm:block">
                    <div className="flex h-full items-end gap-1">
                      <div
                        className="w-1/2 rounded-t bg-blue-500"
                        style={{ height: `${(billing.energyCost / billing.totalCost) * 100}%` }}
                        title={`电费: ${formatCurrency(billing.energyCost)}`}
                      ></div>
                      <div
                        className="w-1/2 rounded-t bg-blue-300"
                        style={{ height: `${(billing.serviceCost / billing.totalCost) * 100}%` }}
                        title={`服务费: ${formatCurrency(billing.serviceCost)}`}
                      ></div>
                    </div>
                    <div className="mt-1 flex gap-1 text-[10px] text-gray-400">
                      <span className="w-1/2 text-center">电费</span>
                      <span className="w-1/2 text-center">服务费</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(billing.totalCost)}</p>
                    <p className="text-xs text-gray-400">
                      电费 {formatCurrency(billing.energyCost)} + 服务费 {formatCurrency(billing.serviceCost)}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

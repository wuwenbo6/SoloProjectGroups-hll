import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlugZap, Cpu, HardDrive, Clock, Wifi, WifiOff, Play, Loader2 } from 'lucide-react';
import { api } from '@/services/api';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDateTime } from '@/lib/format';

export default function ChargePoints() {
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<string | null>(null);

  const { data: chargePoints, isLoading } = useQuery({
    queryKey: ['chargepoints'],
    queryFn: api.getChargePoints,
    refetchInterval: 10000
  });

  const remoteStartMutation = useMutation({
    mutationFn: ({ chargePointId, idTag }: { chargePointId: string; idTag: string }) =>
      api.remoteStartTransaction(chargePointId, 1, idTag),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chargepoints'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  });

  const handleRemoteStart = async (chargePointId: string) => {
    const idTag = prompt('请输入用户标签 (RFID):', `RFID-REMOTE-${Date.now()}`);
    if (!idTag) return;

    setStarting(chargePointId);
    try {
      await remoteStartMutation.mutateAsync({ chargePointId, idTag });
      alert('远程启动命令已发送');
    } catch (e: any) {
      alert('发送失败: ' + e.message);
    } finally {
      setStarting(null);
    }
  };

  const stats = {
    total: chargePoints?.length ?? 0,
    online: chargePoints?.filter(cp => cp.isOnline).length ?? 0,
    charging: chargePoints?.filter(cp => cp.isOnline && cp.status === 'charging').length ?? 0,
    offline: chargePoints?.filter(cp => !cp.isOnline || cp.status === 'offline').length ?? 0
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">充电桩管理</h1>
        <p className="mt-2 text-gray-600">管理和监控所有接入的充电桩设备</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-2 text-gray-500">
            <PlugZap className="h-4 w-4" />
            <span className="text-sm">总设备</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-2 text-emerald-500">
            <Wifi className="h-4 w-4" />
            <span className="text-sm">在线</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600">{stats.online}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-2 text-orange-500">
            <PlugZap className="h-4 w-4" />
            <span className="text-sm">充电中</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-orange-600">{stats.charging}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
          <div className="flex items-center gap-2 text-gray-400">
            <WifiOff className="h-4 w-4" />
            <span className="text-sm">离线</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-gray-400">{stats.offline}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">设备列表</h2>
        <div className="mt-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-16 text-gray-500">加载中...</div>
          ) : chargePoints?.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <PlugZap className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4">暂无充电桩数据</p>
              <p className="mt-1 text-sm">充电桩连接后会自动注册到系统</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {chargePoints?.map((cp) => (
                <div
                  key={cp.id}
                  className={`rounded-xl border p-5 transition-all duration-300 hover:shadow-md ${
                    cp.isOnline
                      ? 'border-gray-200 bg-white'
                      : 'border-gray-100 bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-xl p-3 transition-all ${
                        cp.isOnline && cp.status === 'charging'
                          ? 'bg-gradient-to-br from-orange-500 to-orange-600'
                          : cp.isOnline
                          ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                          : 'bg-gray-200'
                      }`}>
                        <PlugZap className={`h-6 w-6 ${
                          cp.isOnline ? 'text-white' : 'text-gray-400'
                        }`} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{cp.id}</p>
                        <p className="text-sm text-gray-500">
                          {cp.chargePointVendor} {cp.chargePointModel}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={cp.isOnline ? cp.status : 'offline'} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Cpu className="h-3.5 w-3.5" />
                        序列号
                      </div>
                      <p className="mt-1 font-mono text-sm text-gray-600">
                        {cp.chargePointSerialNumber || '-'}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <HardDrive className="h-3.5 w-3.5" />
                        固件版本
                      </div>
                      <p className="mt-1 font-mono text-sm text-gray-600">
                        {cp.firmwareVersion || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="h-3.5 w-3.5" />
                          最后心跳
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {cp.lastHeartbeat ? formatDateTime(cp.lastHeartbeat) : '未连接'}
                        </p>
                      </div>
                      {cp.isOnline && cp.status === 'available' && (
                        <button
                          onClick={() => handleRemoteStart(cp.id)}
                          disabled={starting === cp.id}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {starting === cp.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          远程启动
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

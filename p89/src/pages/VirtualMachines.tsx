import React, { useEffect, useState } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  Plus,
  Camera,
  MoveRight,
  MoreHorizontal,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { vmApi, nodeApi } from '@/services/api';
import { useStore } from '@/store/useStore';
import { formatBytes, formatUptime } from '@/utils/format';
import type { VirtualMachine } from '../../shared/types';

export const VirtualMachines: React.FC = () => {
  const { vms, setVMs, nodes, setNodes } = useStore();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVM, setSelectedVM] = useState<VirtualMachine | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vmsRes, nodesRes] = await Promise.all([
          vmApi.getVMs(),
          nodeApi.getNodes(),
        ]);
        if (vmsRes.success) setVMs(vmsRes.data);
        if (nodesRes.success) setNodes(nodesRes.data);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [setVMs, setNodes]);

  const handleAction = async (
    vm: VirtualMachine,
    action: 'start' | 'stop' | 'restart'
  ) => {
    setActionLoading(`${vm.vmid}-${action}`);
    try {
      let result;
      switch (action) {
        case 'start':
          result = await vmApi.startVM(vm.node, vm.vmid);
          break;
        case 'stop':
          result = await vmApi.stopVM(vm.node, vm.vmid);
          break;
        case 'restart':
          result = await vmApi.restartVM(vm.node, vm.vmid);
          break;
      }
      if (result?.success) {
        setTimeout(async () => {
          const vmsRes = await vmApi.getVMs();
          if (vmsRes.success) setVMs(vmsRes.data);
        }, 1000);
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredVMs = vms.filter(
    (vm) =>
      vm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vm.vmid.toString().includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">虚拟机管理</h1>
          <p className="text-slate-500 mt-1">共 {vms.length} 台虚拟机</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors">
          <Plus className="w-4 h-4" />
          创建虚拟机
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>虚拟机列表</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索虚拟机..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    节点
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    CPU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    内存
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    运行时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVMs.map((vm) => (
                  <tr
                    key={vm.vmid}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {vm.vmid}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {vm.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {vm.node}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={vm.status} size="sm" />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {(vm.cpu * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {formatBytes(vm.memory)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {vm.status === 'running' ? formatUptime(vm.uptime) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {vm.status !== 'running' && (
                          <button
                            onClick={() => handleAction(vm, 'start')}
                            disabled={actionLoading === `${vm.vmid}-start`}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="启动"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {vm.status === 'running' && (
                          <>
                            <button
                              onClick={() => handleAction(vm, 'stop')}
                              disabled={actionLoading === `${vm.vmid}-stop`}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="停止"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleAction(vm, 'restart')}
                              disabled={actionLoading === `${vm.vmid}-restart`}
                              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
                              title="重启"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          className="p-2 text-cyan-600 hover:bg-cyan-50 rounded-lg transition-colors"
                          title="快照"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="迁移"
                        >
                          <MoveRight className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

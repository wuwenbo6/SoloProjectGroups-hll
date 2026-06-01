import React, { useEffect, useState } from 'react';
import { Cpu, HardDrive, Network, Server, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { nodeApi, vmApi } from '@/services/api';
import { useStore } from '@/store/useStore';
import { formatBytes, formatPercent, formatUptime } from '@/utils/format';

export const Cluster: React.FC = () => {
  const { nodes, setNodes, vms, setVMs } = useStore();
  const [loading, setLoading] = useState(true);
  const [nodeDetails, setNodeDetails] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [nodesRes, vmsRes] = await Promise.all([
          nodeApi.getNodes(),
          vmApi.getVMs(),
        ]);
        if (nodesRes.success) setNodes(nodesRes.data);
        if (vmsRes.success) setVMs(vmsRes.data);
      } catch (error) {
        console.error('Failed to fetch cluster data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [setNodes, setVMs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">集群管理</h1>
        <p className="text-slate-500 mt-1">多节点集群状态监控</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {nodes.map((node) => {
          const nodeVMs = vms.filter((vm) => vm.node === node.node);
          const runningVMs = nodeVMs.filter((vm) => vm.status === 'running');

          return (
            <Card key={node.node} hover>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        node.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <CardTitle>{node.node}</CardTitle>
                  </div>
                  <StatusBadge status={node.status} size="sm" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-cyan-500" />
                    <div>
                      <p className="text-xs text-slate-500">CPU</p>
                      <p className="font-semibold text-slate-800">
                        {formatPercent(node.cpu)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-500" />
                    <div>
                      <p className="text-xs text-slate-500">核心数</p>
                      <p className="font-semibold text-slate-800">
                        {node.maxcpu} 核
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">内存使用</span>
                    <span className="text-slate-800">
                      {formatBytes(node.mem)} / {formatBytes(node.maxmem)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(node.mem / node.maxmem) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">磁盘使用</span>
                    <span className="text-slate-800">
                      {formatBytes(node.disk)} / {formatBytes(node.maxdisk)}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{
                        width: `${(node.disk / node.maxdisk) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-purple-500" />
                      <span className="text-sm text-slate-500">虚拟机</span>
                    </div>
                    <span className="font-semibold text-slate-800">
                      {runningVMs.length} 运行 / {nodeVMs.length} 总计
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Network className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-slate-500">运行时间</span>
                    </div>
                    <span className="font-semibold text-slate-800">
                      {formatUptime(node.uptime)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>虚拟机分布</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node) => {
              const nodeVMs = vms.filter((vm) => vm.node === node.node);
              return (
                <div key={node.node} className="p-4 bg-slate-50 rounded-lg">
                  <h4 className="font-medium text-slate-800 mb-2">{node.node}</h4>
                  <div className="space-y-1">
                    {nodeVMs.length === 0 ? (
                      <p className="text-sm text-slate-500">暂无虚拟机</p>
                    ) : (
                      nodeVMs.map((vm) => (
                        <div
                          key={vm.vmid}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-slate-600">{vm.name}</span>
                          <StatusBadge status={vm.status} size="sm" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Cpu, HardDrive, Network, Server, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { nodeApi, vmApi } from '@/services/api';
import { useStore } from '@/store/useStore';
import { formatBytes, formatPercent, formatUptime } from '@/utils/format';
import type { ClusterNode, VirtualMachine, ResourceUsage } from '../../shared/types';

const generateChartData = (): ResourceUsage[] => {
  const data: ResourceUsage[] = [];
  const now = Date.now();
  for (let i = 23; i >= 0; i--) {
    data.push({
      timestamp: now - i * 3600000,
      cpu: 0.2 + Math.random() * 0.4,
      memory: 0.5 + Math.random() * 0.3,
      disk: 0.3 + Math.random() * 0.2,
      networkIn: Math.random() * 100,
      networkOut: Math.random() * 80,
    });
  }
  return data;
};

export const Dashboard: React.FC = () => {
  const { nodes, vms, setNodes, setVMs } = useStore();
  const [chartData, setChartData] = useState<ResourceUsage[]>(generateChartData());
  const [loading, setLoading] = useState(true);

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
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [setNodes, setVMs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData((prev) => {
        const newData = [...prev.slice(1)];
        newData.push({
          timestamp: Date.now(),
          cpu: 0.2 + Math.random() * 0.4,
          memory: 0.5 + Math.random() * 0.3,
          disk: 0.3 + Math.random() * 0.2,
          networkIn: Math.random() * 100,
          networkOut: Math.random() * 80,
        });
        return newData;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalCPU = nodes.reduce((sum, n) => sum + (n.maxcpu || 0), 0);
  const totalMemory = nodes.reduce((sum, n) => sum + (n.maxmem || 0), 0);
  const totalDisk = nodes.reduce((sum, n) => sum + (n.maxdisk || 0), 0);
  const usedMemory = nodes.reduce((sum, n) => sum + (n.mem || 0), 0);
  const usedDisk = nodes.reduce((sum, n) => sum + (n.disk || 0), 0);

  const runningVMs = vms.filter((vm) => vm.status === 'running').length;
  const stoppedVMs = vms.filter((vm) => vm.status === 'stopped').length;
  const onlineNodes = nodes.filter((n) => n.status === 'online').length;

  const formatChartTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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
        <h1 className="text-2xl font-bold text-slate-800">仪表盘</h1>
        <p className="text-slate-500 mt-1">集群资源概览</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card hover>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-cyan-50 rounded-lg">
              <Server className="w-6 h-6 text-cyan-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">节点数量</p>
              <p className="text-2xl font-bold text-slate-800">
                {onlineNodes}/{nodes.length}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card hover>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-green-50 rounded-lg">
              <Activity className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">虚拟机</p>
              <p className="text-2xl font-bold text-slate-800">
                {runningVMs} 运行 / {vms.length} 总计
              </p>
            </div>
          </CardContent>
        </Card>

        <Card hover>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-lg">
              <Cpu className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">CPU 核心</p>
              <p className="text-2xl font-bold text-slate-800">{totalCPU}</p>
            </div>
          </CardContent>
        </Card>

        <Card hover>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-lg">
              <HardDrive className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">总内存</p>
              <p className="text-2xl font-bold text-slate-800">
                {formatBytes(totalMemory)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>CPU 使用率</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatChartTime}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <Tooltip
                  formatter={(value: number) => [formatPercent(value), 'CPU']}
                  labelFormatter={formatChartTime}
                />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#06b6d4"
                  fill="url(#cpuGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>内存使用率</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="memGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatChartTime}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <Tooltip
                  formatter={(value: number) => [formatPercent(value), '内存']}
                  labelFormatter={formatChartTime}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  stroke="#22c55e"
                  fill="url(#memGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>网络流量</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatChartTime}
                  tick={{ fontSize: 12 }}
                  stroke="#94a3b8"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(1)} MB/s`,
                    name === 'networkIn' ? '入站' : '出站',
                  ]}
                  labelFormatter={formatChartTime}
                />
                <Line
                  type="monotone"
                  dataKey="networkIn"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  name="networkIn"
                />
                <Line
                  type="monotone"
                  dataKey="networkOut"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  name="networkOut"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>节点状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {nodes.map((node) => (
                <div
                  key={node.node}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        node.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <div>
                      <p className="font-medium text-slate-800">{node.node}</p>
                      <p className="text-sm text-slate-500">
                        运行时间: {formatUptime(node.uptime)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={node.status} size="sm" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

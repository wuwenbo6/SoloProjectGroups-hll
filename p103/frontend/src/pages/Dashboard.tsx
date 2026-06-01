import React, { useState, useEffect } from 'react';
import {
  HardDrive,
  Play,
  Activity,
  AlertTriangle,
  Clock,
  Server
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { statsApi } from '../services/api';
import { DashboardStats } from '../types';

const StatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  trend?: string;
}> = ({ title, value, icon: Icon, color, trend }) => (
  <div className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-dark-600 transition-all duration-300">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-dark-400 text-sm mb-1">{title}</p>
        <p className="text-3xl font-bold text-white">{value.toLocaleString()}</p>
        {trend && <p className="text-xs text-status-success mt-1">{trend}</p>}
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const data = await statsApi.getDashboard();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartData = [
    { name: '00:00', packets: 120, crashes: 2 },
    { name: '04:00', packets: 80, crashes: 0 },
    { name: '08:00', packets: 200, crashes: 1 },
    { name: '12:00', packets: 350, crashes: 3 },
    { name: '16:00', packets: 280, crashes: 1 },
    { name: '20:00', packets: 180, crashes: 2 },
  ];

  const strategyData = [
    { name: '功能码异常', count: 45 },
    { name: '地址越界', count: 32 },
    { name: '数据畸形', count: 28 },
    { name: '长度异常', count: 15 },
    { name: '随机报文', count: 22 },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">仪表板</h1>
          <p className="text-dark-400 mt-1">Modbus模糊测试概览</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <Clock className="w-4 h-4" />
          <span>最后更新: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <StatCard
          title="目标设备"
          value={stats?.totalTargets || 0}
          icon={Server}
          color="bg-primary-600"
        />
        <StatCard
          title="测试任务"
          value={stats?.totalTasks || 0}
          icon={HardDrive}
          color="bg-dark-600"
        />
        <StatCard
          title="运行中任务"
          value={stats?.runningTasks || 0}
          icon={Play}
          color="bg-status-success/20 text-status-success"
          trend="实时监控中"
        />
        <StatCard
          title="发送报文"
          value={stats?.totalPackets || 0}
          icon={Activity}
          color="bg-status-warning/20"
        />
        <StatCard
          title="检测到崩溃"
          value={stats?.totalCrashes || 0}
          icon={AlertTriangle}
          color="bg-status-error/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h3 className="text-lg font-semibold text-white mb-4">报文发送趋势</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
              />
              <Line
                type="monotone"
                dataKey="packets"
                stroke="#1890ff"
                strokeWidth={2}
                dot={{ fill: '#1890ff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h3 className="text-lg font-semibold text-white mb-4">变异策略分布</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={strategyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="name" stroke="#666" />
              <YAxis stroke="#666" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="count" fill="#00ff88" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h3 className="text-lg font-semibold text-white mb-4">最近崩溃</h3>
          {stats?.recentCrashes && stats.recentCrashes.length > 0 ? (
            <div className="space-y-3">
              {stats.recentCrashes.map((crash, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 bg-dark-700/50 rounded-lg"
                >
                  <div className="w-2 h-2 bg-status-error rounded-full animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{crash.description}</p>
                    <p className="text-xs text-dark-400">
                      {new Date(crash.timestamp).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      crash.severity === 'critical'
                        ? 'bg-status-error/20 text-status-error'
                        : 'bg-status-warning/20 text-status-warning'
                    }`}
                  >
                    {crash.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-400 text-center py-8">暂无崩溃记录</p>
          )}
        </div>

        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h3 className="text-lg font-semibold text-white mb-4">最近任务</h3>
          {stats?.recentTasks && stats.recentTasks.length > 0 ? (
            <div className="space-y-3">
              {stats.recentTasks.map((task, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-3 bg-dark-700/50 rounded-lg"
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      task.status === 'running'
                        ? 'bg-status-success animate-pulse'
                        : task.status === 'completed'
                        ? 'bg-status-success'
                        : 'bg-dark-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{task.name}</p>
                    <p className="text-xs text-dark-400">
                      报文: {task.packetCount} | 崩溃: {task.crashCount}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      task.status === 'running'
                        ? 'bg-status-success/20 text-status-success'
                        : task.status === 'completed'
                        ? 'bg-primary-600/20 text-primary-400'
                        : 'bg-dark-600 text-dark-300'
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-dark-400 text-center py-8">暂无测试任务</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

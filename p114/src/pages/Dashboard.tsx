import { useQuery } from '@tanstack/react-query';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Shield, CheckCircle, Link, AlertTriangle, Server, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { Link as RouterLink } from 'react-router-dom';

const COLORS = ['#14b8a6', '#2563eb', '#dc2626', '#d97706'];

export function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    initialData: {
      totalVtpm: 0,
      availableVtpm: 0,
      assignedVtpm: 0,
      errorVtpm: 0,
      totalVms: 0,
      vmsWithVtpm: 0,
    },
  });

  const pieData = [
    { name: '可用', value: stats.availableVtpm },
    { name: '已分配', value: stats.assignedVtpm },
    { name: '错误', value: stats.errorVtpm },
    { name: '初始化中', value: Math.max(0, stats.totalVtpm - stats.availableVtpm - stats.assignedVtpm - stats.errorVtpm) },
  ].filter(item => item.value > 0);

  const statCards = [
    {
      title: 'vTPM总数',
      value: stats.totalVtpm,
      icon: Shield,
      gradient: 'from-primary-500 to-primary-700',
      link: '/vtpm',
    },
    {
      title: '可用vTPM',
      value: stats.availableVtpm,
      icon: CheckCircle,
      gradient: 'from-success-500 to-success-700',
      link: '/vtpm',
    },
    {
      title: '已分配vTPM',
      value: stats.assignedVtpm,
      icon: Link,
      gradient: 'from-primary-400 to-primary-600',
      link: '/vtpm',
    },
    {
      title: '虚拟机总数',
      value: stats.totalVms,
      icon: Server,
      gradient: 'from-dark-500 to-dark-700',
      link: '/vms',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">仪表盘</h1>
          <p className="text-dark-400 mt-1">vTPM管理系统概览</p>
        </div>
        <RouterLink
          to="/vtpm"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          创建vTPM
        </RouterLink>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <RouterLink
              key={card.title}
              to={card.link}
              className="bg-dark-800 rounded-xl p-6 border border-dark-700 hover:border-dark-600 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-dark-400 text-sm">{card.title}</p>
                  <p className="text-3xl font-bold text-white mt-2">{card.value}</p>
                </div>
                <div className={`w-12 h-12 bg-gradient-to-br ${card.gradient} rounded-lg flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </RouterLink>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h2 className="text-lg font-semibold text-white mb-4">vTPM状态分布</h2>
          <div className="h-64">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-dark-500">
                暂无数据
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {pieData.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm text-dark-300">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-dark-800 rounded-xl p-6 border border-dark-700">
          <h2 className="text-lg font-semibold text-white mb-4">快速操作</h2>
          <div className="space-y-3">
            <RouterLink
              to="/vtpm"
              className="flex items-center gap-4 p-4 bg-dark-700/50 hover:bg-dark-700 rounded-lg transition-colors group"
            >
              <div className="w-10 h-10 bg-success-600/20 rounded-lg flex items-center justify-center">
                <Plus className="w-5 h-5 text-success-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium group-hover:text-success-400 transition-colors">创建新vTPM</p>
                <p className="text-sm text-dark-400">创建一个新的虚拟TPM设备</p>
              </div>
            </RouterLink>

            <RouterLink
              to="/vms"
              className="flex items-center gap-4 p-4 bg-dark-700/50 hover:bg-dark-700 rounded-lg transition-colors group"
            >
              <div className="w-10 h-10 bg-primary-600/20 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-primary-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium group-hover:text-primary-400 transition-colors">管理虚拟机</p>
                <p className="text-sm text-dark-400">查看和管理虚拟机列表</p>
              </div>
            </RouterLink>

            <RouterLink
              to="/crypto-test"
              className="flex items-center gap-4 p-4 bg-dark-700/50 hover:bg-dark-700 rounded-lg transition-colors group"
            >
              <div className="w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium group-hover:text-amber-400 transition-colors">加解密测试</p>
                <p className="text-sm text-dark-400">测试vTPM的加密解密功能</p>
              </div>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  );
}

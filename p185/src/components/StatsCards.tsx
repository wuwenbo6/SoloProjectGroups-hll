import { AlertTriangle, Users, Target, Layers } from 'lucide-react';
import { useLogStore } from '@/store/useLogStore';

export function StatsCards() {
  const { parseResult } = useLogStore();

  if (!parseResult) return null;

  const stats = [
    {
      title: '违规记录总数',
      value: parseResult.stats.totalRecords,
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    {
      title: '主体类型数',
      value: parseResult.stats.uniqueSubjects,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      title: '客体类型数',
      value: parseResult.stats.uniqueObjects,
      icon: Target,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
    },
    {
      title: '策略类型数',
      value: parseResult.stats.uniqueTclasses,
      icon: Layers,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.title}
          className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium">{stat.title}</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">
                {stat.value}
              </p>
            </div>
            <div className={`p-3 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

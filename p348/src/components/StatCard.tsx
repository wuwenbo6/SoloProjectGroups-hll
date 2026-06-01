import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  gradient: string;
}

export function StatCard({ title, value, icon: Icon, trend, gradient }: StatCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div className={`absolute top-0 right-0 h-24 w-24 opacity-10 ${gradient} blur-2xl`}></div>
      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
          {trend && (
            <p className={`mt-2 text-sm font-medium ${trend.positive ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}% 较昨日
            </p>
          )}
        </div>
        <div className={`rounded-xl p-3 ${gradient}`}>
          <Icon className="h-8 w-8 text-white" />
        </div>
      </div>
    </div>
  );
}

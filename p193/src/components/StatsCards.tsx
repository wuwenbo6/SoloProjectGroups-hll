import { FileText, Activity, Radio, Network, Boxes } from 'lucide-react';
import { useStats } from '../store/useAppStore';
import { formatNumber } from '../utils/formatters';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  delay?: number;
}

function StatCard({ label, value, icon, color, bgColor, delay = 0 }: StatCardProps) {
  return (
    <div 
      className="relative overflow-hidden bg-slate-800/50 border border-slate-700 rounded-xl p-4
        hover:border-slate-600 transition-all duration-300 hover:translate-y-[-2px]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color} font-mono`}>
            {formatNumber(value)}
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg ${bgColor} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-slate-600 to-transparent opacity-50" />
    </div>
  );
}

export function StatsCards() {
  const stats = useStats();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard
        label="Total Packets"
        value={stats.total}
        icon={<FileText className="w-5 h-5 text-slate-400" />}
        color="text-slate-200"
        bgColor="bg-slate-700/50"
        delay={0}
      />
      <StatCard
        label="TMATS"
        value={stats.tmats}
        icon={<Activity className="w-5 h-5 text-purple-400" />}
        color="text-purple-400"
        bgColor="bg-purple-500/10"
        delay={50}
      />
      <StatCard
        label="PCM"
        value={stats.pcm}
        icon={<Radio className="w-5 h-5 text-blue-400" />}
        color="text-blue-400"
        bgColor="bg-blue-500/10"
        delay={100}
      />
      <StatCard
        label="1553 Bus"
        value={stats.mil1553}
        icon={<Network className="w-5 h-5 text-orange-400" />}
        color="text-orange-400"
        bgColor="bg-orange-500/10"
        delay={150}
      />
      <StatCard
        label="Other"
        value={stats.other}
        icon={<Boxes className="w-5 h-5 text-gray-400" />}
        color="text-gray-400"
        bgColor="bg-gray-500/10"
        delay={200}
      />
    </div>
  );
}

import React from 'react';
import { Layers, Film, Video, Box, Hash, FileVideo, Zap, Trash2 } from 'lucide-react';
import { ParseResult } from '../types';
import { formatBytes } from '../utils/h265Parser';

interface StatsCardsProps {
  result: ParseResult;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  bgGradient: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color, bgGradient }) => (
  <div
    className={`relative overflow-hidden rounded-xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${bgGradient}`}
  >
    <div className="absolute top-0 right-0 w-24 h-24 opacity-10 transform translate-x-8 -translate-y-8">
      {icon}
    </div>
    <div className="relative z-10">
      <div className={`inline-flex p-2 rounded-lg ${color}/20 mb-3`}>{icon}</div>
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  </div>
);

export const StatsCards: React.FC<StatsCardsProps> = ({ result }) => {
  const { stats, fileSize, gopStructure } = result;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<Layers className="w-5 h-5 text-blue-400" />}
        label="总 NAL 单元"
        value={stats.total.toLocaleString()}
        color="text-blue-400"
        bgGradient="bg-gradient-to-br from-blue-900/30 to-blue-800/10 border border-blue-500/20"
      />

      <StatCard
        icon={<Film className="w-5 h-5 text-red-400" />}
        label="IDR 帧"
        value={stats.idr.toLocaleString()}
        color="text-red-400"
        bgGradient="bg-gradient-to-br from-red-900/30 to-red-800/10 border border-red-500/20"
      />

      <StatCard
        icon={<Video className="w-5 h-5 text-cyan-400" />}
        label="P 帧"
        value={stats.pFrame.toLocaleString()}
        color="text-cyan-400"
        bgGradient="bg-gradient-to-br from-cyan-900/30 to-cyan-800/10 border border-cyan-500/20"
      />

      <StatCard
        icon={<Box className="w-5 h-5 text-amber-400" />}
        label="B 帧"
        value={stats.bFrame.toLocaleString()}
        color="text-amber-400"
        bgGradient="bg-gradient-to-br from-amber-900/30 to-amber-800/10 border border-amber-500/20"
      />

      <StatCard
        icon={<Zap className="w-5 h-5 text-sky-400" />}
        label="RASL 帧"
        value={stats.raslFrame.toLocaleString()}
        color="text-sky-400"
        bgGradient="bg-gradient-to-br from-sky-900/30 to-sky-800/10 border border-sky-500/20"
      />

      <StatCard
        icon={<Trash2 className="w-5 h-5 text-teal-400" />}
        label="RADL 帧"
        value={stats.radlFrame.toLocaleString()}
        color="text-teal-400"
        bgGradient="bg-gradient-to-br from-teal-900/30 to-teal-800/10 border border-teal-500/20"
      />

      <StatCard
        icon={<Hash className="w-5 h-5 text-purple-400" />}
        label="GOP 数量"
        value={gopStructure.length.toLocaleString()}
        color="text-purple-400"
        bgGradient="bg-gradient-to-br from-purple-900/30 to-purple-800/10 border border-purple-500/20"
      />

      <StatCard
        icon={<FileVideo className="w-5 h-5 text-green-400" />}
        label="文件大小"
        value={formatBytes(fileSize)}
        color="text-green-400"
        bgGradient="bg-gradient-to-br from-green-900/30 to-green-800/10 border border-green-500/20"
      />
    </div>
  );
};

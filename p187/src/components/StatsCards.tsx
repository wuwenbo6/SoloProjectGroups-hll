import { TrendingDown, Activity, Target, Gauge } from 'lucide-react';
import { useDataStore } from '../store/useDataStore';

export function StatsCards() {
  const { tags, activeTagId, isProcessing } = useDataStore();

  const activeTag = tags.find((t) => t.tagId === activeTagId);
  const statistics = activeTag?.statistics;

  const hasStats = statistics !== null;

  const cards = [
    {
      label: '原始方差',
      value: statistics?.original.variance.toFixed(4) || '--',
      unit: 'm²',
      icon: Activity,
      color: 'orange',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/30',
      textColor: 'text-orange-400',
      iconColor: 'text-orange-400',
    },
    {
      label: '滤波后方差',
      value: statistics?.filtered.variance.toFixed(4) || '--',
      unit: 'm²',
      icon: Target,
      color: 'cyan',
      bgColor: 'bg-cyan-500/10',
      borderColor: 'border-cyan-500/30',
      textColor: 'text-cyan-400',
      iconColor: 'text-cyan-400',
    },
    {
      label: '标准差',
      value: statistics
        ? `${statistics.original.stdDev.toFixed(3)} → ${statistics.filtered.stdDev.toFixed(3)}`
        : '--',
      unit: 'm',
      icon: Gauge,
      color: 'purple',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/30',
      textColor: 'text-purple-400',
      iconColor: 'text-purple-400',
    },
    {
      label: '方差降噪率',
      value: statistics ? `${statistics.improvement.varianceReduction.toFixed(1)}%` : '--',
      unit: '',
      icon: TrendingDown,
      color: 'emerald',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/30',
      textColor: 'text-emerald-400',
      iconColor: 'text-emerald-400',
      highlight: true,
    },
  ];

  if (tags.length === 0) {
    return null;
  }

  return (
    <div>
      {activeTag && (
        <div className="mb-3 flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: activeTag.color }}
          />
          <span className="text-sm text-slate-400">
            统计指标 - {activeTag.tagName}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden rounded-xl border ${card.borderColor} ${card.bgColor} p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                card.highlight && hasStats
                  ? 'shadow-emerald-500/10 hover:shadow-emerald-500/20'
                  : 'hover:shadow-black/20'
              }`}
              style={{
                animation: hasStats
                  ? `fadeInUp 0.5s ease-out ${index * 0.1}s both`
                  : 'none',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">{card.label}</p>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-2xl font-bold ${card.textColor} font-mono ${
                        isProcessing ? 'animate-pulse' : ''
                      }`}
                    >
                      {card.value}
                    </span>
                    {card.unit && (
                      <span className="text-xs text-slate-500">{card.unit}</span>
                    )}
                  </div>
                </div>
                <div
                  className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center ${card.borderColor} border`}
                >
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
              </div>
              {card.highlight && hasStats && statistics && (
                <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(statistics.improvement.varianceReduction, 100)}%` }}
                  ></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useSimulationStore } from '@/hooks/useSimulation';
import { Activity, BarChart3, Signal, Cpu, Zap } from 'lucide-react';

export default function StatsPanel() {
  const { fftResult, result, params } = useSimulationStore();

  if (!fftResult || !result) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-sm">
        运行仿真以查看结果
      </div>
    );
  }

  const theoreticalSNR = 6.02 * params.order + 1.76 + 10 * Math.log10((2 * params.order + 1) * Math.pow(params.oversampleRatio, 2 * params.order + 1) / (Math.PI * Math.PI));

  const stats = [
    {
      icon: <Cpu size={14} />,
      label: '调制器',
      value: `${params.order}阶 ${params.order === 2 ? 'CRFF' : '标准'}`,
      sub: `结构`,
      color: params.order === 2 ? 'text-emerald-400' : 'text-blue-400',
      bgColor: params.order === 2 ? 'bg-emerald-950/30' : 'bg-blue-950/30',
      borderColor: params.order === 2 ? 'border-emerald-800/30' : 'border-blue-800/30',
    },
    {
      icon: <Activity size={14} />,
      label: 'SNR',
      value: `${fftResult.snr.toFixed(1)} dB`,
      sub: `理论: ${theoreticalSNR.toFixed(1)} dB`,
      color: 'text-amber-400',
      bgColor: 'bg-amber-950/30',
      borderColor: 'border-amber-800/30',
    },
    {
      icon: <Signal size={14} />,
      label: '信号功率',
      value: `${fftResult.signalPowerDb.toFixed(1)} dB`,
      sub: `峰值: ${fftResult.peakFreq >= 1e3 ? (fftResult.peakFreq / 1e3).toFixed(1) + ' kHz' : fftResult.peakFreq.toFixed(0) + ' Hz'}`,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-950/30',
      borderColor: 'border-emerald-800/30',
    },
    {
      icon: <Zap size={14} />,
      label: '带内噪声',
      value: `${fftResult.totalInbandNoiseDb.toFixed(1)} dB`,
      sub: `噪声基底: ${fftResult.noiseFloorDb.toFixed(1)} dB`,
      color: 'text-orange-400',
      bgColor: 'bg-orange-950/30',
      borderColor: 'border-orange-800/30',
    },
  ];

  return (
    <div className="flex gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`flex-1 p-3 rounded-lg border ${stat.bgColor} ${stat.borderColor}`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={stat.color}>{stat.icon}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              {stat.label}
            </span>
          </div>
          <div className={`text-lg font-bold font-mono ${stat.color} leading-tight`}>
            {stat.value}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">{stat.sub}</div>
        </div>
      ))}
    </div>
  );
}

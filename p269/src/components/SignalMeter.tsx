import React from 'react';
import { useDmrStore } from '@/store/useDmrStore';
import { formatFrequency, getQualityColor } from '@/utils/format';

export const SignalMeter: React.FC = () => {
  const { result } = useDmrStore();

  if (!result) {
    return (
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-200 mb-4">信号质量</h2>
        <div className="h-40 flex items-center justify-center text-gray-500">
          分析完成后显示信号质量指标
        </div>
      </div>
    );
  }

  const { demodulation } = result;
  const qualityColor = getQualityColor(demodulation.qualityScore);

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <h2 className="text-lg font-semibold text-gray-200 mb-4">信号质量</h2>

      <div className="mb-6">
        <QualityGauge score={demodulation.qualityScore} color={qualityColor} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <MetricCard
          label="信噪比 (SNR)"
          value={`${demodulation.snr.toFixed(1)} dB`}
          color={demodulation.snr > 10 ? '#00ff88' : demodulation.snr > 5 ? '#ffd700' : '#ff6b35'}
          icon="📶"
        />
        <MetricCard
          label="频率偏移"
          value={formatFrequency(demodulation.frequencyOffset)}
          color={Math.abs(demodulation.frequencyOffset) < 100 ? '#00ff88' : Math.abs(demodulation.frequencyOffset) < 500 ? '#ffd700' : '#ff6b35'}
          icon="📡"
        />
        <MetricCard
          label="符号错误率"
          value={`${(demodulation.symbolErrorRate * 100).toFixed(2)}%`}
          color={demodulation.symbolErrorRate < 0.02 ? '#00ff88' : demodulation.symbolErrorRate < 0.05 ? '#ffd700' : '#ff6b35'}
          icon="⚠️"
        />
        <MetricCard
          label="解调符号数"
          value={demodulation.symbols.length.toLocaleString()}
          color="#00d4ff"
          icon="🔢"
        />
      </div>
    </div>
  );
};

interface QualityGaugeProps {
  score: number;
  color: string;
}

const QualityGauge: React.FC<QualityGaugeProps> = ({ score, color }) => {
  const circumference = 2 * Math.PI * 60;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-20 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 140 80">
          <circle
            cx="70"
            cy="80"
            r="60"
            fill="none"
            stroke="rgba(75, 85, 99, 0.3)"
            strokeWidth="12"
            strokeDasharray={`${circumference / 2} ${circumference}`}
            strokeLinecap="round"
          />
          <circle
            cx="70"
            cy="80"
            r="60"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${circumference / 2} ${circumference}`}
            strokeDashoffset={strokeDashoffset / 2}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 8px ${color}60)`,
              transition: 'stroke-dashoffset 0.5s ease-out',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span
            className="text-4xl font-bold font-mono"
            style={{ color }}
          >
            {score}
          </span>
          <span className="text-xs text-gray-500">质量评分</span>
        </div>
      </div>

      <div className="flex justify-between w-full max-w-[160px] mt-2 text-xs text-gray-500">
        <span>差</span>
        <span>良</span>
        <span>优</span>
      </div>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, color, icon }) => {
  return (
    <div className="bg-gray-700/30 rounded-lg p-3 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div
        className="text-lg font-mono font-semibold"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
};

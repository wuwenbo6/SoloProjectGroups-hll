import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface ChannelData {
  channelIndex: number;
  channelName: string;
  samples: number[];
}

interface PcmChartProps {
  channels: ChannelData[];
  maxSamples?: number;
}

const CHANNEL_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16'
];

export function PcmChart({ channels, maxSamples = 256 }: PcmChartProps) {
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(
    new Set(channels.slice(0, 4).map(c => c.channelIndex))
  );

  const toggleChannel = (index: number) => {
    setSelectedChannels(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const chartData = useMemo(() => {
    if (channels.length === 0) return [];

    const sampleCount = Math.min(
      Math.max(...channels.map(c => c.samples.length)),
      maxSamples
    );

    const data = [];
    for (let i = 0; i < sampleCount; i++) {
      const point: Record<string, number | string> = { sample: i };
      for (const ch of channels) {
        if (selectedChannels.has(ch.channelIndex) && i < ch.samples.length) {
          point[`ch${ch.channelIndex}`] = ch.samples[i];
        }
      }
      data.push(point);
    }

    return data;
  }, [channels, selectedChannels, maxSamples]);

  const visibleChannels = channels.filter(ch => selectedChannels.has(ch.channelIndex));

  if (channels.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        No channel data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {channels.map(ch => (
          <button
            key={ch.channelIndex}
            onClick={() => toggleChannel(ch.channelIndex)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedChannels.has(ch.channelIndex)
                ? 'text-white shadow-md'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            }`}
            style={{
              backgroundColor: selectedChannels.has(ch.channelIndex)
                ? CHANNEL_COLORS[ch.channelIndex % CHANNEL_COLORS.length]
                : undefined
            }}
          >
            {ch.channelName}
          </button>
        ))}
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="sample"
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={{ stroke: '#475569' }}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={{ stroke: '#475569' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0'
              }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => {
                const ch = channels.find(c => `ch${c.channelIndex}` === value);
                return ch?.channelName || value;
              }}
            />
            {visibleChannels.map(ch => (
              <Line
                key={ch.channelIndex}
                type="monotone"
                dataKey={`ch${ch.channelIndex}`}
                stroke={CHANNEL_COLORS[ch.channelIndex % CHANNEL_COLORS.length]}
                strokeWidth={1.5}
                dot={false}
                name={ch.channelName}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {visibleChannels.map(ch => (
          <div
            key={ch.channelIndex}
            className="p-3 bg-slate-800/30 rounded-lg border border-slate-700"
          >
            <div className="text-xs text-slate-500 mb-1">{ch.channelName}</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-slate-400">Min</div>
                <div className="font-mono text-sm">
                  {ch.samples.length > 0 ? Math.min(...ch.samples.slice(0, maxSamples)) : '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Max</div>
                <div className="font-mono text-sm">
                  {ch.samples.length > 0 ? Math.max(...ch.samples.slice(0, maxSamples)) : '-'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Avg</div>
                <div className="font-mono text-sm">
                  {ch.samples.length > 0
                    ? (ch.samples.slice(0, maxSamples).reduce((a, b) => a + b, 0) / Math.min(ch.samples.length, maxSamples)).toFixed(0)
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

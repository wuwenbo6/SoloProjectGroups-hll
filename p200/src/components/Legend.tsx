import React from 'react';
import type { MetricType } from '../../shared/types';

interface LegendProps {
  metric: MetricType;
}

const colorStops = {
  rsrp: [
    { value: -140, color: '#FF0000', label: '-140' },
    { value: -120, color: '#FF4500', label: '-120' },
    { value: -100, color: '#FF8C00', label: '-100' },
    { value: -80, color: '#FFD700', label: '-80' },
    { value: -60, color: '#9ACD32', label: '-60' },
    { value: -40, color: '#00CED1', label: '-40' },
    { value: -20, color: '#00BFFF', label: '-20' },
    { value: 0, color: '#00D4AA', label: '0' },
  ],
  sinr: [
    { value: -10, color: '#FF0000', label: '-10' },
    { value: -5, color: '#FF4500', label: '-5' },
    { value: 0, color: '#FF8C00', label: '0' },
    { value: 5, color: '#FFD700', label: '5' },
    { value: 10, color: '#9ACD32', label: '10' },
    { value: 15, color: '#00CED1', label: '15' },
    { value: 20, color: '#00BFFF', label: '20' },
    { value: 30, color: '#00D4AA', label: '30' },
  ],
};

export const Legend: React.FC<LegendProps> = ({ metric }) => {
  const stops = colorStops[metric];
  const gradient = stops.map((s) => s.color).join(', ');

  return (
    <div className="absolute bottom-6 right-6 card p-4 z-[1000] min-w-[200px]">
      <div className="text-sm font-medium text-white mb-3">
        {metric === 'rsrp' ? 'RSRP (dBm)' : 'SINR (dB)'}
      </div>
      <div
        className="h-4 rounded mb-2"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
      />
      <div className="flex justify-between text-xs text-gray-400">
        {stops.map((stop, index) => (
          <div key={index} className="flex flex-col items-center">
            <span>{stop.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

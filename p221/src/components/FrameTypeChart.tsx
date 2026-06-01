import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartOptions } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { ParseResult, NAL_TYPE_COLORS, NAL_TYPE_NAMES, NALUnitType } from '../types';

ChartJS.register(ArcElement, Tooltip, Legend);

interface FrameTypeChartProps {
  result: ParseResult;
}

export const FrameTypeChart: React.FC<FrameTypeChartProps> = ({ result }) => {
  const { stats } = result;

  const chartData = [
    { type: 'VPS' as NALUnitType, count: stats.vps },
    { type: 'SPS' as NALUnitType, count: stats.sps },
    { type: 'PPS' as NALUnitType, count: stats.pps },
    { type: 'IDR' as NALUnitType, count: stats.idr },
    { type: 'P' as NALUnitType, count: stats.pFrame },
    { type: 'B' as NALUnitType, count: stats.bFrame },
    { type: 'RASL' as NALUnitType, count: stats.raslFrame },
    { type: 'RADL' as NALUnitType, count: stats.radlFrame },
    { type: 'AUD' as NALUnitType, count: stats.aud },
    { type: 'SEI' as NALUnitType, count: stats.sei },
    { type: 'UNKNOWN' as NALUnitType, count: stats.unknown },
  ].filter((item) => item.count > 0);

  const data = {
    labels: chartData.map((item) => `${item.type} - ${NAL_TYPE_NAMES[item.type]}`),
    datasets: [
      {
        data: chartData.map((item) => item.count),
        backgroundColor: chartData.map((item) => NAL_TYPE_COLORS[item.type]),
        borderColor: chartData.map((item) => NAL_TYPE_COLORS[item.type]),
        borderWidth: 2,
        hoverOffset: 8,
      },
    ],
  };

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#9CA3AF',
          padding: 12,
          font: {
            size: 12,
          },
          usePointStyle: true,
          pointStyle: 'circle',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#F3F4F6',
        bodyColor: '#D1D5DB',
        borderColor: 'rgba(75, 85, 99, 0.5)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function (context) {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0) as number;
            const value = context.raw as number;
            const percentage = ((value / total) * 100).toFixed(2);
            return `${context.label}: ${value.toLocaleString()} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6 h-full">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        NAL 单元类型分布
      </h3>
      <div className="h-80">
        <Pie data={data} options={options} />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <div className="grid grid-cols-3 gap-3 text-center">
          {chartData.slice(0, 6).map((item) => (
            <div key={item.type} className="space-y-1">
              <div
                className="w-3 h-3 rounded-full mx-auto"
                style={{ backgroundColor: NAL_TYPE_COLORS[item.type] }}
              />
              <p className="text-xs text-gray-400">{item.type}</p>
              <p className="text-sm font-medium text-white">{item.count.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

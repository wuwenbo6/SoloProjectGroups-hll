import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const MAX_LUT = 50000;
const MAX_DSP = 200;
const MAX_BRAM = 50;

const ResourceChart = ({ data }) => {
  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p>上传代码并点击"开始估算"查看资源使用情况</p>
        </div>
      </div>
    );
  }

  const chartData = {
    labels: ['LUT', 'DSP', 'BRAM'],
    datasets: [
      {
        label: '资源占用',
        data: [data.lut, data.dsp, data.bram],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
        ],
        borderColor: [
          'rgb(59, 130, 246)',
          'rgb(16, 185, 129)',
          'rgb(245, 158, 11)',
        ],
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function(context) {
            const maxValues = [MAX_LUT, MAX_DSP, MAX_BRAM];
            const value = context.raw;
            const max = maxValues[context.dataIndex];
            const percentage = ((value / max) * 100).toFixed(1);
            return `数量: ${value} (${percentage}%)`;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(71, 85, 105, 0.3)',
        },
        ticks: {
          color: '#94a3b8',
          font: {
            size: 14,
            weight: 'bold',
          },
        },
      },
      y: {
        grid: {
          color: 'rgba(71, 85, 105, 0.3)',
        },
        ticks: {
          color: '#94a3b8',
        },
      },
    },
  };

  const lutPercent = ((data.lut / MAX_LUT) * 100).toFixed(1);
  const dspPercent = ((data.dsp / MAX_DSP) * 100).toFixed(1);
  const bramPercent = ((data.bram / MAX_BRAM) * 100).toFixed(1);

  return (
    <div>
      <div className="h-64 mb-6">
        <Bar data={chartData} options={options} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-dark-lighter rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{data.lut.toLocaleString()}</div>
          <div className="text-sm text-gray-400 mt-1">LUT</div>
          <div className="mt-2 h-2 bg-dark rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(lutPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{lutPercent}%</div>
        </div>
        <div className="bg-dark-lighter rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{data.dsp}</div>
          <div className="text-sm text-gray-400 mt-1">DSP</div>
          <div className="mt-2 h-2 bg-dark rounded-full overflow-hidden">
            <div 
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(dspPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{dspPercent}%</div>
        </div>
        <div className="bg-dark-lighter rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{data.bram}</div>
          <div className="text-sm text-gray-400 mt-1">BRAM</div>
          <div className="mt-2 h-2 bg-dark rounded-full overflow-hidden">
            <div 
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(bramPercent, 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-1">{bramPercent}%</div>
        </div>
      </div>
    </div>
  );
};

export default ResourceChart;

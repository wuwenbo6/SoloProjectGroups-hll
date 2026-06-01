import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend, ChartOptions } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ParseResult, CUSize } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface CUAnalysisProps {
  result: ParseResult;
}

const CU_COLORS: Record<CUSize, string> = {
  '64x64': '#8B5CF6',
  '32x32': '#3B82F6',
  '16x16': '#06B6D4',
  '8x8': '#10B981',
};

const CU_SIZE_PIXELS: Record<CUSize, number> = {
  '64x64': 4096,
  '32x32': 1024,
  '16x16': 256,
  '8x8': 64,
};

const PRED_MODE_LABELS: Record<string, string> = {
  PLANAR: 'Planar (0)',
  DC: 'DC (1)',
  ANGULAR_2: 'Ang 2',
  ANGULAR_6: 'Ang 6',
  ANGULAR_10: 'Ang 10 (Hor)',
  ANGULAR_14: 'Ang 14',
  ANGULAR_18: 'Ang 18 (Vert)',
  ANGULAR_22: 'Ang 22',
  ANGULAR_26: 'Ang 26 (Diag)',
  ANGULAR_30: 'Ang 30',
  ANGULAR_34: 'Ang 34',
};

export const CUAnalysis: React.FC<CUAnalysisProps> = ({ result }) => {
  const { cuAnalysis } = result;

  if (!cuAnalysis || cuAnalysis.totalCUs === 0) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-500" />
          CU 划分统计与帧内预测模式
        </h3>
        <p className="text-gray-400 text-sm">暂无CU分析数据</p>
      </div>
    );
  }

  const cuSizes: CUSize[] = ['64x64', '32x32', '16x16', '8x8'];

  const cuBarData = {
    labels: cuSizes,
    datasets: [
      {
        label: 'IDR 帧',
        data: cuSizes.map((s) => cuAnalysis.cuSizeByFrameType.idr[s]),
        backgroundColor: '#EF444480',
        borderColor: '#EF4444',
        borderWidth: 1,
      },
      {
        label: 'P 帧',
        data: cuSizes.map((s) => cuAnalysis.cuSizeByFrameType.p[s]),
        backgroundColor: '#3B82F680',
        borderColor: '#3B82F6',
        borderWidth: 1,
      },
      {
        label: 'B 帧',
        data: cuSizes.map((s) => cuAnalysis.cuSizeByFrameType.b[s]),
        backgroundColor: '#F59E0B80',
        borderColor: '#F59E0B',
        borderWidth: 1,
      },
    ],
  };

  const cuBarOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#9CA3AF', usePointStyle: true, pointStyle: 'circle', padding: 12 },
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#F3F4F6',
        bodyColor: '#D1D5DB',
        borderColor: 'rgba(75, 85, 99, 0.5)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: '#9CA3AF' },
        grid: { color: 'rgba(75, 85, 99, 0.2)' },
      },
      y: {
        ticks: { color: '#9CA3AF' },
        grid: { color: 'rgba(75, 85, 99, 0.2)' },
      },
    },
  };

  const sortedModes = Object.entries(cuAnalysis.intraPredModeDistribution)
    .sort(([, a], [, b]) => b - a);

  const predBarData = {
    labels: sortedModes.map(([mode]) => PRED_MODE_LABELS[mode] || mode),
    datasets: [
      {
        label: '使用次数',
        data: sortedModes.map(([, count]) => count),
        backgroundColor: sortedModes.map((_, i) => {
          const colors = ['#8B5CF6', '#06B6D4', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#0EA5E9', '#14B8A6', '#64748B'];
          return colors[i % colors.length] + '80';
        }),
        borderColor: sortedModes.map((_, i) => {
          const colors = ['#8B5CF6', '#06B6D4', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#0EA5E9', '#14B8A6', '#64748B'];
          return colors[i % colors.length];
        }),
        borderWidth: 1,
      },
    ],
  };

  const predBarOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        titleColor: '#F3F4F6',
        bodyColor: '#D1D5DB',
        borderColor: 'rgba(75, 85, 99, 0.5)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        ticks: { color: '#9CA3AF' },
        grid: { color: 'rgba(75, 85, 99, 0.2)' },
      },
      y: {
        ticks: { color: '#9CA3AF', font: { size: 11 } },
        grid: { color: 'rgba(75, 85, 99, 0.2)' },
      },
    },
  };

  const totalCUs = cuAnalysis.totalCUs;

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-teal-500" />
        CU 划分统计与帧内预测模式
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-3 bg-gray-900/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-white">{totalCUs.toLocaleString()}</p>
          <p className="text-xs text-gray-500">总 CU 数量</p>
        </div>
        <div className="p-3 bg-gray-900/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-white">
            {cuAnalysis.avgCUSize > 0 ? Math.round(cuAnalysis.avgCUSize) : 0}
          </p>
          <p className="text-xs text-gray-500">平均 CU 像素面积</p>
        </div>
        {cuSizes.map((size) => {
          const count = cuAnalysis.cuPartitionDistribution[size];
          const pct = totalCUs > 0 ? ((count / totalCUs) * 100).toFixed(1) : '0';
          return (
            <div key={size} className="p-3 bg-gray-900/50 rounded-lg text-center">
              <div
                className="w-4 h-4 rounded mx-auto mb-1"
                style={{ backgroundColor: CU_COLORS[size] }}
              />
              <p className="text-lg font-bold text-white">{pct}%</p>
              <p className="text-xs text-gray-500">{size} ({count})</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-3">CU 划分大小分布（按帧类型）</h4>
          <div className="h-64">
            <Bar data={cuBarData} options={cuBarOptions} />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-3">帧内预测模式分布</h4>
          <div className="h-64">
            <Bar data={predBarData} options={predBarOptions} />
          </div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-900/30 rounded-lg border border-gray-700/30">
        <h4 className="text-sm font-medium text-gray-300 mb-3">CU 划分热力图</h4>
        <div className="grid grid-cols-4 gap-1" style={{ maxWidth: '320px' }}>
          {cuSizes.map((size) => {
            const count = cuAnalysis.cuPartitionDistribution[size];
            const pixels = CU_SIZE_PIXELS[size];
            const areaPct = totalCUs > 0 ? (count * pixels) / Object.entries(cuAnalysis.cuPartitionDistribution).reduce((sum, [s, c]) => sum + c * CU_SIZE_PIXELS[s as CUSize], 0) * 100 : 0;
            return (
              <div
                key={size}
                className="aspect-square rounded flex items-center justify-center text-white text-xs font-medium transition-all hover:scale-110"
                style={{
                  backgroundColor: CU_COLORS[size],
                  opacity: 0.3 + (areaPct / 100) * 0.7,
                  fontSize: size === '8x8' ? '6px' : size === '16x16' ? '8px' : size === '32x32' ? '10px' : '12px',
                }}
                title={`${size}: ${count} 个, 占面积 ${areaPct.toFixed(1)}%`}
              >
                {size}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-2">颜色深浅表示面积占比，悬停查看详情</p>
      </div>
    </div>
  );
};

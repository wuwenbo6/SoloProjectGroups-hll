import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { MapResult, PRCurveData } from '../types';
import { getMapMetrics, getPRCurve } from '../services/api';
import { BarChart3, Activity, TrendingUp } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const MetricsPanel: React.FC = () => {
  const [mapResult, setMapResult] = useState<MapResult | null>(null);
  const [prData, setPrData] = useState<PRCurveData | null>(null);
  const [selectedClass, setSelectedClass] = useState<'Car' | 'Pedestrian'>('Car');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const [map, pr] = await Promise.all([
          getMapMetrics(),
          getPRCurve(selectedClass),
        ]);
        setMapResult(map);
        setPrData(pr);
      } catch (error) {
        console.error('Failed to load metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadMetrics();
  }, [selectedClass]);

  const chartData = {
    labels: prData?.recall.map((_, i) => i.toString()) || [],
    datasets: [
      {
        label: `PR Curve (AP: ${(prData?.ap || 0).toFixed(3)})`,
        data: prData?.precision || [],
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#94a3b8',
          font: { size: 11 },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(10, 14, 23, 0.95)',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: '#1e293b',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Recall',
          color: '#64748b',
        },
        grid: {
          color: 'rgba(30, 41, 59, 0.5)',
        },
        ticks: {
          color: '#64748b',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Precision',
          color: '#64748b',
        },
        grid: {
          color: 'rgba(30, 41, 59, 0.5)',
        },
        ticks: {
          color: '#64748b',
        },
        min: 0,
        max: 1,
      },
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-dark-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <TrendingUp className="w-3.5 h-3.5" />
            mAP
          </div>
          <div className="text-xl font-bold gradient-text">
            {((mapResult?.mAP || 0) * 100).toFixed(1)}%
          </div>
        </div>
        
        <div className="bg-dark-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Activity className="w-3.5 h-3.5 text-green-400" />
            Car AP
          </div>
          <div className="text-xl font-bold text-green-400">
            {((mapResult?.class_aps?.Car || 0) * 100).toFixed(1)}%
          </div>
        </div>
        
        <div className="bg-dark-border rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            Ped AP
          </div>
          <div className="text-xl font-bold text-amber-400">
            {((mapResult?.class_aps?.Pedestrian || 0) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setSelectedClass('Car')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            selectedClass === 'Car'
              ? 'bg-green-500/20 text-green-400 border border-green-500/50'
              : 'bg-dark-border text-gray-400 hover:text-gray-300'
          }`}
        >
          车辆 PR 曲线
        </button>
        <button
          onClick={() => setSelectedClass('Pedestrian')}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            selectedClass === 'Pedestrian'
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
              : 'bg-dark-border text-gray-400 hover:text-gray-300'
          }`}
        >
          行人 PR 曲线
        </button>
      </div>

      <div className="bg-dark-border rounded-lg p-3">
        <div className="flex items-center gap-2 text-gray-400 text-xs mb-3">
          <BarChart3 className="w-3.5 h-3.5" />
          Precision-Recall Curve
        </div>
        <div className="h-48">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      <div className="bg-dark-border rounded-lg p-3 text-xs text-gray-500">
        <div className="font-medium text-gray-400 mb-2">指标说明</div>
        <ul className="space-y-1">
          <li>• <span className="text-gray-300">AP</span>: Average Precision - 单类平均精度</li>
          <li>• <span className="text-gray-300">mAP</span>: mean AP - 所有类别的平均精度</li>
          <li>• <span className="text-gray-300">PR曲线</span>: 精确率-召回率曲线</li>
        </ul>
      </div>
    </div>
  );
};

export default MetricsPanel;

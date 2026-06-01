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
import { Line } from 'react-chartjs-2';
import { Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDataStore } from '../store/useDataStore';

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

export function ComparisonChart() {
  const { tags, showOriginal, showFiltered } = useDataStore();
  const chartRef = useRef<ChartJS<'line'>>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const hasData = tags.length > 0;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const firstTag = tags[0];
  const labels = firstTag ? firstTag.originalData.map((p) => formatTime(p.timestamp)) : [];

  const datasets = [];

  tags.forEach((tag) => {
    if (showOriginal) {
      datasets.push({
        label: `${tag.tagName} - 原始`,
        data: tag.originalData.map((p) => p.distance),
        borderColor: tag.color,
        borderWidth: 1.5,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: tag.color,
        tension: 0.1,
        fill: false,
        opacity: 0.6,
      });
    }

    if (showFiltered && tag.filteredData.length > 0) {
      datasets.push({
        label: `${tag.tagName} - 滤波后`,
        data: tag.filteredData.map((p) => p.distance),
        borderColor: tag.color,
        backgroundColor: `${tag.color}20`,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: tag.color,
        tension: 0.2,
        fill: true,
      });
    }
  });

  const chartData = {
    labels,
    datasets,
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#94A3B8',
          font: {
            family: 'Inter, sans-serif',
            size: 11,
          },
          padding: 15,
          usePointStyle: true,
          pointStyle: 'line',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#E2E8F0',
        bodyColor: '#94A3B8',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context: any) => {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(4)} m`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
        },
        ticks: {
          color: '#64748B',
          maxRotation: 45,
          minRotation: 45,
          maxTicksLimit: 12,
        },
      },
      y: {
        grid: {
          color: 'rgba(51, 65, 85, 0.3)',
        },
        ticks: {
          color: '#64748B',
          callback: (value: any) => `${value} m`,
        },
      },
    },
    animation: {
      duration: 750,
      easing: 'easeInOutQuart' as const,
    },
  };

  const handleZoomIn = () => {
    if (zoomLevel < 3) {
      setZoomLevel((prev) => prev + 0.5);
    }
  };

  const handleZoomOut = () => {
    if (zoomLevel > 0.5) {
      setZoomLevel((prev) => prev - 0.5);
    }
  };

  const handleReset = () => {
    setZoomLevel(1);
  };

  const handleDownload = () => {
    if (chartRef.current) {
      const url = chartRef.current.toBase64Image();
      const link = document.createElement('a');
      link.download = `uwb-filter-chart-${Date.now()}.png`;
      link.href = url;
      link.click();
    }
  };

  if (!hasData) {
    return (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5 h-96">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-cyan-400 rounded-full"></span>
        滤波对比图
      </h3>
      <div className="h-72 flex items-center justify-center text-slate-500">
        <p>上传数据并执行滤波后显示对比图表</p>
      </div>
    </div>
  );
}

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
          <span className="w-1 h-5 bg-cyan-400 rounded-full"></span>
          滤波对比图
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5}
            className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={handleReset}
            className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            title="重置"
          >
            <RotateCcw className="w-4 h-4 text-slate-300" />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3}
            className="p-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors"
            title="放大"
          >
            <ZoomIn className="w-4 h-4 text-slate-300" />
          </button>
          <div className="w-px h-6 bg-slate-600 mx-1"></div>
          <button
            onClick={handleDownload}
            className="p-2 bg-slate-700 hover:bg-cyan-600/20 hover:text-cyan-400 rounded-lg transition-colors text-slate-300"
            title="下载图片"
          >
            <Download className="w-4 h-4" />
          </button>
          <span className="text-xs text-slate-500 ml-2 font-mono">
            {Math.round(zoomLevel * 100)}%
          </span>
        </div>
      </div>
      <div
        className="h-80 transition-transform duration-300"
        style={{ transform: `scale(${zoomLevel})`,
        transformOrigin: 'top left',
      }}
      >
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}

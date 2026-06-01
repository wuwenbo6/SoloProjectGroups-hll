import { useEffect, useRef, useState } from 'react'
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
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { TrendData } from '@/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface TrendChartProps {
  data: TrendData | null
  hours: number
  onHoursChange: (hours: number) => void
}

const HOUR_OPTIONS = [1, 6, 12, 24, 48, 72]

function formatTimestamp(ts: string): string {
  const d = new Date(ts + 'Z')
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export default function TrendChart({ data, hours, onHoursChange }: TrendChartProps) {
  const chartRef = useRef<ChartJS<'line'>>(null)
  const [showP564, setShowP564] = useState(true)

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
      }
    }
  }, [])

  if (!data || data.timestamps.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">质量趋势</h2>
          <div className="flex gap-1">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => onHoursChange(h)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  hours === h
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 flex items-center justify-center text-slate-500">
          暂无趋势数据
        </div>
      </div>
    )
  }

  const datasets = [
    {
      label: '丢包率 (%)',
      data: data.loss_rates,
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      yAxisID: 'y',
      borderWidth: 2,
    },
    {
      label: '抖动延迟 (ms)',
      data: data.jitter_delays,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      yAxisID: 'y',
      borderWidth: 2,
    },
    {
      label: 'MOS 分 (报文携带)',
      data: data.mos_scores,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      yAxisID: 'y1',
      borderWidth: 2,
    },
  ]

  if (showP564) {
    datasets.push({
      label: 'MOS 分 (P.564 估算)',
      data: data.mos_p564_scores,
      borderColor: '#06b6d4',
      backgroundColor: 'rgba(6, 182, 212, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 5,
      yAxisID: 'y1',
      borderWidth: 2,
      borderDash: [5, 5],
    } as any)
  }

  const chartData = {
    labels: data.timestamps.map(formatTimestamp),
    datasets,
  }

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
          color: '#94a3b8',
          font: { family: '"Source Sans 3"', size: 12 },
          usePointStyle: true,
          pointStyle: 'circle' as const,
          padding: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#e2e8f0',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        titleFont: { family: '"Source Sans 3"', size: 13, weight: 'bold' as const },
        bodyFont: { family: '"JetBrains Mono"', size: 12 },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#64748b',
          font: { family: '"JetBrains Mono"', size: 10 },
          maxRotation: 45,
        },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: '丢包率(%) / 延迟(ms)',
          color: '#94a3b8',
          font: { family: '"Source Sans 3"', size: 12 },
        },
        ticks: {
          color: '#64748b',
          font: { family: '"JetBrains Mono"', size: 10 },
        },
        grid: { color: 'rgba(51, 65, 85, 0.3)' },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        min: 1,
        max: 4.5,
        title: {
          display: true,
          text: 'MOS 分',
          color: '#10b981',
          font: { family: '"Source Sans 3"', size: 12 },
        },
        ticks: {
          color: '#10b981',
          font: { family: '"JetBrains Mono"', size: 10 },
        },
        grid: { drawOnChartArea: false },
      },
    },
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-semibold text-slate-100">质量趋势</h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={showP564}
              onChange={(e) => setShowP564(e.target.checked)}
              className="accent-brand-500"
            />
            显示 P.564 估算 MOS
          </label>
          <div className="flex gap-1">
            {HOUR_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => onHoursChange(h)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  hours === h
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                    : 'bg-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-72">
        <Line ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  )
}

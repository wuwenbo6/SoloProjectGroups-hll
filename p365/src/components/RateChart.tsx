import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
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
import { useDDSStore } from '@/store/ddsStore'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

export default function RateChart() {
  const { rateHistory } = useDDSStore()

  const chartData = useMemo(() => {
    const labels = rateHistory.map((p) => {
      const d = new Date(p.time)
      return d.toLocaleTimeString('zh-CN', { hour12: false, minute: '2-digit', second: '2-digit' })
    })

    return {
      labels,
      datasets: [
        {
          label: '原始频率 (msg/s)',
          data: rateHistory.map((p) => p.sentRate),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: '过滤后频率 (msg/s)',
          data: rateHistory.map((p) => p.receivedRate),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    }
  }, [rateHistory])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300,
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(30, 41, 59, 0.5)',
          },
          ticks: {
            color: '#64748B',
            font: {
              family: 'JetBrains Mono, monospace',
              size: 10,
            },
            maxTicksLimit: 8,
          },
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(30, 41, 59, 0.5)',
          },
          ticks: {
            color: '#64748B',
            font: {
              family: 'JetBrains Mono, monospace',
              size: 10,
            },
          },
        },
      },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: '#94A3B8',
            font: {
              size: 12,
            },
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          backgroundColor: '#1E293B',
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
          borderColor: '#334155',
          borderWidth: 1,
        },
      },
    }),
    []
  )

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white tracking-wide mb-4">频率趋势</h2>
      <div className="h-[250px]">
        {rateHistory.length > 0 ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-600 text-sm">
            启动发布后显示频率趋势图
          </div>
        )}
      </div>
    </div>
  )
}

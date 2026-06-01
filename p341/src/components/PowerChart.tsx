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
  TooltipItem,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { usePDStore } from '../store/pd-store'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export function PowerChart() {
  const { powerCurve } = usePDStore()

  const chartData = {
    labels: powerCurve.map((_, i) => i),
    datasets: [
      {
        label: '电压 (V)',
        data: powerCurve.map((p) => p.voltage),
        borderColor: '#00D4FF',
        backgroundColor: 'rgba(0, 212, 255, 0.1)',
        yAxisID: 'y',
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: '电流 (A)',
        data: powerCurve.map((p) => p.current),
        borderColor: '#00FF88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        yAxisID: 'y1',
        tension: 0.3,
        fill: false,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
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
        display: true,
        position: 'top' as const,
        labels: {
          color: '#9CA3AF',
          font: {
            family: "'Outfit', sans-serif",
          },
        },
      },
      tooltip: {
        backgroundColor: '#1A2733',
        titleColor: '#E2E8F0',
        bodyColor: '#9CA3AF',
        borderColor: '#2A3B4C',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: function (context: TooltipItem<'line'>) {
            const value = context.parsed.y ?? 0
            return `${context.dataset.label}: ${value.toFixed(2)}`
          },
        },
      },
    },
    scales: {
      x: {
        display: false,
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        min: 0,
        max: 20,
        grid: {
          color: 'rgba(42, 59, 76, 0.5)',
        },
        ticks: {
          color: '#6B7280',
          callback: function (value: number | string) {
            return `${value}V`
          },
        },
        title: {
          display: true,
          text: '电压 (V)',
          color: '#00D4FF',
        },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        min: 0,
        max: 5,
        grid: {
          drawOnChartArea: false,
        },
        ticks: {
          color: '#6B7280',
          callback: function (value: number | string) {
            return `${value}A`
          },
        },
        title: {
          display: true,
          text: '电流 (A)',
          color: '#00FF88',
        },
      },
    },
  }

  return (
    <div className="h-full bg-[#1A2733] p-6">
      <h2 className="text-lg font-semibold text-white mb-4">供电曲线</h2>
      <div className="h-[calc(100%-3rem)]">
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}

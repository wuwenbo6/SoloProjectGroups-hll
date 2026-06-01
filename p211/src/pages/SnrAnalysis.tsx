import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useFileStore, type SnrDataSet } from '@/store/useFileStore'
import { BarChart3, ArrowLeft, Filter } from 'lucide-react'
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const SYSTEM_COLORS: Record<string, string> = {
  G: '#00D4FF',
  R: '#EF4444',
  E: '#2DD4BF',
  C: '#F59E0B',
  J: '#A78BFA',
  S: '#FB923C',
  I: '#6B7280',
}

const SYSTEM_NAMES: Record<string, string> = {
  G: 'GPS',
  R: 'GLONASS',
  E: 'Galileo',
  C: 'BeiDou',
  J: 'QZSS',
  S: 'SBAS',
  I: 'IMES',
}

function formatTimeLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export default function SnrAnalysis() {
  const { fileId } = useParams<{ fileId: string }>()
  const { snrData, fileId: storedFileId } = useFileStore()
  const [fetchedSnr, setFetchedSnr] = useState<SnrDataSet[]>([])
  const [selectedSystem, setSelectedSystem] = useState<string>('all')
  const [selectedSatellite, setSelectedSatellite] = useState<string>('all')

  const data = fileId && storedFileId && fileId === storedFileId ? snrData : fetchedSnr

  useEffect(() => {
    if (!fileId || (storedFileId && fileId === storedFileId)) return
    fetch(`/api/snr/${fileId}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setFetchedSnr(res.satellites)
      })
      .catch(() => {})
  }, [fileId, storedFileId])

  const systems = useMemo(() => {
    const set = new Set(data.map((d) => d.system))
    return Array.from(set).sort()
  }, [data])

  const satellites = useMemo(() => {
    let filtered = data
    if (selectedSystem !== 'all') {
      filtered = filtered.filter((d) => d.system === selectedSystem)
    }
    const keys = new Set(filtered.map((d) => `${d.system}${String(d.svId).padStart(2, '0')}`))
    return Array.from(keys).sort()
  }, [data, selectedSystem])

  const filteredData = useMemo(() => {
    let result = data
    if (selectedSystem !== 'all') {
      result = result.filter((d) => d.system === selectedSystem)
    }
    if (selectedSatellite !== 'all') {
      result = result.filter((d) => `${d.system}${String(d.svId).padStart(2, '0')}` === selectedSatellite)
    }
    return result
  }, [data, selectedSystem, selectedSatellite])

  const chartData = useMemo(() => {
    if (filteredData.length === 0) return null

    const allTimes = new Set<string>()
    for (const ds of filteredData) {
      for (const entry of ds.snrData) {
        allTimes.add(entry.time)
      }
    }
    const timeLabels = Array.from(allTimes).sort().map(formatTimeLabel)

    const datasets = filteredData.map((ds) => {
      const color = SYSTEM_COLORS[ds.system] ?? '#6B7280'
      const satLabel = `${ds.system}${String(ds.svId).padStart(2, '0')} ${ds.signalType}`
      return {
        label: satLabel,
        data: ds.snrData.map((e) => e.snr),
        borderColor: color,
        backgroundColor: `${color}15`,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0.3,
        fill: false,
      }
    })

    return { labels: timeLabels, datasets }
  }, [filteredData])

  const chartOptions = useMemo(
    () => ({
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
            color: '#7BA3C4',
            font: { size: 10, family: 'DM Sans' },
            boxWidth: 12,
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: '#0D1B2E',
          borderColor: '#1E3A5F',
          borderWidth: 1,
          titleColor: '#FFFFFF',
          bodyColor: '#7BA3C4',
          titleFont: { size: 11, family: 'DM Sans' },
          bodyFont: { size: 10, family: 'JetBrains Mono' },
          padding: 10,
        },
      },
      scales: {
        x: {
          ticks: { color: '#3A5A7A', font: { size: 9, family: 'JetBrains Mono' }, maxTicksLimit: 20 },
          grid: { color: '#1E3A5F20' },
        },
        y: {
          min: 0,
          max: 55,
          ticks: { color: '#3A5A7A', font: { size: 9, family: 'JetBrains Mono' }, stepSize: 10 },
          grid: { color: '#1E3A5F20' },
          title: { display: true, text: 'SNR (dB-Hz)', color: '#5B8DB8', font: { size: 10, family: 'DM Sans' } },
        },
      },
    }),
    []
  )

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-[#5B8DB8] text-lg mb-4">未找到 SNR 数据</p>
        <Link to="/" className="text-[#00D4FF] hover:underline text-sm">
          返回上传页面
        </Link>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#00D4FF]" />
          <h1 className="text-2xl font-bold text-white">信噪比分析</h1>
        </div>
        <Link
          to={fileId ? `/overview/${fileId}` : '/'}
          className="inline-flex items-center gap-2 text-[#5B8DB8] hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回概览
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <Filter className="w-4 h-4 text-[#5B8DB8]" />
        <div className="flex items-center gap-3">
          <select
            value={selectedSystem}
            onChange={(e) => {
              setSelectedSystem(e.target.value)
              setSelectedSatellite('all')
            }}
            className="bg-[#0D1B2E] border border-[#1E3A5F] text-[#7BA3C4] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#00D4FF]"
          >
            <option value="all">全部系统</option>
            {systems.map((s) => (
              <option key={s} value={s}>
                {SYSTEM_NAMES[s] ?? s}
              </option>
            ))}
          </select>

          <select
            value={selectedSatellite}
            onChange={(e) => setSelectedSatellite(e.target.value)}
            className="bg-[#0D1B2E] border border-[#1E3A5F] text-[#7BA3C4] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#00D4FF]"
          >
            <option value="all">全部卫星</option>
            {satellites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <span className="text-[#3A5A7A] text-xs">
            {filteredData.length} 条信号数据
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] p-5 mb-8">
        <div className="h-[400px]">
          {chartData ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full text-[#3A5A7A] text-sm">
              暂无数据
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] overflow-hidden">
        <div className="p-4 border-b border-[#1E3A5F]">
          <h2 className="text-sm font-medium text-white">SNR 统计详情</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#1E3A5F]">
                <th className="text-left text-[#5B8DB8] font-medium px-4 py-3">卫星</th>
                <th className="text-left text-[#5B8DB8] font-medium px-4 py-3">系统</th>
                <th className="text-left text-[#5B8DB8] font-medium px-4 py-3">信号</th>
                <th className="text-right text-[#5B8DB8] font-medium px-4 py-3">平均</th>
                <th className="text-right text-[#5B8DB8] font-medium px-4 py-3">中位数</th>
                <th className="text-right text-[#5B8DB8] font-medium px-4 py-3">最大值</th>
                <th className="text-right text-[#5B8DB8] font-medium px-4 py-3">最小值</th>
                <th className="text-left text-[#5B8DB8] font-medium px-4 py-3">质量</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((ds, idx) => {
                const quality = ds.stats.avg >= 40 ? '优' : ds.stats.avg >= 30 ? '良' : ds.stats.avg >= 20 ? '中' : '差'
                const qualityColor = ds.stats.avg >= 40 ? '#2DD4BF' : ds.stats.avg >= 30 ? '#00D4FF' : ds.stats.avg >= 20 ? '#F59E0B' : '#EF4444'
                return (
                  <tr
                    key={`${ds.system}_${ds.svId}_${ds.signalType}`}
                    className={`${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0A1628]/50'} border-b border-[#1E3A5F]/50`}
                  >
                    <td className="px-4 py-3 text-white font-mono">
                      {ds.system}{String(ds.svId).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-3 text-[#7BA3C4]">
                      {SYSTEM_NAMES[ds.system] ?? ds.system}
                    </td>
                    <td className="px-4 py-3 text-[#7BA3C4] font-mono">
                      {ds.signalType}
                    </td>
                    <td className="px-4 py-3 text-right text-white font-mono">
                      {ds.stats.avg.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#7BA3C4] font-mono">
                      {ds.stats.median.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right text-[#2DD4BF] font-mono">
                      {ds.stats.max}
                    </td>
                    <td className="px-4 py-3 text-right font-mono" style={{ color: ds.stats.min < 20 ? '#EF4444' : '#7BA3C4' }}>
                      {ds.stats.min}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${qualityColor}20`, color: qualityColor }}
                      >
                        {quality}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

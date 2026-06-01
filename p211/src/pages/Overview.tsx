import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useFileStore, type SatelliteInfo } from '@/store/useFileStore'
import { Clock, Satellite, Radio, Timer, Download, Copy, Check, BarChart3, FileText, Zap, AlertTriangle, MapPin, RadioTower, Sigma, Map } from 'lucide-react'

const SYSTEM_NAMES: Record<string, string> = {
  G: 'GPS',
  R: 'GLONASS',
  E: 'Galileo',
  C: 'BeiDou',
  J: 'QZSS',
  S: 'SBAS',
  I: 'IMES',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false })
}

function formatLatLon(value: number, isLat: boolean): string {
  const deg = Math.abs(value)
  const degrees = Math.floor(deg)
  const minutes = (deg - degrees) * 60
  const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W')
  return `${degrees}°${minutes.toFixed(4)}'${direction}`
}

function formatHeight(meters: number): string {
  return `${meters.toFixed(2)} m`
}

export default function Overview() {
  const { fileId } = useParams<{ fileId: string }>()
  const { fileName, fileSize, stats, fileId: storedFileId, position } = useFileStore()
  const { mwSummary } = useFileStore()
  const [rinexContent, setRinexContent] = useState<string | null>(null)
  const [rinexLoading, setRinexLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rtcmInfo, setRtcmInfo] = useState<{
    messageCount: number
    totalSize: number
  } | null>(null)
  const [rtcmLoading, setRtcmLoading] = useState(false)

  const hasData = fileId && storedFileId && fileId === storedFileId && stats

  useEffect(() => {
    if (!fileId) return
    setRinexLoading(true)
    fetch(`/api/rinex/${fileId}`)
      .then((res) => res.text())
      .then(setRinexContent)
      .catch(() => setRinexContent(null))
      .finally(() => setRinexLoading(false))
  }, [fileId])

  useEffect(() => {
    if (!fileId) return
    setRtcmLoading(true)
    fetch(`/api/rtcm/${fileId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setRtcmInfo({ messageCount: data.messageCount, totalSize: data.totalSize })
        }
      })
      .catch(() => setRtcmInfo(null))
      .finally(() => setRtcmLoading(false))
  }, [fileId])

  const handleCopy = async () => {
    if (!rinexContent) return
    await navigator.clipboard.writeText(rinexContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownloadRinex = () => {
    if (!fileId) return
    window.open(`/api/rinex/${fileId}/download`, '_blank')
  }

  const handleDownloadRtcm = () => {
    if (!fileId) return
    window.open(`/api/rtcm/${fileId}/download`, '_blank')
  }

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8">
        <p className="text-[#5B8DB8] text-lg mb-4">未找到解析数据</p>
        <Link to="/" className="text-[#00D4FF] hover:underline text-sm">
          返回上传页面
        </Link>
      </div>
    )
  }

  const totalCycleSlips = mwSummary.reduce((acc, m) => acc + m.cycleSlipCount, 0)
  const totalHalfCycles = mwSummary.reduce((acc, m) => acc + m.halfCycleCount, 0)
  const satsWithSlips = mwSummary.filter((m) => m.cycleSlipCount > 0).length

  const statCards = [
    {
      icon: Clock,
      label: '观测历元',
      value: stats.epochCount.toLocaleString(),
      color: '#00D4FF',
    },
    {
      icon: Satellite,
      label: '卫星数量',
      value: stats.satelliteCount.toString(),
      color: '#2DD4BF',
    },
    {
      icon: Zap,
      label: '周跳总数',
      value: totalCycleSlips.toString(),
      color: totalCycleSlips > 0 ? '#F59E0B' : '#2DD4BF',
      badge: satsWithSlips > 0 ? `${satsWithSlips} 颗卫星` : null,
    },
    {
      icon: AlertTriangle,
      label: '半周模糊度',
      value: totalHalfCycles.toString(),
      color: totalHalfCycles > 0 ? '#EF4444' : '#2DD4BF',
      badge: mwSummary.filter((m) => m.halfCycleCount > 0).length > 0
        ? `${mwSummary.filter((m) => m.halfCycleCount > 0).length} 颗卫星` : null,
    },
  ]

  const systemGroups: Record<string, SatelliteInfo[]> = {}
  for (const sat of stats.satellites) {
    if (!systemGroups[sat.system]) {
      systemGroups[sat.system] = []
    }
    systemGroups[sat.system].push(sat)
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-5 h-5 text-[#00D4FF]" />
          <h1 className="text-2xl font-bold text-white">{fileName}</h1>
        </div>
        <p className="text-[#5B8DB8] text-sm">
          文件大小 {formatFileSize(fileSize ?? 0)}
          {stats.timeRange && (
            <>
              {' · '}
              {formatTime(stats.timeRange.start)} — {formatTime(stats.timeRange.end)} (UTC)
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="p-5 rounded-xl bg-[#0D1B2E] border border-[#1E3A5F]"
          >
            <div className="flex items-center gap-2 mb-3">
              <card.icon className="w-4 h-4" style={{ color: card.color }} />
              <span className="text-[#5B8DB8] text-xs">{card.label}</span>
              {card.badge && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#F59E0B]/10 text-[#F59E0B]">
                  {card.badge}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {position && (
        <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-sm font-medium text-white">伪距单点定位 (SPP)</h2>
            <div className="ml-auto flex items-center gap-4 text-[10px] text-[#3A5A7A]">
              <div className="flex items-center gap-1">
                <Satellite className="w-3 h-3" />
                {position.avgSats.toFixed(1)} 颗卫星
              </div>
              <div className="flex items-center gap-1">
                <Sigma className="w-3 h-3" />
                PDOP {position.avgPdop.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#070E1A] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Map className="w-4 h-4 text-[#7BA3C4]" />
                <span className="text-[#5B8DB8] text-xs">纬度</span>
              </div>
              <p className="text-white font-mono text-sm">{formatLatLon(position.lat, true)}</p>
              <p className="text-[#3A5A7A] text-xs mt-1">
                ±{(position.sigmaLat * 111000).toFixed(2)} m
              </p>
            </div>
            <div className="bg-[#070E1A] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Map className="w-4 h-4 text-[#7BA3C4]" />
                <span className="text-[#5B8DB8] text-xs">经度</span>
              </div>
              <p className="text-white font-mono text-sm">{formatLatLon(position.lon, false)}</p>
              <p className="text-[#3A5A7A] text-xs mt-1">
                ±{(position.sigmaLon * 111000 * Math.cos(position.lat * Math.PI / 180)).toFixed(2)} m
              </p>
            </div>
            <div className="bg-[#070E1A] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-[#7BA3C4]" />
                <span className="text-[#5B8DB8] text-xs">海拔高度</span>
              </div>
              <p className="text-white font-mono text-sm">{formatHeight(position.height)}</p>
              <p className="text-[#3A5A7A] text-xs mt-1">
                ±{position.sigmaHeight.toFixed(2)} m
              </p>
            </div>
            <div className="bg-[#070E1A] rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <RadioTower className="w-4 h-4 text-[#7BA3C4]" />
                <span className="text-[#5B8DB8] text-xs">定位精度</span>
              </div>
              <p className="text-white font-mono text-sm">3D</p>
              <p className="text-[#3A5A7A] text-xs mt-1">
                3σ ≈ {(position.sigmaLat * 111000 * 3).toFixed(1)} m
              </p>
            </div>
          </div>
        </div>
      )}

      {mwSummary.length > 0 && (
        <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] p-5 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-[#F59E0B]" />
            <h2 className="text-sm font-medium text-white">MW 组合周跳检测</h2>
            <span className="text-[#3A5A7A] text-xs">基于 Melbourne-Wübbena 组合</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1E3A5F]">
                  <th className="text-left text-[#5B8DB8] font-medium px-3 py-2">卫星</th>
                  <th className="text-left text-[#5B8DB8] font-medium px-3 py-2">信号对</th>
                  <th className="text-right text-[#5B8DB8] font-medium px-3 py-2">历元数</th>
                  <th className="text-right text-[#5B8DB8] font-medium px-3 py-2">MW 均值 (m)</th>
                  <th className="text-right text-[#5B8DB8] font-medium px-3 py-2">MW 标准差 (m)</th>
                  <th className="text-right text-[#5B8DB8] font-medium px-3 py-2">周跳</th>
                  <th className="text-right text-[#5B8DB8] font-medium px-3 py-2">半周模糊度</th>
                </tr>
              </thead>
              <tbody>
                {mwSummary.map((mw, idx) => (
                  <tr
                    key={`${mw.system}${mw.svId}_${mw.signalType1}_${mw.signalType2}`}
                    className={`${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0A1628]/50'} border-b border-[#1E3A5F]/30`}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1">
                        <span
                          className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center"
                          style={{ backgroundColor: `${mw.system === 'G' ? '#00D4FF' : mw.system === 'C' ? '#F59E0B' : mw.system === 'E' ? '#2DD4BF' : mw.system === 'R' ? '#EF4444' : '#A78BFA'}20`, color: mw.system === 'G' ? '#00D4FF' : mw.system === 'C' ? '#F59E0B' : mw.system === 'E' ? '#2DD4BF' : mw.system === 'R' ? '#EF4444' : '#A78BFA' }}
                        >
                          {mw.system}
                        </span>
                        <span className="text-white font-mono">{String(mw.svId).padStart(2, '0')}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[#7BA3C4] font-mono">
                      {mw.signalType1} / {mw.signalType2}
                    </td>
                    <td className="px-3 py-2 text-right text-white font-mono">{mw.epochCount}</td>
                    <td className="px-3 py-2 text-right text-white font-mono">{mw.meanMW.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right text-white font-mono">{mw.stdMW.toFixed(4)}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`font-mono ${mw.cycleSlipCount > 0 ? 'text-[#F59E0B]' : 'text-[#2DD4BF]'}`}
                      >
                        {mw.cycleSlipCount}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`font-mono ${mw.halfCycleCount > 0 ? 'text-[#EF4444]' : 'text-[#2DD4BF]'}`}
                      >
                        {mw.halfCycleCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] p-5">
          <h2 className="text-sm font-medium text-white mb-4">卫星列表</h2>
          <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(systemGroups).map(([system, sats]) => (
              <div key={system}>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
                    style={{ backgroundColor: `${system === 'G' ? '#00D4FF' : system === 'C' ? '#F59E0B' : system === 'E' ? '#2DD4BF' : system === 'R' ? '#EF4444' : '#A78BFA'}20`, color: system === 'G' ? '#00D4FF' : system === 'C' ? '#F59E0B' : system === 'E' ? '#2DD4BF' : system === 'R' ? '#EF4444' : '#A78BFA' }}
                  >
                    {system}
                  </span>
                  <span className="text-[#5B8DB8] text-xs">{SYSTEM_NAMES[system] ?? system}</span>
                  <span className="text-[#3A5A7A] text-xs">({sats.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sats.map((sat) => (
                    <span
                      key={`${sat.system}${sat.svId}_${sat.signalType}`}
                      className="px-2 py-1 rounded-md bg-[#1E3A5F]/50 text-[#7BA3C4] text-xs font-mono"
                    >
                      {system}{String(sat.svId).padStart(2, '0')} {sat.signalType}
                      <span className="text-[#3A5A7A] ml-1">{sat.avgSnr.toFixed(0)}dB</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-[#0D1B2E] border border-[#1E3A5F] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-medium text-white">导出数据</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-lg bg-[#1E3A5F]/50 text-[#7BA3C4] hover:text-white transition-colors"
                  title="复制"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={handleDownloadRinex}
                  className="p-1.5 rounded-lg bg-[#1E3A5F]/50 text-[#7BA3C4] hover:text-white transition-colors"
                  title="下载 RINEX"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {rtcmInfo ? (
                <button
                  onClick={handleDownloadRtcm}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00D4FF]/10 border border-[#00D4FF]/30 text-[#00D4FF] hover:bg-[#00D4FF]/20 transition-colors text-xs"
                >
                  <RadioTower className="w-3.5 h-3.5" />
                  RTCM 3.2
                  <span className="text-[#7BA3C4] ml-1">({formatFileSize(rtcmInfo.totalSize)})</span>
                </button>
              ) : rtcmLoading ? (
                <span className="text-[#5B8DB8] text-xs animate-pulse">加载 RTCM...</span>
              ) : null}
            </div>
          </div>
          <div className="bg-[#070E1A] rounded-lg p-4 font-mono text-xs text-[#7BA3C4] max-h-80 overflow-auto custom-scrollbar leading-relaxed">
            {rinexLoading ? (
              <span className="text-[#3A5A7A]">加载中...</span>
            ) : rinexContent ? (
              <pre className="whitespace-pre">{rinexContent.slice(0, 5000)}{rinexContent.length > 5000 ? '\n\n... (显示前5000字符，请下载查看完整文件)' : ''}</pre>
            ) : (
              <span className="text-[#3A5A7A]">无法加载 RINEX 内容</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          to={`/snr/${fileId}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#2DD4BF] text-[#0A1628] font-medium text-sm hover:shadow-lg hover:shadow-[#00D4FF]/20 transition-all"
        >
          <BarChart3 className="w-4 h-4" />
          查看信噪比分析
        </Link>
      </div>
    </div>
  )
}

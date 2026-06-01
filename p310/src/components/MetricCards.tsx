import { Activity, AlertTriangle, Wifi, BarChart3 } from 'lucide-react'
import type { ParseResult } from '@/types'

interface MetricCardProps {
  latest: ParseResult | null
}

function getLossLevel(rate: number): { color: string; bg: string; label: string } {
  if (rate <= 2) return { color: 'text-brand-400', bg: 'from-brand-500/20 to-brand-900/20', label: '优' }
  if (rate <= 5) return { color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-900/20', label: '中' }
  return { color: 'text-red-400', bg: 'from-red-500/20 to-red-900/20', label: '差' }
}

function getMosLevel(mos: number): { color: string; bg: string; label: string } {
  if (mos >= 4.0) return { color: 'text-brand-400', bg: 'from-brand-500/20 to-brand-900/20', label: '优' }
  if (mos >= 3.2) return { color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-900/20', label: '中' }
  return { color: 'text-red-400', bg: 'from-red-500/20 to-red-900/20', label: '差' }
}

function getJitterLevel(jitter: number): { color: string; bg: string; label: string } {
  if (jitter <= 40) return { color: 'text-brand-400', bg: 'from-brand-500/20 to-brand-900/20', label: '优' }
  if (jitter <= 80) return { color: 'text-amber-400', bg: 'from-amber-500/20 to-amber-900/20', label: '中' }
  return { color: 'text-red-400', bg: 'from-red-500/20 to-red-900/20', label: '差' }
}

export default function MetricCards({ latest }: MetricCardProps) {
  const lossRate = latest?.loss_rate ?? 0
  const jitterDelay = latest?.jitter_buffer_delay ?? 0
  const mosScore = latest?.mos_cq ?? 0
  const mosP564 = latest?.mos_p564 ?? 0
  const codec = latest?.codec ?? 'G.711'

  const lossLevel = getLossLevel(lossRate)
  const jitterLevel = getJitterLevel(jitterDelay)
  const mosLevel = getMosLevel(mosScore)
  const mosP564Level = getMosLevel(mosP564)

  const cards = [
    {
      title: '丢包率',
      value: lossRate.toFixed(2),
      unit: '%',
      level: lossLevel,
      icon: Wifi,
      description: latest ? `丢弃率 ${latest.discard_rate.toFixed(2)}%` : '暂无数据',
    },
    {
      title: '抖动缓冲延迟',
      value: jitterDelay.toFixed(0),
      unit: 'ms',
      level: jitterLevel,
      icon: Activity,
      description: latest ? `R因子 ${latest.r_factor.toFixed(1)}` : '暂无数据',
    },
    {
      title: 'MOS 评分 (报文携带)',
      value: mosScore.toFixed(1),
      unit: '',
      level: mosLevel,
      icon: AlertTriangle,
      description: latest ? `MOS-LQ ${latest.mos_lq.toFixed(1)}` : '暂无数据',
    },
    {
      title: 'MOS 评分 (P.564 估算)',
      value: mosP564.toFixed(2),
      unit: '',
      level: mosP564Level,
      icon: BarChart3,
      description: latest ? `编解码 ${codec}` : '暂无数据',
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div
            key={card.title}
            className={`relative overflow-hidden bg-gradient-to-br ${card.level.bg} backdrop-blur-sm rounded-2xl border border-slate-700/50 p-5 transition-all hover:scale-[1.02] hover:shadow-xl`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-400 font-medium">{card.title}</p>
                <div className="flex items-baseline gap-1.5 mt-2">
                  <span className={`text-3xl font-bold font-mono ${card.level.color}`}>
                    {card.value}
                  </span>
                  <span className="text-sm text-slate-500">{card.unit}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">{card.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className={`p-2 rounded-xl bg-slate-800/50 ${card.level.color}`}>
                  <Icon size={20} />
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  card.level.label === '优'
                    ? 'bg-brand-500/20 text-brand-400'
                    : card.level.label === '中'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {card.level.label}
                </span>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full opacity-5 bg-white" />
          </div>
        )
      })}
    </div>
  )
}

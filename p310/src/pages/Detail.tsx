import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useXrStore } from '@/store'
import type { ReportBlock } from '@/types'

function BlockPanel({ block }: { block: ReportBlock }) {
  const [open, setOpen] = useState(block.block_type === 7)

  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
            block.block_type === 7
              ? 'bg-brand-500/20 text-brand-400'
              : 'bg-slate-600/30 text-slate-400'
          }`}>
            BT={block.block_type}
          </span>
          <span className="text-sm text-slate-200 font-medium">{block.block_type_name}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>
      {open && (
        <div className="p-4 bg-slate-800/20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(block.fields).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-3 py-2 bg-slate-800/50 rounded-lg">
                <span className="text-xs text-slate-500 font-medium">{key}</span>
                <span className="text-xs text-slate-300 font-mono">
                  {Array.isArray(value) ? `[${value.length} items]` : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ssrcHex(ssrc: number): string {
  return '0x' + ssrc.toString(16).toUpperCase().padStart(8, '0')
}

export default function Detail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { detail, loading, loadDetail } = useXrStore()

  useEffect(() => {
    if (id) loadDetail(Number(id))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-500 animate-pulse">加载中...</div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">未找到该报告</p>
          <button onClick={() => navigate('/')} className="text-brand-400 hover:text-brand-300 text-sm">
            返回仪表盘
          </button>
        </div>
      </div>
    )
  }

  const summaryItems = [
    { label: '时间', value: detail.timestamp.replace('T', ' ').slice(0, 19) },
    { label: 'SSRC', value: ssrcHex(detail.ssrc) },
    { label: '编解码器', value: detail.codec || '-' },
    { label: '丢包率', value: `${detail.loss_rate.toFixed(2)}%` },
    { label: '丢弃率', value: `${detail.discard_rate.toFixed(2)}%` },
    { label: '抖动缓冲延迟', value: `${detail.jitter_buffer_delay.toFixed(0)}ms` },
    { label: 'MOS-CQ', value: detail.mos_cq.toFixed(1) },
    { label: 'MOS-P564', value: detail.mos_p564?.toFixed(1) || '-' },
    { label: 'MOS-LQ', value: detail.mos_lq.toFixed(1) },
    { label: 'R因子', value: detail.r_factor.toFixed(1) },
  ]

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-100">报文详情</h1>
            <p className="text-xs text-slate-500">ID: {detail.id} · SSRC: {ssrcHex(detail.ssrc)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
          <h2 className="text-base font-semibold text-slate-100 mb-4">核心指标</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {summaryItems.map((item) => (
              <div key={item.label} className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                <p className="text-sm font-mono font-semibold text-slate-200">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {detail.mos_p564_detail && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
            <h2 className="text-base font-semibold text-slate-100 mb-4">P.564 MOS 估算详情</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">最终 MOS</p>
                <p className="text-sm font-mono font-semibold text-brand-400">{detail.mos_p564_detail.mos.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">基础 MOS</p>
                <p className="text-sm font-mono font-semibold text-slate-200">{detail.mos_p564_detail.base_mos.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">丢包分量</p>
                <p className="text-sm font-mono font-semibold text-amber-400">-{detail.mos_p564_detail.loss_component.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">抖动惩罚</p>
                <p className="text-sm font-mono font-semibold text-red-400">-{detail.mos_p564_detail.jitter_penalty.toFixed(2)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">输入丢包率</p>
                <p className="text-sm font-mono font-semibold text-slate-200">{detail.mos_p564_detail.loss_rate.toFixed(2)}%</p>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">输入抖动</p>
                <p className="text-sm font-mono font-semibold text-slate-200">{detail.mos_p564_detail.jitter_delay.toFixed(0)}ms</p>
              </div>
            </div>
            {detail.mos_p564_detail.comparisons && Object.keys(detail.mos_p564_detail.comparisons).length > 0 && (
              <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">其他编解码器对比</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(detail.mos_p564_detail.comparisons).map(([codec, mos]) => (
                  <div key={codec} className="bg-slate-800/30 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{codec}</span>
                    <span className="text-xs font-mono font-semibold text-slate-300">{mos.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-100">Report Blocks</h2>
          {detail.report_blocks?.map((block, i) => (
            <BlockPanel key={i} block={block} />
          ))}
        </div>
      </main>
    </div>
  )
}

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { HistoryResponse } from '@/types'

interface HistoryTableProps {
  data: HistoryResponse | null
  page: number
  onPageChange: (page: number) => void
}

function ssrcHex(ssrc: number): string {
  return '0x' + ssrc.toString(16).toUpperCase().padStart(8, '0')
}

function mosColor(mos: number): string {
  if (mos >= 4.0) return 'text-brand-400'
  if (mos >= 3.2) return 'text-amber-400'
  return 'text-red-400'
}

function lossColor(rate: number): string {
  if (rate <= 2) return 'text-brand-400'
  if (rate <= 5) return 'text-amber-400'
  return 'text-red-400'
}

export default function HistoryTable({ data, page, onPageChange }: HistoryTableProps) {
  const navigate = useNavigate()
  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  if (!data || data.records.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">历史记录</h2>
        <div className="h-32 flex items-center justify-center text-slate-500 text-sm">
          暂无历史记录
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-100">历史记录</h2>
        <span className="text-xs text-slate-500">共 {data.total} 条</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left py-3 px-2 text-slate-400 font-medium">时间</th>
              <th className="text-left py-3 px-2 text-slate-400 font-medium">SSRC</th>
              <th className="text-left py-3 px-2 text-slate-400 font-medium">编解码</th>
              <th className="text-right py-3 px-2 text-slate-400 font-medium">丢包率</th>
              <th className="text-right py-3 px-2 text-slate-400 font-medium">抖动延迟</th>
              <th className="text-right py-3 px-2 text-slate-400 font-medium">MOS-CQ</th>
              <th className="text-right py-3 px-2 text-slate-400 font-medium">MOS-P564</th>
              <th className="text-right py-3 px-2 text-slate-400 font-medium">R因子</th>
            </tr>
          </thead>
          <tbody>
            {data.records.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/detail/${r.id}`)}
                className={`border-b border-slate-700/30 cursor-pointer transition-colors hover:bg-slate-700/30 ${
                  i % 2 === 0 ? 'bg-slate-800/20' : ''
                }`}
              >
                <td className="py-2.5 px-2 text-slate-300 font-mono text-xs">
                  {r.timestamp.replace('T', ' ').slice(0, 19)}
                </td>
                <td className="py-2.5 px-2 text-slate-400 font-mono text-xs">
                  {ssrcHex(r.ssrc)}
                </td>
                <td className="py-2.5 px-2 text-slate-300 font-mono text-xs">
                  {r.codec || '-'}
                </td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${lossColor(r.loss_rate)}`}>
                  {r.loss_rate.toFixed(2)}%
                </td>
                <td className="py-2.5 px-2 text-right text-slate-300 font-mono text-xs">
                  {r.jitter_buffer_delay.toFixed(0)}ms
                </td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${mosColor(r.mos_cq)}`}>
                  {r.mos_cq.toFixed(1)}
                </td>
                <td className={`py-2.5 px-2 text-right font-mono text-xs ${mosColor(r.mos_p564)}`}>
                  {r.mos_p564?.toFixed(1) || '-'}
                </td>
                <td className="py-2.5 px-2 text-right text-slate-400 font-mono text-xs">
                  {r.r_factor.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-500 font-mono">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

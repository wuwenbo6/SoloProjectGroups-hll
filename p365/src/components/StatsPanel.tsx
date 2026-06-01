import { useDDSStore } from '@/store/ddsStore'
import { Send, CheckCircle, XCircle, Filter } from 'lucide-react'

function RingProgress({ value, max, color, label, icon }: {
  value: number
  max: number
  color: string
  label: string
  icon: React.ReactNode
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#1E293B" strokeWidth="4" />
          <circle
            cx="40" cy="40" r="36" fill="none"
            stroke={color}
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white font-mono">{value}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
    </div>
  )
}

export default function StatsPanel() {
  const { sentCount, receivedCount, droppedCount, contentFilterCount } = useDDSStore()

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white tracking-wide mb-6">实时统计</h2>
      <div className="flex items-center justify-around">
        <RingProgress
          value={sentCount}
          max={Math.max(sentCount, 1)}
          color="#3B82F6"
          label="已发送"
          icon={<Send className="w-3.5 h-3.5 text-blue-400" />}
        />
        <RingProgress
          value={receivedCount}
          max={Math.max(sentCount, 1)}
          color="#10B981"
          label="已接收"
          icon={<CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
        />
        <RingProgress
          value={droppedCount}
          max={Math.max(sentCount, 1)}
          color="#EF4444"
          label="时间拦截"
          icon={<XCircle className="w-3.5 h-3.5 text-red-400" />}
        />
        <RingProgress
          value={contentFilterCount}
          max={Math.max(sentCount, 1)}
          color="#A855F7"
          label="内容拦截"
          icon={<Filter className="w-3.5 h-3.5 text-purple-400" />}
        />
      </div>
      <div className="mt-6 grid grid-cols-4 gap-3">
        <div className="bg-[#0F172A] rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-blue-400 font-mono">{sentCount}</div>
          <div className="text-xs text-slate-500 mt-1">发送总数</div>
        </div>
        <div className="bg-[#0F172A] rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400 font-mono">{receivedCount}</div>
          <div className="text-xs text-slate-500 mt-1">接收总数</div>
        </div>
        <div className="bg-[#0F172A] rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-400 font-mono">{droppedCount}</div>
          <div className="text-xs text-slate-500 mt-1">时间过滤</div>
        </div>
        <div className="bg-[#0F172A] rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-purple-400 font-mono">{contentFilterCount}</div>
          <div className="text-xs text-slate-500 mt-1">内容过滤</div>
        </div>
      </div>
      {sentCount > 0 && (
        <div className="mt-4 space-y-3">
          <div className="bg-[#0F172A] rounded-xl p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">总拦截率</span>
              <span className="font-mono text-amber-400 font-semibold">
                {(((droppedCount + contentFilterCount) / sentCount) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-[#1E293B] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-red-500 rounded-full transition-all duration-500"
                style={{ width: `${((droppedCount + contentFilterCount) / sentCount) * 100}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#0F172A] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">时间过滤</span>
                <span className="text-red-400 font-mono">{droppedCount}</span>
              </div>
              <div className="h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${(droppedCount / sentCount) * 100}%` }}
                />
              </div>
            </div>
            <div className="bg-[#0F172A] rounded-xl p-2.5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-400">内容过滤</span>
                <span className="text-purple-400 font-mono">{contentFilterCount}</span>
              </div>
              <div className="h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${(contentFilterCount / sentCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

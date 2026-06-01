import { useDDSStore } from '@/store/ddsStore'
import { Activity } from 'lucide-react'

export default function Header() {
  const { running, publishRate, minSeparationMs } = useDDSStore()

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-[#0A0E17]/80 backdrop-blur-md border-b border-[#1E293B]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">DDS Simulator</h1>
          <p className="text-xs text-slate-500">Time-Based Filter · QoS Policy Visualization</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {running && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">运行中</span>
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>
            频率: <span className="text-blue-400 font-mono">{publishRate}</span> msg/s
          </span>
          <span>
            分离时间: <span className="text-amber-400 font-mono">{minSeparationMs}</span> ms
          </span>
        </div>
      </div>
    </header>
  )
}

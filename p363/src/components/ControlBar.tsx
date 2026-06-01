import { useState } from 'react'
import { useSimulatorStore } from '@/store'
import { Play, Pause, Square, ShieldCheck, ArrowLeftRight, Loader2 } from 'lucide-react'

const API_BASE = '/api'

export default function ControlBar() {
  const simState = useSimulatorStore((s) => s.simState)
  const setSimState = useSimulatorStore((s) => s.setSimState)
  const reset = useSimulatorStore((s) => s.reset)
  const setFlushStatus = useSimulatorStore((s) => s.setFlushStatus)
  const flushing = useSimulatorStore((s) => s.flushing)
  const flushStatus = useSimulatorStore((s) => s.flushStatus)
  const [switching, setSwitching] = useState(false)

  const handleStart = async () => {
    try {
      const res = await fetch(`${API_BASE}/simulate/start`, { method: 'POST' })
      const data = await res.json()
      setSimState(data.state)
    } catch {}
  }

  const handlePause = async () => {
    try {
      const res = await fetch(`${API_BASE}/simulate/pause`, { method: 'POST' })
      const data = await res.json()
      setSimState(data.state)
    } catch {}
  }

  const handleStop = async () => {
    try {
      const res = await fetch(`${API_BASE}/simulate/stop`, { method: 'POST' })
      const data = await res.json()
      setSimState(data.state)
      reset()
    } catch {}
  }

  const handleConsistencyCheck = async () => {
    try {
      await fetch(`${API_BASE}/consistency/check`, { method: 'POST' })
    } catch {}
  }

  const handleFlushAndSwitch = async () => {
    if (flushing || switching) return
    setSwitching(true)
    setFlushStatus({ status: 'flushing' })
    try {
      const res = await fetch(`${API_BASE}/flush-and-switch`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'success') {
        setSimState('running')
      }
    } catch {
      setFlushStatus({ status: 'error', message: 'Flush & switch failed' })
    } finally {
      setSwitching(false)
    }
  }

  const handleOrphanCleanup = async () => {
    try {
      await fetch(`${API_BASE}/orphan/cleanup`, { method: 'POST' })
    } catch {}
  }

  return (
    <div className="flex items-center gap-2">
      {simState === 'idle' && (
        <button
          onClick={handleStart}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-xs font-mono
            hover:bg-cyan-400/20 hover:shadow-[0_0_12px_rgba(0,240,255,0.15)] transition-all duration-200"
        >
          <Play className="w-3.5 h-3.5" />
          启动模拟
        </button>
      )}
      {simState === 'running' && (
        <>
          <button
            onClick={handlePause}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-mono
              hover:bg-amber-400/20 hover:shadow-[0_0_12px_rgba(251,191,36,0.15)] transition-all duration-200"
          >
            <Pause className="w-3.5 h-3.5" />
            暂停
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-400/10 border border-red-400/30 text-red-400 text-xs font-mono
              hover:bg-red-400/20 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] transition-all duration-200"
          >
            <Square className="w-3.5 h-3.5" />
            停止
          </button>
          <button
            onClick={handleFlushAndSwitch}
            disabled={flushing || switching}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-400/10 border border-purple-400/30 text-purple-400 text-xs font-mono
              hover:bg-purple-400/20 hover:shadow-[0_0_12px_rgba(168,85,247,0.15)] transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {(flushing || switching) ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowLeftRight className="w-3.5 h-3.5" />
            )}
            {flushStatus?.status === 'flushing' ? `Flush中 (${flushStatus.pending_count})` : 'Flush & Switch'}
          </button>
        </>
      )}
      {simState === 'paused' && (
        <>
          <button
            onClick={handleStart}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 text-xs font-mono
              hover:bg-cyan-400/20 hover:shadow-[0_0_12px_rgba(0,240,255,0.15)] transition-all duration-200"
          >
            <Play className="w-3.5 h-3.5" />
            继续
          </button>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-400/10 border border-red-400/30 text-red-400 text-xs font-mono
              hover:bg-red-400/20 hover:shadow-[0_0_12px_rgba(239,68,68,0.15)] transition-all duration-200"
          >
            <Square className="w-3.5 h-3.5" />
            停止
          </button>
        </>
      )}
      {simState === 'flushing' && (
        <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Flushing... {flushStatus?.pending_count ?? 0} 待处理
        </div>
      )}
      {simState === 'switching' && (
        <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-400/10 border border-purple-400/30 text-purple-400 text-xs font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          切换主备角色...
        </div>
      )}
      {simState !== 'idle' && (
        <>
          <button
            onClick={handleConsistencyCheck}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-gray-400 text-xs font-mono
              hover:bg-white/[0.06] hover:text-gray-200 transition-all duration-200"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            一致性检测
          </button>
          <button
            onClick={handleOrphanCleanup}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-gray-400 text-xs font-mono
              hover:bg-white/[0.06] hover:text-gray-200 transition-all duration-200"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            孤儿对象清理
          </button>
        </>
      )}
    </div>
  )
}

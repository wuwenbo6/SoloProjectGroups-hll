import { useState, useCallback } from 'react'
import { useDDSStore } from '@/store/ddsStore'
import { Play, Square, RotateCcw, Wifi, WifiOff } from 'lucide-react'

export default function ControlPanel() {
  const { running, publishRate, minSeparationMs, connected, start, stop, reset, configure } = useDDSStore()
  const [localRate, setLocalRate] = useState(publishRate)
  const [localSep, setLocalSep] = useState(minSeparationMs)

  const handleStart = useCallback(() => {
    start(localRate, localSep)
  }, [localRate, localSep, start])

  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  const handleReset = useCallback(() => {
    reset()
  }, [reset])

  const handleRateChange = useCallback((val: number) => {
    setLocalRate(val)
    if (running) configure(val, localSep)
  }, [running, localSep, configure])

  const handleSepChange = useCallback((val: number) => {
    setLocalSep(val)
    if (running) configure(localRate, val)
  }, [running, localRate, configure])

  return (
    <div className="bg-[#111827] border border-[#1E293B] rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white tracking-wide">DDS 控制面板</h2>
        <div className="flex items-center gap-2 text-sm">
          {connected ? (
            <><Wifi className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400">已连接</span></>
          ) : (
            <><WifiOff className="w-4 h-4 text-red-400" /><span className="text-red-400">未连接</span></>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-2">
            发布频率 <span className="text-emerald-400 font-mono">{localRate}</span> 消息/秒
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={localRate}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>1</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">
            最小分离时间 <span className="text-amber-400 font-mono">{localSep}</span> ms
          </label>
          <input
            type="range"
            min={10}
            max={2000}
            step={10}
            value={localSep}
            onChange={(e) => handleSepChange(Number(e.target.value))}
            className="w-full h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>10ms</span>
            <span>1000ms</span>
            <span>2000ms</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!running ? (
          <button
            onClick={handleStart}
            disabled={!connected}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-emerald-600/20"
          >
            <Play className="w-4 h-4" />
            启动发布
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg shadow-red-600/20"
          >
            <Square className="w-4 h-4" />
            停止
          </button>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1E293B] hover:bg-[#2A3548] text-slate-300 rounded-xl font-medium transition-all duration-200"
        >
          <RotateCcw className="w-4 h-4" />
          重置
        </button>
      </div>
    </div>
  )
}

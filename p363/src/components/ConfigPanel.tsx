import { useSimulatorStore } from '@/store'
import { Settings, RotateCcw, Info } from 'lucide-react'
import type { SimConfig, ReplicationMode, ConflictResolution } from '@/types'

interface ConfigField {
  key: keyof SimConfig
  label: string
  unit: string
  min: number
  max: number
  step: number
}

const fields: ConfigField[] = [
  { key: 'blockSize', label: '块大小', unit: 'KB', min: 512, max: 16384, step: 512 },
  { key: 'imageSize', label: '镜像大小', unit: 'MB', min: 256, max: 4096, step: 256 },
  { key: 'imageCount', label: '镜像数量', unit: '个', min: 1, max: 10, step: 1 },
  { key: 'baseLatency', label: '基础延迟', unit: 'ms', min: 5, max: 200, step: 5 },
  { key: 'jitterRange', label: '抖动范围', unit: 'ms', min: 0, max: 100, step: 5 },
  { key: 'packetLossRate', label: '丢包率', unit: '%', min: 0, max: 20, step: 0.5 },
  { key: 'bandwidth', label: '带宽限制', unit: 'MB/s', min: 10, max: 500, step: 10 },
  { key: 'primaryOsds', label: '主集群OSD', unit: '个', min: 1, max: 12, step: 1 },
  { key: 'backupOsds', label: '备集群OSD', unit: '个', min: 1, max: 12, step: 1 },
  { key: 'consistencyInterval', label: '一致性检测间隔', unit: 's', min: 1, max: 30, step: 1 },
  { key: 'snapshotInterval', label: '快照创建间隔', unit: 's', min: 2, max: 60, step: 2 },
  { key: 'orphanCleanupInterval', label: '孤儿清理间隔', unit: 's', min: 5, max: 120, step: 5 },
  { key: 'conflictDetectionInterval', label: '冲突检测间隔', unit: 's', min: 1, max: 20, step: 1 },
]

const replicationModes: { value: ReplicationMode; label: string; desc: string }[] = [
  { value: 'async_primary_backup', label: '主备异步复制', desc: '单向主备同步，支持角色切换' },
  { value: 'active_active', label: '双活模式 (Active-Active)', desc: '双向同步，自动检测和解决冲突' },
]

const conflictResolutions: { value: ConflictResolution; label: string; desc: string }[] = [
  { value: 'last_write_wins', label: '最后写入获胜', desc: '基于时间戳自动选择较新版本' },
  { value: 'manual', label: '手动解决', desc: '需人工介入选择胜出版本' },
  { value: 'merge', label: '合并策略', desc: '保留两个版本（暂未实现）' },
]

const API_BASE = '/api'

export default function ConfigPanel() {
  const config = useSimulatorStore((s) => s.config)
  const setConfig = useSimulatorStore((s) => s.setConfig)
  const simState = useSimulatorStore((s) => s.simState)

  const handleChange = async (key: keyof SimConfig, value: number | string) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    try {
      const body: Record<string, number | string> = {}
      if (key === 'packetLossRate' && typeof value === 'number') {
        body[key] = value / 100
      } else {
        body[key] = value
      }
      await fetch(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {}
  }

  const handleReplicationModeChange = async (mode: ReplicationMode) => {
    setConfig({ ...config, replicationMode: mode })
    try {
      await fetch(`${API_BASE}/replication-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
    } catch {}
  }

  const resetConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`)
      const data = await res.json()
      setConfig(data)
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-mono text-gray-300">模拟参数配置</span>
        </div>
        <button
          onClick={resetConfig}
          className="flex items-center gap-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          重置
        </button>
      </div>

      {simState !== 'idle' && (
        <div className="text-[10px] font-mono text-amber-400/70 bg-amber-400/5 border border-amber-400/10 rounded-md px-3 py-2">
          ⚠ 运行中修改参数将实时生效，部分参数需重启模拟才能完全生效
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500">
          <Info className="w-3 h-3" />
          复制模式
        </div>
        <div className="space-y-1.5">
          {replicationModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => handleReplicationModeChange(mode.value)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                config.replicationMode === mode.value
                  ? 'border-cyan-400/50 bg-cyan-400/10'
                  : 'border-[#1A1F2E] bg-[#0D1117] hover:border-[#2A3548]'
              }`}
            >
              <div className="text-[11px] font-mono text-gray-300">{mode.label}</div>
              <div className="text-[9px] font-mono text-gray-600 mt-0.5">{mode.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {config.replicationMode === 'active_active' && (
        <div className="space-y-2">
          <div className="flex items-center gap-1 text-[10px] font-mono text-gray-500">
            <Info className="w-3 h-3" />
            冲突解决策略
          </div>
          <div className="space-y-1.5">
            {conflictResolutions.map((res) => (
              <button
                key={res.value}
                onClick={() => handleChange('conflictResolution', res.value)}
                disabled={res.value === 'merge'}
                className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                  config.conflictResolution === res.value
                    ? 'border-cyan-400/50 bg-cyan-400/10'
                    : 'border-[#1A1F2E] bg-[#0D1117] hover:border-[#2A3548]'
                } ${res.value === 'merge' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-[11px] font-mono text-gray-300">{res.label}</div>
                <div className="text-[9px] font-mono text-gray-600 mt-0.5">{res.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-[300px] overflow-auto pr-2">
        {fields.map(({ key, label, unit, min, max, step }) => {
          const displayValue = key === 'packetLossRate' ? config[key] * 100 : config[key]
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400">{label}</label>
                <span className="text-xs font-mono text-cyan-400">
                  {displayValue} <span className="text-gray-600">{unit}</span>
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={displayValue as number}
                onChange={(e) => handleChange(key, parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[#1A1F2E] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400
                  [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(0,240,255,0.4)]
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:transition-shadow
                  [&::-webkit-slider-thumb]:hover:shadow-[0_0_12px_rgba(0,240,255,0.6)]"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

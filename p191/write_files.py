#!/usr/bin/env python3
import os

files = {
    'src/store/dpdkStore.ts': '''import { create } from 'zustand'

export interface SimConfig {
  packetCount: number
  packetSize: number
  forwardMode: 'cut_through' | 'store_forward'
  baseLatencyNs: number
  jitterNs: number
}

export interface SimStats {
  count: number
  mean: number
  min: number
  max: number
  p50: number
  p90: number
  p99: number
  p999: number
  stdev: number
}

export interface PortStats {
  vport0: { received: number; sent: number }
  vport1: { received: number; sent: number }
}

export interface HistogramBucket {
  start: number
  end: number
  count: number
}

export interface SimResult {
  testId: string
  config: SimConfig
  stats: SimStats
  portStats: PortStats
  throughputPps: number
  totalTimeS: number
  histogram: {
    buckets: HistogramBucket[]
  }
  latencies: number[]
}

type TestStatus = 'idle' | 'running' | 'completed'

interface DpdkState {
  status: TestStatus
  config: SimConfig
  result: SimResult | null
  multiSizeResults: SimResult[]
  selectedSizeIndex: number | null
  error: string | null

  setConfig: (config: Partial<SimConfig>) => void
  setStatus: (status: TestStatus) => void
  setResult: (result: SimResult | null) => void
  setMultiSizeResults: (results: SimResult[]) => void
  setSelectedSizeIndex: (index: number | null) => void
  clearSelectedSizeIndex: () => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useDpdkStore = create<DpdkState>((set) => ({
  status: 'idle',
  config: {
    packetCount: 1000000,
    packetSize: 64,
    forwardMode: 'cut_through',
    baseLatencyNs: 50,
    jitterNs: 10,
  },
  result: null,
  multiSizeResults: [],
  selectedSizeIndex: null,
  error: null,

  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result }),
  setMultiSizeResults: (multiSizeResults) => set({ multiSizeResults }),
  setSelectedSizeIndex: (selectedSizeIndex) => set({ selectedSizeIndex }),
  clearSelectedSizeIndex: () => set({ selectedSizeIndex: null }),
  setError: (error) => set({ error }),
  reset: () => set({
    status: 'idle',
    result: null,
    multiSizeResults: [],
    selectedSizeIndex: null,
    error: null,
  }),
}))
''',
    'src/api/dpdkApi.ts': '''import type { SimConfig, SimResult } from '../store/dpdkStore'

const API_BASE = '/api/dpdk'

export async function startTest(config: SimConfig): Promise<{ testId: string; status: string }> {
  const res = await fetch(`${API_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function startMultiSizeTest(
  config: Omit<SimConfig, 'packetSize'> & { packetSizes: number[] }
): Promise<{ status: string; count: number }> {
  const res = await fetch(`${API_BASE}/multi-size`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchMultiSizeResults(): Promise<SimResult[]> {
  const res = await fetch(`${API_BASE}/multi-size`)
  return res.json()
}

export async function stopTest(): Promise<void> {
  await fetch(`${API_BASE}/stop`, { method: 'POST' })
}

export async function fetchStatus(): Promise<{
  status: string
  testId: string | null
  progress: number
  packetsProcessed: number
  error: string | null
}> {
  const res = await fetch(`${API_BASE}/status`)
  return res.json()
}

export async function fetchLatency(): Promise<SimResult> {
  const res = await fetch(`${API_BASE}/latency`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'No data' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function exportCsv(): Promise<void> {
  const res = await fetch(`${API_BASE}/export-csv`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'No data' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const cd = res.headers.get('Content-Disposition')
  const match = cd?.match(/filename=(.+)/)
  a.download = match?.[1] || 'dpdk_latency.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
''',
    'src/components/ConfigPanel.tsx': '''import { useDpdkStore } from '../store/dpdkStore'
import { startTest, startMultiSizeTest, fetchLatency, fetchMultiSizeResults, exportCsv } from '../api/dpdkApi'
import { Play, RotateCcw, Download } from 'lucide-react'

const DEFAULT_SIZE_LIST = [64, 128, 256, 512, 1024, 1280, 1518]

export default function ConfigPanel() {
  const { config, setConfig, status, setStatus, setResult, setMultiSizeResults, clearSelectedSizeIndex, setError, reset } = useDpdkStore()
  const multiSizeMode = config.packetSize === -1
  const isRunning = status === 'running'

  const handleStart = async () => {
    setStatus('running')
    setError(null)
    setResult(null)
    setMultiSizeResults([])
    clearSelectedSizeIndex()
    try {
      if (multiSizeMode) {
        await startMultiSizeTest({
          ...config,
          packetSizes: DEFAULT_SIZE_LIST,
        })
        const results = await fetchMultiSizeResults()
        setMultiSizeResults(results)
        if (results.length > 0) {
          setResult(results[2] || null)
        }
      } else {
        await startTest(config)
        const result = await fetchLatency()
        setResult(result)
      }
      setStatus('completed')
    } catch (e: any) {
      setError(e.message)
      setStatus('idle')
    }
  }

  return (
    <div 
      className="rounded-xl border p-5 space-y-5"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--accent-cyan)' }}>
          测试配置
        </h2>
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background:
                status === 'running'
                  ? 'var(--accent-green)'
                  : status === 'completed'
                  ? 'var(--accent-cyan)'
                  : 'var(--text-dim)',
            }}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {status === 'running' ? '运行中' : status === 'completed' ? '已完成' : '就绪'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            数据包数量
          </label>
          <input
            type="number"
            min={1000}
            max={100000000}
            value={config.packetCount}
            onChange={(e) => setConfig({ packetCount: Number(e.target.value) || 1000000 })}
            disabled={isRunning}
            className="w-full py-2 px-3 rounded-lg text-xs font-mono border outline-none transition-colors"
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            数据包大小 (bytes)
          </label>
          <select
            value={config.packetSize}
            onChange={(e) => setConfig({ packetSize: Number(e.target.value) })}
            disabled={isRunning}
            className="w-full py-2 px-3 rounded-lg text-xs font-mono border outline-none transition-colors"
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value={64}>64</option>
            <option value={128}>128</option>
            <option value={256}>256</option>
            <option value={512}>512</option>
            <option value={1024}>1024</option>
            <option value={1280}>1280</option>
            <option value={1518}>1518</option>
            <option value={-1}>多尺寸测试</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            转发模式
          </label>
          <select
            value={config.forwardMode}
            onChange={(e) => setConfig({ forwardMode: e.target.value as 'cut_through' | 'store_forward' })}
            disabled={isRunning}
            className="w-full py-2 px-3 rounded-lg text-xs font-mono border outline-none transition-colors"
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="cut_through">Cut-Through</option>
            <option value="store_forward">Store-Forward</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            基础延迟 <span style={{ color: 'var(--text-dim)' }}>(ns)</span>
          </label>
          <input
            type="number"
            min={0}
            max={10000}
            value={config.baseLatencyNs}
            onChange={(e) => setConfig({ baseLatencyNs: Number(e.target.value) || 0 })}
            disabled={isRunning}
            className="w-full py-2 px-3 rounded-lg text-xs font-mono border outline-none transition-colors"
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            抖动范围 <span style={{ color: 'var(--text-dim)' }}>(ns)</span>
          </label>
          <input
            type="number"
            min={0}
            max={500000}
            value={config.jitterNs}
            onChange={(e) => setConfig({ jitterNs: Number(e.target.value) || 0 })}
            disabled={isRunning}
            className="w-full py-2 px-3 rounded-lg text-xs font-mono border outline-none transition-colors"
            style={{
              background: 'var(--bg-deep)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleStart}
          disabled={isRunning}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{
            background: isRunning ? 'var(--text-dim)' : 'var(--accent-cyan)',
            color: isRunning ? 'var(--bg-deep)' : '#0a1628',
            cursor: isRunning ? 'not-allowed' : 'pointer',
          }}
        >
          <Play className="w-4 h-4" />
          {isRunning ? '运行中...' : '开始测试'}
        </button>
        <button
          onClick={reset}
          className="px-4 flex items-center justify-center py-2.5 rounded-lg text-sm font-medium transition-all border"
          style={{
            background: 'transparent',
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex gap-2 pt-4">
        <button
          onClick={exportCsv}
          disabled={status !== 'completed'}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all border"
          style={{
            background: status !== 'completed' ? 'transparent' : 'rgba(34, 197, 238, 0.1)',
            borderColor: status !== 'completed' ? 'var(--border)' : 'rgba(34, 197, 238, 0.3)',
            color: status !== 'completed' ? 'var(--text-dim)' : 'rgba(34, 197, 238, 1)',
            cursor: status === 'completed' ? 'pointer' : 'not-allowed',
          }}
        >
          <Download className="w-3.5 h-3.5" />
          导出 CSV
        </button>
      </div>
    </div>
  )
}
''',
    'src/components/MultiSizeChart.tsx': '''import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useDpdkStore, type SimResult } from '../store/dpdkStore'

function formatNs(value: number): string {
  if (value < 1000) return `${value.toFixed(0)}ns`
  if (value < 1000000) return `${(value / 1000).toFixed(2)}µs`
  return `${(value / 1000000).toFixed(2)}ms`
}

export default function MultiSizeChart() {
  const { multiSizeResults, selectedSizeIndex, setSelectedSizeIndex } = useDpdkStore()

  if (multiSizeResults.length === 0) {
    return (
      <div
        className="rounded-xl border flex items-center justify-center"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
          height: 320,
        }}
      >
        <div className="text-center space-y-2">
          <div className="text-4xl opacity-20">📊</div>
          <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
            暂无多尺寸测试数据
          </p>
        </div>
      </div>
    )
  }

  const chartData = multiSizeResults.map((r: SimResult) => ({
    packetSize: r.config.packetSize,
    mean: r.stats.mean,
    p50: r.stats.p50,
    p99: r.stats.p99,
  }))

  return (
    <div 
      className="rounded-xl border p-5 space-y-4"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--accent-cyan)' }}>
          多尺寸延迟对比
        </h2>
      </div>

      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3d" />
            <XAxis
              dataKey="packetSize"
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
              label={{ value: 'Packet Size (bytes)', position: 'bottom', fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#1e2d3d' }}
              tickLine={{ stroke: '#1e2d3d' }}
              tickFormatter={(v) => formatNs(v)}
            />
            <Tooltip
              formatter={(value: number) => [formatNs(value), '']}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #1e2d3d',
                borderRadius: '8px',
                color: '#e2e8f0',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }}
            />
            <Line
              type="monotone"
              dataKey="mean"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={{ fill: '#22d3ee', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#22d3ee' }}
              name="Mean"
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={{ fill: '#a78bfa', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#a78bfa' }}
              name="P50"
            />
            <Line
              type="monotone"
              dataKey="p99"
              stroke="#f472b6"
              strokeWidth={2}
              dot={{ fill: '#f472b6', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#f472b6' }}
              name="P99"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 flex-wrap">
        {multiSizeResults.map((r: SimResult, idx: number) => (
          <button
            key={r.config.packetSize}
            onClick={() => {
              setSelectedSizeIndex(idx)
            }}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
              selectedSizeIndex === idx
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700 hover:border-slate-600'
            }`}
          >
            {r.config.packetSize}B
          </button>
        ))}
      </div>
    </div>
  )
}
''',
    'src/pages/Home.tsx': '''import ConfigPanel from '../components/ConfigPanel'
import LatencyHistogram from '../components/LatencyHistogram'
import StatsPanel from '../components/StatsPanel'
import MultiSizeChart from '../components/MultiSizeChart'
import { useDpdkStore } from '../store/dpdkStore'
import { Cpu } from 'lucide-react'

export default function Home() {
  const { status, result, multiSizeResults, error } = useDpdkStore()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-deep)' }}>
      <header
        className="border-b"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent-cyan-dim)' }}
            >
              <Cpu className="w-5 h-5" style={{ color: 'var(--accent-cyan)' }} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                DPDK 延迟分析器
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                网络数据包延迟仿真与分析工具
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div 
            className="mb-6 p-4 rounded-lg border"
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: 'rgba(239, 68, 68, 1)',
            }}
          >
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <ConfigPanel />
          </div>

          <div className="lg:col-span-8 space-y-6">
            {multiSizeResults.length > 0 && (
              <MultiSizeChart />
            )}

            {result && (
              <>
                <StatsPanel result={result} />
                <LatencyHistogram result={result} />
              </>
            )}

            {status === 'idle' && !result && multiSizeResults.length === 0 && (
              <div
                className="rounded-xl border flex items-center justify-center"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border)',
                  height: 400,
                }}
              >
                <div className="text-center space-y-3">
                  <div className="text-5xl opacity-20">🚀</div>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                    配置参数后点击"开始测试"运行仿真
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
''',
}

base_path = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p191'

for filepath, content in files.items():
    full_path = os.path.join(base_path, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w') as f:
        f.write(content)
    print(f'Written: {filepath}')

print('All files written successfully!')

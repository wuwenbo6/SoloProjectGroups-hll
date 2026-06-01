import { useDpdkStore } from '../store/dpdkStore'
import { Activity, Clock, TrendingUp, Zap } from 'lucide-react'

function formatNs(value: number): string {
  if (value < 1000) return `${value.toFixed(0)}ns`
  if (value < 1000000) return `${(value / 1000).toFixed(2)}μs`
  return `${(value / 1000000).toFixed(2)}ms`
}

function formatPps(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M pps`
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K pps`
  return `${value.toFixed(0)} pps`
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subValue?: string
  accentColor: string
}

function StatCard({ icon, label, value, subValue, accentColor }: StatCardProps) {
  return (
    <div
      className="rounded-xl border p-4 space-y-2 transition-all hover:scale-[1.02]"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: accentColor }}>{icon}</span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div className="font-mono text-lg font-semibold" style={{ color: accentColor }}>
        {value}
      </div>
      {subValue && (
        <div className="text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>{subValue}</div>
      )}
    </div>
  )
}

export default function StatsPanel() {
  const { result, status } = useDpdkStore()

  if (!result && status !== 'running') {
    return (
      <div
        className="rounded-xl border p-5"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <h2 className="text-sm font-semibold tracking-wider uppercase mb-4" style={{ color: 'var(--accent-cyan)' }}>
          统计数据
        </h2>
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>等待测试数据...</p>
      </div>
    )
  }

  if (status === 'running') {
    return (
      <div
        className="rounded-xl border p-5"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <h2 className="text-sm font-semibold tracking-wider uppercase mb-4" style={{ color: 'var(--accent-cyan)' }}>
          统计数据
        </h2>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>数据采集中...</span>
        </div>
      </div>
    )
  }

  const { stats, portStats, throughputPps, totalTimeS } = result!

  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
      }}
    >
      <h2 className="text-sm font-semibold tracking-wider uppercase" style={{ color: 'var(--accent-cyan)' }}>
        统计数据
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="总报文数"
          value={stats.count.toLocaleString()}
          accentColor="var(--accent-cyan)"
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="吞吐量"
          value={formatPps(throughputPps)}
          subValue={`总耗时: ${totalTimeS.toFixed(3)}s`}
          accentColor="var(--accent-green)"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="平均延迟"
          value={formatNs(stats.mean)}
          subValue={`σ = ${formatNs(stats.stddev)}`}
          accentColor="#a78bfa"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="P99 延迟"
          value={formatNs(stats.p99)}
          subValue={`P99.9: ${formatNs(stats.p999)}`}
          accentColor="var(--accent-orange)"
        />
      </div>

      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          百分位延迟
        </h3>
        <div className="space-y-1.5">
          {[
            { label: 'P50', value: stats.p50, color: '#22c55e' },
            { label: 'P90', value: stats.p90, color: '#eab308' },
            { label: 'P99', value: stats.p99, color: '#f97316' },
            { label: 'P99.9', value: stats.p999, color: '#ef4444' },
          ].map((p) => (
            <div key={p.label} className="flex items-center justify-between text-xs font-mono">
              <span style={{ color: p.color }}>{p.label}</span>
              <div className="flex-1 mx-3 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (p.value / stats.max) * 100)}%`,
                    background: p.color,
                  }}
                />
              </div>
              <span style={{ color: 'var(--text-primary)' }}>{formatNs(p.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          延迟范围
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="rounded-lg p-2 border" style={{ background: 'var(--bg-deep)', borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-dim)' }}>Min</span>
            <div style={{ color: 'var(--accent-green)' }}>{formatNs(stats.min)}</div>
          </div>
          <div className="rounded-lg p-2 border" style={{ background: 'var(--bg-deep)', borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--text-dim)' }}>Max</span>
            <div style={{ color: 'var(--accent-red)' }}>{formatNs(stats.max)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          虚拟端口状态
        </h3>
        {[
          { name: 'vport0 (RX)', sent: portStats.vport0.sent, received: portStats.vport0.received, color: 'var(--accent-cyan)' },
          { name: 'vport1 (TX)', sent: portStats.vport1.sent, received: portStats.vport1.received, color: 'var(--accent-orange)' },
        ].map((port) => (
          <div
            key={port.name}
            className="rounded-lg border p-3"
            style={{ background: 'var(--bg-deep)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-medium" style={{ color: port.color }}>
                {port.name}
              </span>
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-green)' }} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>
                <span style={{ color: 'var(--text-dim)' }}>发送</span>
                <div style={{ color: 'var(--text-primary)' }}>{port.sent.toLocaleString()}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)' }}>接收</span>
                <div style={{ color: 'var(--text-primary)' }}>{port.received.toLocaleString()}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

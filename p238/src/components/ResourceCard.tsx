import { Thermometer, Droplets, Download } from 'lucide-react'
import { useSensorStore } from '@/store/sensorStore'

const iconMap: Record<string, React.ReactNode> = {
  thermometer: <Thermometer className="h-5 w-5" />,
  droplets: <Droplets className="h-5 w-5" />,
}

const colorMap: Record<string, { bg: string; text: string; ring: string; glow: string; stroke: string }> = {
  '/sensors/temperature': {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    ring: 'ring-orange-500/20',
    glow: 'shadow-orange-500/10',
    stroke: '#f97316',
  },
  '/sensors/humidity': {
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    ring: 'ring-sky-500/20',
    glow: 'shadow-sky-500/10',
    stroke: '#0ea5e9',
  },
}

export default function ResourceCard({ uri }: { uri: string }) {
  const resource = useSensorStore((s) => s.resources[uri])
  const resourceList = useSensorStore((s) => s.resourceList)
  const exportResourceCsv = useSensorStore((s) => s.exportResourceCsv)
  const info = resourceList.find((r) => r.uri === uri)
  const colors = colorMap[uri] ?? colorMap['/sensors/temperature']

  if (!resource || !info) return null

  const timeStr = new Date(resource.lastUpdated).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  const sparkPoints = resource.history.slice(-20)
  const sparkMin = Math.min(...sparkPoints.map((p) => p.value))
  const sparkMax = Math.max(...sparkPoints.map((p) => p.value))
  const sparkRange = sparkMax - sparkMin || 1

  const sparkSvg = sparkPoints
    .map((p, i) => {
      const x = (i / (sparkPoints.length - 1 || 1)) * 80
      const y = 24 - ((p.value - sparkMin) / sparkRange) * 20
      return `${x},${y}`
    })
    .join(' ')

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-lg ${colors.glow} transition-all duration-300 hover:border-zinc-700 hover:shadow-xl`}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-white/[0.02] to-transparent" />

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg} ${colors.text} ring-1 ${colors.ring}`}>
            {iconMap[info.icon] ?? <Thermometer className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">{info.name}</h3>
            <p className="font-mono text-[11px] text-zinc-500">{info.uri}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <svg width="84" height="28" className="opacity-40 transition-opacity group-hover:opacity-70">
            {sparkPoints.length > 1 && (
              <polyline
                points={sparkSvg}
                fill="none"
                stroke={colors.stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <button
            onClick={() => exportResourceCsv(uri)}
            className="rounded-md p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
            title={`Export ${info.name} CSV`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <span className="font-mono text-3xl font-bold tracking-tight text-zinc-100">
            {resource.currentValue}
          </span>
          <span className="ml-1 text-sm text-zinc-500">{info.unit}</span>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-zinc-500">{timeStr}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 border-t border-zinc-800 pt-3">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Min</span>
          <span className="font-mono text-xs text-zinc-400">{resource.min}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Max</span>
          <span className="font-mono text-xs text-zinc-400">{resource.max}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Avg</span>
          <span className="font-mono text-xs text-zinc-400">{resource.avg}</span>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">Pts</span>
          <span className="font-mono text-xs text-zinc-400">{resource.history.length}</span>
        </div>
      </div>
    </div>
  )
}

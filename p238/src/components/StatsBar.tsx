import { useSensorStore } from '@/store/sensorStore'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

export default function StatsBar() {
  const resources = useSensorStore((s) => s.resources)

  const stats = [
    {
      label: 'Temperature Range',
      icon: <TrendingUp className="h-4 w-4 text-orange-400" />,
      min: resources['/sensors/temperature']?.min ?? 0,
      max: resources['/sensors/temperature']?.max ?? 0,
      avg: resources['/sensors/temperature']?.avg ?? 0,
      unit: '°C',
      color: 'text-orange-400',
      borderColor: 'border-orange-500/20',
    },
    {
      label: 'Humidity Range',
      icon: <TrendingDown className="h-4 w-4 text-sky-400" />,
      min: resources['/sensors/humidity']?.min ?? 0,
      max: resources['/sensors/humidity']?.max ?? 0,
      avg: resources['/sensors/humidity']?.avg ?? 0,
      unit: '%',
      color: 'text-sky-400',
      borderColor: 'border-sky-500/20',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`flex items-center gap-4 rounded-lg border ${stat.borderColor} bg-zinc-900/50 px-4 py-3`}
        >
          <div className="flex-shrink-0">{stat.icon}</div>
          <div className="flex flex-1 items-center gap-4">
            <span className="text-xs text-zinc-500">{stat.label}</span>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-zinc-400">
                <Activity className="mr-0.5 inline h-3 w-3 text-zinc-600" />
                {stat.min}
              </span>
              <span className="text-zinc-600">—</span>
              <span className={stat.color}>
                {stat.max}
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-300">
                μ {stat.avg}{stat.unit}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

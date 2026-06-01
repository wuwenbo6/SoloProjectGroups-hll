import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: number | string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  color: 'blue' | 'cyan' | 'green' | 'red'
}

const colorClasses = {
  blue: 'from-blue-600 to-blue-800',
  cyan: 'from-cyan-500 to-cyan-700',
  green: 'from-emerald-500 to-emerald-700',
  red: 'from-red-500 to-red-700',
}

export default function StatCard({ title, value, icon, trend, color }: StatCardProps) {
  return (
    <div
      className={cn(
        'bg-gradient-to-br rounded-xl p-6 text-white shadow-lg transform transition-transform hover:scale-[1.02]',
        colorClasses[color]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/80 text-sm font-medium">{title}</p>
          <p className="text-4xl font-bold mt-2 font-display">{value}</p>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-1 mt-2 text-sm',
                trend.isPositive ? 'text-emerald-200' : 'text-red-200'
              )}
            >
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{trend.value}% 较昨日</span>
            </div>
          )}
        </div>
        <div className="p-3 bg-white/20 rounded-lg">{icon}</div>
      </div>
    </div>
  )
}

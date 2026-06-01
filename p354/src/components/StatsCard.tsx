import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  title: string
  value: string
  subtitle?: string
  icon: LucideIcon
  color: "cyan" | "amber" | "red" | "green"
}

const colorMap = {
  cyan: { text: "text-cyan", glow: "card-glow-cyan", border: "border-cyan/20" },
  amber: { text: "text-amber", glow: "card-glow-amber", border: "border-amber/20" },
  red: { text: "text-red-400", glow: "card-glow-red", border: "border-red-400/20" },
  green: { text: "text-green-400", glow: "card-glow-green", border: "border-green-400/20" },
}

export default function StatsCard({ title, value, subtitle, icon: Icon, color }: StatsCardProps) {
  const c = colorMap[color]

  return (
    <div
      className={cn(
        "relative bg-navy-dark border rounded-lg p-5 overflow-hidden",
        c.border,
        c.glow
      )}
    >
      <div className="absolute top-4 right-4 opacity-20">
        <Icon className={cn("w-8 h-8", c.text)} />
      </div>

      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
        {title}
      </p>

      <p className={cn("text-2xl font-bold font-mono", c.text)}>
        {value}
      </p>

      {subtitle && (
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      )}
    </div>
  )
}

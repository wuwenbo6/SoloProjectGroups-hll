import { cn } from "@/lib/utils"
import { Activity, Settings, Radio } from "lucide-react"
import { NavLink } from "react-router-dom"

const navItems = [
  { to: "/", icon: Activity, label: "Trap 监控" },
  { to: "/config", icon: Settings, label: "配置管理" },
]

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-16 flex flex-col items-center border-r border-[#1a2332] bg-[#0d1320] py-6 lg:w-56 lg:items-stretch lg:px-4">
      <div className="mb-8 flex items-center justify-center gap-2 lg:justify-start">
        <Radio className="h-7 w-7 text-[#00e5a0]" />
        <span className="hidden text-lg font-bold tracking-wide text-white lg:inline">
          SNMP Trap
        </span>
      </div>

      <nav className="flex flex-1 flex-col items-center gap-2 lg:items-stretch">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-[#162030] hover:text-[#00e5a0]",
                isActive
                  ? "bg-[#162030] text-[#00e5a0] shadow-[0_0_12px_rgba(0,229,160,0.15)]"
                  : "text-[#6b7f99]"
              )
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1 lg:items-stretch">
        <div className="hidden text-[10px] text-[#3a4a5e] lg:block">v1.0.0</div>
      </div>
    </aside>
  )
}

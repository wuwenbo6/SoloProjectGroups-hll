import { useState } from "react"
import { NavLink, Outlet } from "react-router-dom"
import { Monitor, Users, PhoneCall, ChevronLeft, ChevronRight, Wifi, WifiOff } from "lucide-react"
import { useStore } from "@/store/useStore"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/", icon: Monitor, label: "Console" },
  { to: "/terminals", icon: Users, label: "Terminals" },
  { to: "/admissions", icon: PhoneCall, label: "Admissions" },
]

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const wsConnected = useStore((s) => s.wsConnected)

  return (
    <div className="flex h-screen bg-dark-900">
      <aside
        className={cn(
          "flex flex-col border-r border-dark-700 bg-dark-800 transition-all duration-300",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className="flex items-center gap-3 border-b border-dark-700 px-4 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyber-cyan/10">
            <Monitor className="h-4 w-4 text-cyber-cyan" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-semibold text-white whitespace-nowrap">H.323 Gatekeeper</h1>
              <p className="text-[10px] text-dark-500 whitespace-nowrap">RAS Simulator</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  collapsed && "justify-center px-2",
                  isActive
                    ? "bg-cyber-cyan/10 text-cyber-cyan shadow-[0_0_12px_rgba(0,229,255,0.15)]"
                    : "text-dark-500 hover:bg-dark-700 hover:text-slate-300"
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-dark-700 px-4 py-3">
          <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
            {wsConnected ? (
              <Wifi className="h-3.5 w-3.5 text-cyber-green" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-cyber-red" />
            )}
            {!collapsed && (
              <span className={cn("text-xs", wsConnected ? "text-cyber-green" : "text-cyber-red")}>
                {wsConnected ? "Connected" : "Disconnected"}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center border-t border-dark-700 py-3 text-dark-500 transition-colors hover:text-slate-300"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

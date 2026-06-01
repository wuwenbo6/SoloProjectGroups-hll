import { LayoutDashboard, Terminal, Activity, Database } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useSimulatorStore } from '@/store'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/console', icon: Terminal, label: '控制台' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const simState = useSimulatorStore((s) => s.simState)

  return (
    <div className="flex h-screen bg-[#0A0E17] text-gray-200 overflow-hidden">
      <aside className="w-56 flex-shrink-0 border-r border-[#1A1F2E] flex flex-col">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-[#1A1F2E]">
          <Database className="w-5 h-5 text-cyan-400" />
          <span className="font-mono text-sm font-bold tracking-wide text-cyan-400">RBD SYNC</span>
        </div>
        <nav className="flex-1 py-3 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-400/10 text-cyan-400 shadow-[0_0_12px_rgba(0,240,255,0.1)]'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-[#1A1F2E]">
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-gray-500">模拟状态</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                simState === 'running'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse'
                  : simState === 'paused'
                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                    : 'bg-gray-600'
              }`}
            />
            <span className="text-xs font-mono text-gray-400">
              {simState === 'running' ? '运行中' : simState === 'paused' ? '已暂停' : '空闲'}
            </span>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

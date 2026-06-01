import { NavLink, Outlet } from 'react-router-dom'
import { Database, Trash2, HardDrive } from 'lucide-react'

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-zinc-900 text-zinc-300 flex flex-col shrink-0">
        <div className="px-6 py-6 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm tracking-tight">Swift 清理助手</h1>
              <p className="text-[11px] text-zinc-500 mt-0.5">对象存储冷数据管理</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-brand-700/20 text-brand-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`
            }
          >
            <Database className="w-4.5 h-4.5" />
            概览
          </NavLink>
          <NavLink
            to="/cleanup"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-brand-700/20 text-brand-400'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`
            }
          >
            <Trash2 className="w-4.5 h-4.5" />
            清理列表
          </NavLink>
        </nav>

        <div className="px-4 py-4 border-t border-zinc-800">
          <p className="text-[10px] text-zinc-600 text-center">Swift Object Storage Manager</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

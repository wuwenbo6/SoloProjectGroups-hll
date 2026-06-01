import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, AlertTriangle, Activity, FileCode, ScrollText, Bell } from 'lucide-react'

export default function Layout({ children }) {
  const location = useLocation()

  const menuItems = [
    { path: '/', label: '仪表盘', icon: LayoutDashboard },
    { path: '/alerts', label: '告警', icon: AlertTriangle },
    { path: '/events', label: '事件', icon: Activity },
    { path: '/rules', label: '规则', icon: FileCode },
    { path: '/logs', label: '日志', icon: ScrollText },
  ]

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-blue-400">Log Analyzer</h1>
          <p className="text-sm text-gray-400">日志分析系统</p>
        </div>
        
        <nav className="flex-1 p-4">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-colors ${
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-300 hover:bg-gray-700'
                }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <p className="text-xs text-gray-500">v1.0.0</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

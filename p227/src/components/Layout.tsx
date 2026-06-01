import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, FileText, Activity, Upload } from 'lucide-react'

interface LayoutProps {
  children: React.ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: '检验总览' },
    { path: '/messages', icon: FileText, label: '消息监控' },
    { path: '/status', icon: Activity, label: '系统状态' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-gradient-to-b from-primary-700 to-primary-800 text-white flex flex-col shadow-xl">
        <div className="p-6 border-b border-white/10">
          <h1 className="font-display font-bold text-2xl flex items-center gap-2">
            <Activity className="w-8 h-8 text-medical-cyan" />
            HL7 Lab
          </h1>
          <p className="text-sm text-white/60 mt-1">检验结果管理平台</p>
        </div>

        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path ||
                (item.path === '/' && location.pathname.startsWith('/patient'))
              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-white/20 text-white shadow-lg'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Upload className="w-4 h-4" />
              <span>支持TCP/文件上传</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold text-lg text-slate-800">
                {location.pathname === '/' && '检验结果总览'}
                {location.pathname.startsWith('/patient') && '患者检验详情'}
                {location.pathname === '/messages' && '消息监控'}
                {location.pathname === '/status' && '系统状态'}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-500">
                {new Date().toLocaleDateString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">{children}</div>
      </main>
    </div>
  )
}

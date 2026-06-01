import { useLocation, Link } from 'react-router-dom'
import { useFileStore } from '@/store/useFileStore'
import { Satellite, BarChart3, Upload, Database } from 'lucide-react'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation()
  const fileId = useFileStore((s) => s.fileId)
  const hasFile = fileId !== null

  const navItems = [
    { path: '/', label: '上传文件', icon: Upload, always: true },
    { path: hasFile ? `/overview/${fileId}` : '/', label: '数据概览', icon: Database, always: false },
    { path: hasFile ? `/snr/${fileId}` : '/', label: '信噪比分析', icon: BarChart3, always: false },
  ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path.split('/').slice(0, 2).join('/'))
  }

  return (
    <div className="flex min-h-screen bg-[#0A1628] text-white">
      <aside className="w-64 border-r border-[#1E3A5F] bg-[#0D1B2E] flex flex-col">
        <div className="p-6 border-b border-[#1E3A5F]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00D4FF] to-[#2DD4BF] flex items-center justify-center">
              <Satellite className="w-5 h-5 text-[#0A1628]" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight">UBX2RINEX</h1>
              <p className="text-[10px] text-[#5B8DB8] tracking-widest uppercase">GNSS Data Tool</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.path)
            const disabled = !item.always && !hasFile
            return (
              <Link
                key={item.label}
                to={disabled ? '/' : item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
                  active
                    ? 'bg-[#00D4FF]/10 text-[#00D4FF] border border-[#00D4FF]/20'
                    : disabled
                    ? 'text-[#3A5A7A] cursor-not-allowed'
                    : 'text-[#7BA3C4] hover:bg-[#1E3A5F]/50 hover:text-white'
                }`}
                onClick={(e) => disabled && e.preventDefault()}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-[#1E3A5F]">
          <div className="text-[10px] text-[#3A5A7A] text-center">
            u-blox RAWX → RINEX 3.04
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}

import { NavLink, Outlet } from 'react-router-dom';
import { Activity, Settings, List, Server } from 'lucide-react';

const navItems = [
  { to: '/', label: '监控面板', icon: Activity },
  { to: '/control', label: '控制中心', icon: Settings },
  { to: '/commands', label: '命令详情', icon: List },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-space-950 text-space-100 font-display">
      <header className="border-b border-space-800 bg-space-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-cyber-400" />
            <h1 className="text-lg font-bold tracking-tight">
              iSCSI <span className="text-cyber-400">Target</span> Simulator
            </h1>
          </div>
          <nav className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-cyber-500/15 text-cyber-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                      : 'text-space-400 hover:text-space-200 hover:bg-space-800'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-[1600px] mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}

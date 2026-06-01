import { Link, useLocation } from 'react-router-dom';
import { Shield, Terminal, Network, Settings, LogOut } from 'lucide-react';
import { useAppStore } from '@/store';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { currentUser, resetAuth } = useAppStore();

  const navItems = [
    { path: '/', label: '认证', icon: Shield },
    { path: '/authorize', label: '授权', icon: Terminal },
    { path: '/packets', label: '报文', icon: Network },
    { path: '/config', label: '配置', icon: Settings },
  ];

  const handleLogout = () => {
    resetAuth();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <nav className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">TACACS+</h1>
              <p className="text-xs text-slate-400">模拟器</p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {currentUser && (
          <div className="mt-auto pt-4 border-t border-slate-800">
            <div className="px-3 py-2 mb-2">
              <p className="text-xs text-slate-500">当前用户</p>
              <p className="text-sm font-medium text-cyan-400">{currentUser}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm font-medium">退出登录</span>
            </button>
          </div>
        )}
      </nav>

      <main className="flex-1 overflow-auto">
        <div className="p-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

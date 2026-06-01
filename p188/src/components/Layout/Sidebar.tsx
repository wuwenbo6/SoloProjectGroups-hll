import { NavLink } from 'react-router-dom';
import { Video, PlaySquare, Calendar, Settings } from 'lucide-react';
import { cn } from '../../lib/utils.js';

const navItems = [
  { path: '/', label: '实时监控', icon: Video },
  { path: '/playback', label: '录像回放', icon: PlaySquare },
  { path: '/events', label: '事件管理', icon: Calendar },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 h-screen flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-cyan-400 font-mono">CameraRec</h1>
        <p className="text-xs text-slate-500 mt-1">ONVIF录像系统</p>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200',
                    isActive
                      ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  )
                }
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-slate-300 cursor-pointer rounded-lg hover:bg-slate-800 transition-colors">
          <Settings size={20} />
          <span className="font-medium">系统设置</span>
        </div>
      </div>
    </aside>
  );
}

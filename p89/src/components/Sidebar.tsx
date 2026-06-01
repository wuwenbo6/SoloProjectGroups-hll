import React from 'react';
import {
  LayoutDashboard,
  Server,
  HardDrive,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Network,
  Gauge,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

interface SidebarProps {
  onNavigate: (page: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'vms', label: '虚拟机', icon: Server },
  { id: 'cluster', label: '集群管理', icon: Network },
  { id: 'autoscaler', label: '自动伸缩', icon: Gauge },
  { id: 'logs', label: '操作日志', icon: History },
  { id: 'settings', label: '系统设置', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate }) => {
  const { sidebarCollapsed, currentPage, toggleSidebar } = useStore();

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-slate-900 text-white transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2">
            <HardDrive className="w-8 h-8 text-cyan-400" />
            <span className="font-bold text-lg">PVE Manager</span>
          </div>
        )}
        {sidebarCollapsed && <HardDrive className="w-8 h-8 text-cyan-400 mx-auto" />}
        <button
          onClick={toggleSidebar}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 transition-all duration-200',
                'hover:bg-slate-800 hover:text-cyan-400',
                isActive && 'bg-slate-800 text-cyan-400 border-r-2 border-cyan-400',
                sidebarCollapsed && 'justify-center px-2'
              )}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="p-4 border-t border-slate-700 text-xs text-slate-400">
          <p>ProxMox VE Manager</p>
          <p className="mt-1">v1.0.0</p>
        </div>
      )}
    </aside>
  );
};

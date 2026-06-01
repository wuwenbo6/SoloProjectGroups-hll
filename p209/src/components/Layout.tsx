import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Database, PlusCircle, Upload, Server, LogOut, Network } from 'lucide-react';
import { useLdapStore } from '../store/ldapStore.js';

export default function Layout() {
  const navigate = useNavigate();
  const { isConnected, connectionConfig, clearConnection } = useLdapStore();

  const handleDisconnect = () => {
    clearConnection();
    navigate('/connection');
  };

  const navItems = [
    { path: '/connection', label: '连接配置', icon: Network },
    { path: '/schema', label: 'Schema 浏览', icon: Database },
    { path: '/attributes/new', label: '新属性定义', icon: PlusCircle },
    { path: '/deploy', label: '生成与部署', icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
      <aside className="w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Server className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 dark:text-white">LDAP Schema</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">管理控制台</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/25'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700">
          {isConnected && connectionConfig ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-700 dark:text-green-400">
                  已连接
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 px-1">
                <p className="truncate">
                  <span className="font-medium">服务器:</span> {connectionConfig.host}:{connectionConfig.port}
                </p>
                <p className="truncate">
                  <span className="font-medium">Base DN:</span> {connectionConfig.baseDn}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-all"
              >
                <LogOut className="w-4 h-4" />
                断开连接
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                未连接
              </span>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="min-h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

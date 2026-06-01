import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Settings,
  Play,
  FileBarChart,
  TestTube,
  Zap,
  FileText
} from 'lucide-react';

const navItems = [
  { path: '/', label: '仪表板', icon: LayoutDashboard },
  { path: '/config', label: '测试配置', icon: Settings },
  { path: '/execution', label: '测试执行', icon: Play },
  { path: '/results', label: '结果分析', icon: FileBarChart },
  { path: '/cases', label: '测试用例', icon: TestTube },
  { path: '/reports', label: '测试报告', icon: FileText },
];

const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-dark-900 border-r border-dark-700 flex flex-col">
      <div className="p-6 border-b border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Modbus Fuzzer</h1>
            <p className="text-xs text-dark-400">协议模糊测试平台</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30'
                      : 'text-dark-300 hover:bg-dark-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-dark-700">
        <div className="bg-dark-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 bg-status-success rounded-full animate-pulse" />
            <span className="text-sm text-dark-300">系统状态</span>
          </div>
          <p className="text-xs text-dark-400">后端服务运行中</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

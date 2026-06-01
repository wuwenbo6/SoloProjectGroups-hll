import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Package, Upload, Search, User, LogOut, Settings, Menu, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface NavbarProps {
  onSearch?: (query: string) => void;
  searchQuery?: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onSearch, searchQuery = '' }) => {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 bg-gradient-to-br from-teal-400 to-blue-500 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <span className="font-mono text-xl font-bold bg-gradient-to-r from-teal-400 to-blue-400 bg-clip-text text-transparent">
                QGIS Repo
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              <Link 
                to="/" 
                className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                插件列表
              </Link>
              <a 
                href="/plugins.xml" 
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                XML仓库
              </a>
            </div>
          </div>

          <div className="flex-1 max-w-xl mx-8 hidden md:block">
            {onSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索插件..."
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/50 transition-colors"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  to="/upload"
                  className="hidden sm:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white text-sm font-medium rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all hover:shadow-lg hover:shadow-teal-500/25"
                >
                  <Upload className="w-4 h-4" />
                  上传插件
                </Link>

                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-blue-500 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="hidden sm:block text-sm">{user?.name}</span>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50">
                      <div className="px-4 py-2 border-b border-slate-700">
                        <p className="text-sm font-medium text-white">{user?.name}</p>
                        <p className="text-xs text-slate-400">{user?.email}</p>
                        {user?.role === 'admin' && (
                          <span className="text-xs text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded mt-1 inline-block">
                            管理员
                          </span>
                        )}
                      </div>
                      {user?.role === 'admin' && (
                        <button className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          服务器管理
                        </button>
                      )}
                      <button
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        退出登录
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                to="/login"
                className="px-4 py-2 text-sm text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                登录
              </Link>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-400 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-slate-800">
            {onSearch && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索插件..."
                  value={searchQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Link to="/" className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg">
                插件列表
              </Link>
              <a href="/plugins.xml" className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg">
                XML仓库
              </a>
              {isAuthenticated && (
                <Link to="/upload" className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg">
                  上传插件
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

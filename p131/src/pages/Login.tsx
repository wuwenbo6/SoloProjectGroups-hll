import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Package, Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

type Mode = 'login' | 'register';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, isAuthenticated, checkAuth } = useAuthStore();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      setCheckingAuth(false);
    };
    init();
  }, [checkAuth]);

  useEffect(() => {
    if (!checkingAuth && isAuthenticated) {
      const from = (location.state as any)?.from || '/';
      navigate(from, { replace: true });
    }
  }, [checkingAuth, isAuthenticated, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await login(email, password);
        if (!result.success) {
          throw new Error(result.error || '登录失败');
        }
      } else {
        if (!name.trim()) {
          throw new Error('请输入用户名');
        }
        const result = await register(email, password, name);
        if (!result.success) {
          throw new Error(result.error || '注册失败');
        }
      }
      const from = (location.state as any)?.from || '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Package className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">QGIS 插件仓库</span>
            </Link>
            <h1 className="text-2xl font-bold text-white mb-2">
              {mode === 'login' ? '欢迎回来' : '创建账号'}
            </h1>
            <p className="text-slate-400">
              {mode === 'login' 
                ? '登录以访问更多功能' 
                : '注册账号以上传插件和参与评分'}
            </p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
            <div className="flex bg-slate-700/50 rounded-lg p-1 mb-6">
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                  mode === 'login'
                    ? 'bg-teal-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                登录
              </button>
              <button
                onClick={() => setMode('register')}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                  mode === 'register'
                    ? 'bg-teal-500 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                注册
              </button>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    用户名
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="请输入用户名"
                      className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                      disabled={loading}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  邮箱
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入邮箱"
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  密码
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? '请输入密码' : '请输入至少6位密码'}
                    className="w-full pl-10 pr-12 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {mode === 'login' && (
                <div className="text-right">
                  <button type="button" className="text-sm text-teal-400 hover:text-teal-300">
                    忘记密码？
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-medium rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {mode === 'login' ? '登录中...' : '注册中...'}
                  </>
                ) : (
                  mode === 'login' ? '登录' : '注册'
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-700/50 text-center">
              <p className="text-sm text-slate-400">
                {mode === 'login' ? '还没有账号？' : '已有账号？'}
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError(null);
                  }}
                  className="ml-1 text-teal-400 hover:text-teal-300 font-medium"
                >
                  {mode === 'login' ? '立即注册' : '立即登录'}
                </button>
              </p>
            </div>

            <div className="mt-6 p-4 bg-slate-700/30 rounded-lg">
              <p className="text-xs text-slate-500 mb-2">测试账号</p>
              <div className="text-xs text-slate-400 space-y-1">
                <p>管理员: admin@example.com / admin123</p>
                <p>普通用户: user@example.com / user123</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="py-6 text-center text-slate-600 text-sm">
        <p>QGIS 插件仓库管理系统 © 2024</p>
      </footer>
    </div>
  );
};

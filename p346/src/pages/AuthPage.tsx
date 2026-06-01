import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, LogIn, AlertCircle, CheckCircle2, Loader2, Network } from 'lucide-react';
import { api } from '@/api';
import { useAppStore } from '@/store';
import PacketViewer from '@/components/PacketViewer';
import type { AuthResponse } from '@/types';

export default function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [shake, setShake] = useState(false);
  const { isLoading, setIsLoading, setError, setCurrentUser, setSessionId, setAuthResponse, authResponse } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.auth({ username, password });

      if (response.success) {
        setCurrentUser(username);
        setSessionId(response.sessionId);
        setAuthResponse(response);
        setTimeout(() => navigate('/authorize'), 1500);
      } else {
        setAuthResponse(response);
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">TACACS+ 认证</h1>
              <p className="text-slate-400 text-sm">输入用户凭证进行身份验证</p>
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  用户名
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono"
                  placeholder="输入用户名"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  密码
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono ${
                    shake ? 'animate-shake border-red-500' : ''
                  }`}
                  placeholder="输入密码"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    认证中...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    开始认证
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-3">测试账号：</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-cyan-400 font-mono">admin / admin123</p>
                  <p className="text-slate-500">管理员，权限级别 15</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-cyan-400 font-mono">user / user123</p>
                  <p className="text-slate-500">普通用户，权限级别 1</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {authResponse && (
          <div
            className={`animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 p-4 rounded-xl border ${
              authResponse.success
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}
          >
            <div className="flex items-start gap-3">
              {authResponse.success ? (
                <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p
                  className={`font-semibold ${
                    authResponse.success ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {authResponse.success ? '认证成功' : '认证失败'}
                </p>
                <p className="text-sm text-slate-400 mt-1">{authResponse.message}</p>
                {authResponse.success && (
                  <p className="text-xs text-slate-500 mt-2 font-mono">
                    会话 ID: {authResponse.sessionId}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {authResponse ? (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500 delay-200">
            <PacketViewer
              request={authResponse.request}
              response={authResponse.response}
              title="认证报文详情"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center p-8 border-2 border-dashed border-slate-700 rounded-2xl">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
                <Network className="w-8 h-8 text-slate-600" />
              </div>
              <p className="text-slate-500">提交认证请求后</p>
              <p className="text-slate-600 text-sm">此处将显示 TACACS+ 报文详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

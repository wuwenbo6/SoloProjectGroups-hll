import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Server, Lock, Globe, Database, Shield, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useLdapStore } from '../store/ldapStore.js';
import type { LdapConnectionConfig } from '../../shared/types.js';

export default function ConnectionConfig() {
  const navigate = useNavigate();
  const { connectionConfig, isConnected, connectionError, isTesting, serverInfo, setConnectionConfig, testConnection, clearConnection } = useLdapStore();

  const [formData, setFormData] = useState<LdapConnectionConfig>(
    connectionConfig || {
      host: 'localhost',
      port: 389,
      baseDn: 'dc=example,dc=com',
      bindDn: 'cn=admin,dc=example,dc=com',
      bindPassword: '',
      useTls: false,
    }
  );

  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (field: keyof LdapConnectionConfig, value: string | number | boolean) => {
    const newConfig = { ...formData, [field]: value };
    setFormData(newConfig);
    setConnectionConfig(newConfig);
  };

  const handleTest = async () => {
    setConnectionConfig(formData);
    const success = await testConnection();
    if (success) {
      setTimeout(() => navigate('/schema'), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
            <Server className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            LDAP 服务器连接
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            配置 LDAP 服务器连接参数，开始管理 Schema
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Globe className="w-4 h-4 text-primary" />
                  服务器地址
                </label>
                <input
                  type="text"
                  value={formData.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="localhost"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Database className="w-4 h-4 text-primary" />
                  端口
                </label>
                <input
                  type="number"
                  value={formData.port}
                  onChange={(e) => handleChange('port', parseInt(e.target.value, 10) || 389)}
                  placeholder="389"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Database className="w-4 h-4 text-primary" />
                Base DN
              </label>
              <input
                type="text"
                value={formData.baseDn}
                onChange={(e) => handleChange('baseDn', e.target.value)}
                placeholder="dc=example,dc=com"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Lock className="w-4 h-4 text-primary" />
                绑定 DN (Bind DN)
              </label>
              <input
                type="text"
                value={formData.bindDn}
                onChange={(e) => handleChange('bindDn', e.target.value)}
                placeholder="cn=admin,dc=example,dc=com"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Lock className="w-4 h-4 text-primary" />
                绑定密码
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.bindPassword}
                  onChange={(e) => handleChange('bindPassword', e.target.value)}
                  placeholder="输入绑定密码"
                  className="w-full px-4 py-3 pr-12 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.useTls}
                  onChange={(e) => handleChange('useTls', e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/50"
                />
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  使用 TLS/SSL 加密连接 (LDAPS)
                </span>
              </label>
            </div>

            {connectionError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">连接失败</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{connectionError}</p>
                </div>
              </div>
            )}

            {isConnected && serverInfo && (
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300">连接成功</p>
                  {serverInfo.vendorName && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      服务器: {serverInfo.vendorName} {serverInfo.vendorVersion || ''}
                    </p>
                  )}
                  {serverInfo.namingContexts && serverInfo.namingContexts.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400">
                      命名上下文: {serverInfo.namingContexts.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700 flex gap-4">
            <button
              type="button"
              onClick={clearConnection}
              className="flex-1 px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              重置
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="flex-1 px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  连接中...
                </>
              ) : isConnected ? (
                <>
                  <Check className="w-5 h-5" />
                  已连接，继续
                </>
              ) : (
                '测试连接'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

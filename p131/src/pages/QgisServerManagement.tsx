import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, Server, Plus, RefreshCw, Trash2, CheckCircle, 
  AlertCircle, Settings, Globe, Power, PowerOff, Loader2
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { qgisService, pluginService } from '../services/plugins';
import { useAuthStore } from '../store/authStore';
import type { QgisServer } from '../types';

export const QgisServerManagement: React.FC = () => {
  const { user, isAuthenticated } = useAuthStore();
  const [servers, setServers] = useState<QgisServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    apiKey: '',
    description: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!isAuthenticated || user?.role !== 'admin') return;
    setLoading(true);
    try {
      const result = await qgisService.getServers();
      if (result.success && result.data) {
        setServers(result.data);
      }
    } catch (err) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleCheckStatus = async (serverId: string) => {
    setCheckingStatus(serverId);
    setActionError(null);
    try {
      const result = await qgisService.checkServerStatus(serverId);
      if (result.success && result.data) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, status: result.data!.status, lastChecked: new Date().toISOString() } : s
        ));
      }
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setCheckingStatus(null);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const result = await qgisService.addServer(formData);
      if (result.success && result.data) {
        setShowAddModal(false);
        setFormData({ name: '', url: '', apiKey: '', description: '' });
        await loadServers();
      } else {
        setFormError(result.error || '添加失败');
      }
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm('确定要删除这个服务器吗？')) return;
    try {
      const result = await qgisService.deleteServer(serverId);
      if (result.success) {
        setServers(prev => prev.filter(s => s.id !== serverId));
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleToggleServer = async (serverId: string, enabled: boolean) => {
    try {
      const result = await qgisService.updateServer(serverId, { enabled: !enabled });
      if (result.success && result.data) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, enabled: !enabled } : s
        ));
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!isAuthenticated || user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">权限不足</h2>
          <p className="text-slate-400 mb-4">仅管理员可访问此页面</p>
          <Link to="/" className="text-teal-400 hover:underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              返回插件列表
            </Link>
            <h1 className="text-2xl font-bold text-white">QGIS Server 管理</h1>
            <p className="text-slate-400 mt-1">管理远程 QGIS Server，支持远程安装卸载插件</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-medium rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all"
          >
            <Plus className="w-5 h-5" />
            添加服务器
          </button>
        </div>

        {actionError && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <span className="text-red-400">{actionError}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-20 bg-slate-800/30 rounded-2xl border border-slate-700/50">
            <Server className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">暂无 QGIS Server</h3>
            <p className="text-slate-500 mb-6">添加您的第一个 QGIS Server 以开始远程管理插件</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
              添加服务器
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((server) => (
              <div
                key={server.id}
                className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      server.enabled 
                        ? 'bg-teal-500/20 border border-teal-500/30' 
                        : 'bg-slate-700/50 border border-slate-600'
                    }`}>
                      <Server className={`w-6 h-6 ${server.enabled ? 'text-teal-400' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{server.name}</h3>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded mt-1 ${
                        server.status === 'online'
                          ? 'bg-green-500/20 text-green-400'
                          : server.status === 'offline'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-600 text-slate-400'
                      }`}>
                        {server.status === 'online' ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : server.status === 'offline' ? (
                          <AlertCircle className="w-3 h-3" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        {server.status === 'online' ? '在线' : server.status === 'offline' ? '离线' : '未知'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-400 truncate" title={server.url}>
                      {server.url}
                    </span>
                  </div>
                  {server.description && (
                    <p className="text-sm text-slate-500">{server.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Settings className="w-3 h-3" />
                    <span>已安装 {server._count?.serverPlugins ?? server._count?.installedPlugins ?? 0} 个插件</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    最后检查: {formatDate(server.lastChecked || server.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCheckStatus(server.id)}
                    disabled={checkingStatus === server.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    {checkingStatus === server.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {checkingStatus === server.id ? '检查中' : '检查状态'}
                  </button>
                  <button
                    onClick={() => handleToggleServer(server.id, server.enabled)}
                    className={`p-2 rounded-lg transition-colors ${
                      server.enabled
                        ? 'text-teal-400 bg-teal-500/10 hover:bg-teal-500/20'
                        : 'text-slate-500 bg-slate-700 hover:bg-slate-600 hover:text-slate-300'
                    }`}
                    title={server.enabled ? '禁用' : '启用'}
                  >
                    {server.enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDeleteServer(server.id)}
                    className="p-2 text-red-400 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-6">添加 QGIS Server</h3>

            <form onSubmit={handleAddServer} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  服务器名称 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：生产服务器"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  服务器地址 <span className="text-red-400">*</span>
                </label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://qgis.example.com/cgi-bin/qgis_mapserv.fcgi"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="可选，用于认证"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="可选，服务器描述信息"
                  rows={3}
                  className="w-full bg-slate-700/50 border border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors resize-none"
                  disabled={submitting}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({ name: '', url: '', apiKey: '', description: '' });
                    setFormError(null);
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.name.trim() || !formData.url.trim()}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      添加中...
                    </>
                  ) : (
                    '添加'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

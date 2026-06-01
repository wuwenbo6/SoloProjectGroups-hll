import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Download, Globe, Github, Bug, Mail, 
  Calendar, Package, Clock, Trash2, HardDrive,
  CheckCircle, AlertCircle, Server, RotateCcw,
  FileCode, Share2, Loader2, Pencil, ChevronDown
} from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { RatingStars } from '../components/RatingStars';
import { DependencyTree, DependencyNode } from '../components/DependencyTree';
import { pluginService, qgisService, developmentService } from '../services/plugins';
import { useAuthStore } from '../store/authStore';
import type { Plugin, Rating, RatingDistribution, QgisServer } from '../types';

export const PluginDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [plugin, setPlugin] = useState<Plugin | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState<number>(0);
  const [userComment, setUserComment] = useState('');
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [ratingDistribution, setRatingDistribution] = useState<RatingDistribution | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [servers, setServers] = useState<QgisServer[]>([]);
  const [showServerModal, setShowServerModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [dependencyTree, setDependencyTree] = useState<DependencyNode | null>(null);
  const [hasCircular, setHasCircular] = useState(false);
  const [activating, setActivating] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [exportingGraph, setExportingGraph] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);

  const loadPlugin = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await pluginService.getPlugin(id);
      if (result.success && result.data) {
        setPlugin(result.data);
      }
    } catch (err) {
      console.error('Failed to load plugin:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadUserRating = useCallback(async () => {
    if (!id || !isAuthenticated) return;
    try {
      const result = await pluginService.getUserRating(id);
      if (result.success && result.data) {
        setUserRating(result.data.score);
        setUserComment(result.data.comment || '');
      }
    } catch (err) {
      console.error('Failed to load user rating:', err);
    }
  }, [id, isAuthenticated]);

  const loadRatings = useCallback(async () => {
    if (!id) return;
    try {
      const result = await pluginService.getPluginRatings(id);
      if (result.success && result.data) {
        setRatings(result.data.items);
        if (result.data.distribution) {
          setRatingDistribution(result.data.distribution);
        }
      }
    } catch (err) {
      console.error('Failed to load ratings:', err);
    }
  }, [id]);

  const loadDependencyTree = useCallback(async () => {
    if (!id) return;
    try {
      const result = await pluginService.getDependencyTree(id);
      if (result.success && result.data) {
        setDependencyTree(result.data);
      }
    } catch (err) {
      console.error('Failed to load dependency tree:', err);
    }
  }, [id]);

  const checkCircularDeps = useCallback(async () => {
    if (!id) return;
    try {
      const result = await pluginService.checkCircularDependencies(id);
      if (result.success && result.data) {
        setHasCircular(result.data.hasCircular);
      }
    } catch (err) {
      console.error('Failed to check circular dependencies:', err);
    }
  }, [id]);

  const loadServers = useCallback(async () => {
    if (!user?.role || user.role !== 'admin') return;
    try {
      const result = await qgisService.getServers();
      if (result.success && result.data) {
        setServers(result.data);
      }
    } catch (err) {
      console.error('Failed to load servers:', err);
    }
  }, [user?.role]);

  useEffect(() => {
    loadPlugin();
    loadRatings();
    loadDependencyTree();
    checkCircularDeps();
  }, [loadPlugin, loadRatings]);

  useEffect(() => {
    loadUserRating();
    loadServers();
  }, [loadUserRating, loadServers]);

  const handleRate = async (score: number) => {
    if (!id || !isAuthenticated) {
      navigate('/login');
      return;
    }

    setSubmittingRating(true);
    try {
      const result = await pluginService.ratePlugin(id, score, userComment);
      if (result.success) {
        setUserRating(score);
        await Promise.all([loadPlugin(), loadRatings()]);
      }
    } catch (err) {
      console.error('Failed to rate:', err);
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleDownload = async (version?: string) => {
    if (!id) return;
    setDownloading(true);
    try {
      const response = await pluginService.downloadPlugin(id, version);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = plugin?.versions?.[0]?.filename || `${plugin?.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      await loadPlugin();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleInstall = async () => {
    if (!id || !selectedServer || !plugin) return;
    setInstalling(true);
    setInstallError(null);
    setInstallSuccess(false);
    setRequiresRestart(false);

    try {
      const version = plugin.versions?.[0]?.version;
      if (!version) {
        setInstallError('没有可用的版本');
        return;
      }

      const result = await qgisService.installPlugin(selectedServer, id, version);
      if (result.success) {
        setInstallSuccess(true);
        if (result.data?.requiresRestart) {
          setRequiresRestart(true);
        }
        setTimeout(() => {
          setShowServerModal(false);
          setInstallSuccess(false);
          setRequiresRestart(false);
          setSelectedServer('');
        }, 3000);
      } else {
        setInstallError(result.error || '安装失败');
      }
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  const handleActivate = async () => {
    if (!id || !selectedServer) return;
    setActivating(true);
    setInstallError(null);

    try {
      const result = await qgisService.activatePlugin(selectedServer, id);
      if (result.success) {
        setInstallSuccess(true);
        setTimeout(() => {
          setShowServerModal(false);
          setInstallSuccess(false);
          setSelectedServer('');
        }, 2000);
      } else {
        setInstallError(result.error || '激活失败');
      }
    } catch (err) {
      setInstallError((err as Error).message);
    } finally {
      setActivating(false);
    }
  };

  const handleRollback = async (versionId: string, versionNumber: string) => {
    if (!id) return;
    
    if (!confirm(`确定要回滚到版本 ${versionNumber} 吗？这将创建一个新版本。`)) {
      return;
    }

    setRollingBack(versionId);
    setRollbackSuccess(null);

    try {
      const result = await developmentService.rollbackVersion(id, versionId);
      if (result.success) {
        setRollbackSuccess(`成功回滚到版本 ${versionNumber}！`);
        setTimeout(() => {
          setRollbackSuccess(null);
          loadPlugin();
        }, 2000);
      } else {
        throw new Error(result.error || '回滚失败');
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setRollingBack(null);
    }
  };

  const handleExportGraph = async (format: 'json' | 'dot' | 'mermaid') => {
    if (!id) return;

    setExportingGraph(true);
    setShowExportMenu(false);

    try {
      const response = await developmentService.exportDependencyGraph(id, format);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${plugin?.name || 'plugin'}-dependencies.${format === 'mermaid' ? 'mmd' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExportingGraph(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('确定要删除这个插件吗？此操作无法撤销。')) return;

    try {
      const result = await pluginService.deletePlugin(id);
      if (result.success) {
        navigate('/');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!plugin) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">插件不存在</h2>
          <Link to="/" className="text-teal-400 hover:underline">
            返回插件列表
          </Link>
        </div>
      </div>
    );
  }

  const latestVersion = plugin.versions?.[0];

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回插件列表
        </Link>

        <div className="bg-gradient-to-r from-slate-800/50 to-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8 mb-8">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <div className="flex-shrink-0 w-24 h-24 bg-slate-700 rounded-xl flex items-center justify-center border border-slate-600 overflow-hidden">
              {plugin.icon ? (
                <img src={plugin.icon} alt={plugin.name} className="w-full h-full object-contain p-2" />
              ) : (
                <Package className="w-12 h-12 text-teal-400" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <h1 className="text-3xl font-bold text-white">{plugin.name}</h1>
                {plugin.experimental && (
                  <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                    实验性
                  </span>
                )}
                {plugin.deprecated && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
                    已弃用
                  </span>
                )}
              </div>

              <p className="text-slate-400 mb-4 leading-relaxed">{plugin.description}</p>

              <div className="flex flex-wrap items-center gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-300">{plugin.author}</span>
                </div>
                {plugin.category && (
                  <div className="text-sm text-slate-400 bg-slate-700/50 px-3 py-1 rounded">
                    {plugin.category.name}
                  </div>
                )}
                <RatingStars 
                  rating={plugin.averageRating} 
                  size={18} 
                  showValue 
                  count={plugin.ratingCount}
                />
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Download className="w-4 h-4" />
                  <span>{plugin.downloads.toLocaleString()} 次下载</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleDownload()}
                  disabled={downloading || !latestVersion}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-blue-500 text-white font-medium rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all disabled:opacity-50"
                >
                  <Download className="w-5 h-5" />
                  {downloading ? '下载中...' : `下载 v${latestVersion?.version}`}
                </button>

                {isAuthenticated && (
                  <Link
                    to={`/develop/${id}`}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    <Pencil className="w-5 h-5" />
                    在线编辑
                  </Link>
                )}

                {user?.role === 'admin' && (
                  <>
                    <button
                      onClick={() => setShowServerModal(true)}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 text-white font-medium rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      <Server className="w-5 h-5" />
                      远程安装
                    </button>
                    <button
                      onClick={handleDelete}
                      className="inline-flex items-center gap-2 px-6 py-3 border border-red-500/50 text-red-400 font-medium rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-600/50 to-transparent my-8" />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">最新版本</p>
              <p className="font-mono text-lg text-white">{latestVersion?.version || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">QGIS 最低版本</p>
              <p className="font-mono text-lg text-white">{plugin.qgisMinVersion}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">文件大小</p>
              <p className="font-mono text-lg text-white">
                {latestVersion ? formatFileSize(latestVersion.fileSize) : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">更新时间</p>
              <p className="text-lg text-white">{formatDate(plugin.updatedAt)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-teal-400" />
                版本历史
              </h3>
              {plugin.versions && plugin.versions.length > 0 ? (
                <div className="space-y-4">
                  {plugin.versions.map((version, index) => (
                    <div 
                      key={version.id}
                      className={`flex items-start gap-4 ${index < plugin.versions!.length - 1 ? 'pb-4 border-b border-slate-700/50' : ''}`}
                    >
                      <div className="flex-shrink-0 w-3 h-3 mt-1.5 rounded-full bg-teal-500" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-white">v{version.version}</span>
                          <span className="text-sm text-slate-500">
                            {formatDate(version.createdAt)}
                          </span>
                        </div>
                        {version.changelog && (
                          <p className="text-sm text-slate-400">{version.changelog}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <button
                            onClick={() => handleDownload(version.version)}
                            className="text-sm text-teal-400 hover:text-teal-300 inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            下载此版本
                          </button>
                          {index > 0 && user?.role === 'admin' && (
                            <button
                              onClick={() => handleRollback(version.id, version.version)}
                              disabled={rollingBack === version.id}
                              className="text-sm text-orange-400 hover:text-orange-300 inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              {rollingBack === version.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3" />
                              )}
                              {rollingBack === version.id ? '回滚中...' : '回滚到此版本'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">暂无版本记录</p>
              )}
            </div>

            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">用户评价</h3>

              <div className="flex flex-col sm:flex-row gap-8 mb-8">
                <div className="text-center sm:text-left">
                  <div className="text-4xl font-bold text-white mb-1">
                    {plugin.averageRating.toFixed(1)}
                  </div>
                  <RatingStars rating={plugin.averageRating} size={20} />
                  <p className="text-sm text-slate-500 mt-2">
                    共 {plugin.ratingCount} 条评价
                  </p>
                </div>

                {ratingDistribution && (
                  <div className="flex-1 space-y-2">
                    {[5, 4, 3, 2, 1].map((score) => {
                      const count = ratingDistribution[score as keyof RatingDistribution];
                      const percentage = plugin.ratingCount > 0 
                        ? (count / plugin.ratingCount) * 100 
                        : 0;
                      return (
                        <div key={score} className="flex items-center gap-3">
                          <span className="text-sm text-slate-400 w-8">{score}星</span>
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-slate-500 w-8 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isAuthenticated && (
                <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
                  <p className="text-sm text-slate-400 mb-3">你的评分</p>
                  <div className="flex items-center gap-4 mb-3">
                    <RatingStars
                      rating={userRating}
                      size={24}
                      interactive
                      onRate={setUserRating}
                    />
                    {submittingRating && (
                      <span className="text-sm text-slate-500">保存中...</span>
                    )}
                  </div>
                  <textarea
                    value={userComment}
                    onChange={(e) => setUserComment(e.target.value)}
                    placeholder="写下你的评价..."
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-teal-500 resize-none"
                    rows={3}
                  />
                  <button
                    onClick={() => handleRate(userRating)}
                    disabled={submittingRating || userRating === 0}
                    className="mt-3 px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-lg hover:bg-teal-600 transition-colors disabled:opacity-50"
                  >
                    提交评价
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {ratings.length > 0 ? (
                  ratings.map((rating) => (
                    <div key={rating.id} className="border-b border-slate-700/50 pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {rating.user?.name?.[0] || 'U'}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">
                              {rating.user?.name || '匿名用户'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {formatDate(rating.createdAt)}
                            </p>
                          </div>
                        </div>
                        <RatingStars rating={rating.score} size={14} />
                      </div>
                      {rating.comment && (
                        <p className="text-sm text-slate-400 ml-11">{rating.comment}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-center py-8">暂无评价，来做第一个评价的人吧！</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">插件信息</h3>
              <dl className="space-y-4 text-sm">
                {plugin.homepage && (
                  <div>
                    <dt className="text-slate-500 mb-1">项目主页</dt>
                    <dd>
                      <a 
                        href={plugin.homepage} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-teal-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <Globe className="w-4 h-4" />
                        访问主页
                      </a>
                    </dd>
                  </div>
                )}
                {plugin.repository && (
                  <div>
                    <dt className="text-slate-500 mb-1">代码仓库</dt>
                    <dd>
                      <a 
                        href={plugin.repository} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-teal-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <Github className="w-4 h-4" />
                        查看源码
                      </a>
                    </dd>
                  </div>
                )}
                {plugin.tracker && (
                  <div>
                    <dt className="text-slate-500 mb-1">问题反馈</dt>
                    <dd>
                      <a 
                        href={plugin.tracker} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-teal-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <Bug className="w-4 h-4" />
                        提交Bug
                      </a>
                    </dd>
                  </div>
                )}
                {plugin.license && (
                  <div>
                    <dt className="text-slate-500 mb-1">许可证</dt>
                    <dd className="text-white">{plugin.license}</dd>
                  </div>
                )}
                {plugin.email && (
                  <div>
                    <dt className="text-slate-500 mb-1">联系邮箱</dt>
                    <dd>
                      <a 
                        href={`mailto:${plugin.email}`}
                        className="text-teal-400 hover:text-teal-300 flex items-center gap-1"
                      >
                        <Mail className="w-4 h-4" />
                        {plugin.email}
                      </a>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500 mb-1">QGIS 版本</dt>
                  <dd className="text-white">
                    {plugin.qgisMinVersion} 
                    {plugin.qgisMaxVersion ? ` - ${plugin.qgisMaxVersion}` : '+'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 mb-1">创建时间</dt>
                  <dd className="text-white flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {formatDate(plugin.createdAt)}
                  </dd>
                </div>
                {latestVersion && (
                  <div>
                    <dt className="text-slate-500 mb-1">MD5 校验</dt>
                    <dd className="text-slate-400 font-mono text-xs break-all">
                      {latestVersion.md5Hash}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-teal-400" />
                  依赖关系
                </h3>
                <div className="flex items-center gap-2">
                  {hasCircular && (
                    <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                      检测到循环依赖
                    </span>
                  )}
                  {isAuthenticated && dependencyTree && (
                    <div className="relative">
                      <button
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={exportingGraph}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                      >
                        <Share2 className="w-4 h-4" />
                        导出
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {showExportMenu && (
                        <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10 min-w-[140px]">
                          <button
                            onClick={() => handleExportGraph('json')}
                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            JSON 格式
                          </button>
                          <button
                            onClick={() => handleExportGraph('dot')}
                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Graphviz DOT
                          </button>
                          <button
                            onClick={() => handleExportGraph('mermaid')}
                            className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Mermaid 图
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {rollbackSuccess && (
                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  {rollbackSuccess}
                </div>
              )}
              {dependencyTree ? (
                <DependencyTree 
                  dependencies={dependencyTree.dependencies || []} 
                  maxDepth={5}
                />
              ) : (
                <div className="text-slate-500 text-sm">正在加载依赖树...</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showServerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">选择 QGIS Server</h3>
            
            {installSuccess ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-green-400 font-medium mb-2">安装成功！</p>
                {requiresRestart && (
                  <div className="text-sm text-orange-400 bg-orange-500/10 rounded-lg p-3 mb-4">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    插件需要重启 QGIS 才能完全激活
                  </div>
                )}
                {requiresRestart && (
                  <button
                    onClick={handleActivate}
                    disabled={activating}
                    className="mt-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    {activating ? '激活中...' : '尝试立即激活'}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  {servers.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">
                      暂无已配置的 QGIS Server
                    </p>
                  ) : (
                    servers.map((server) => (
                      <label
                        key={server.id}
                        className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedServer === server.id
                            ? 'border-teal-500 bg-teal-500/10'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="radio"
                          name="server"
                          value={server.id}
                          checked={selectedServer === server.id}
                          onChange={() => setSelectedServer(server.id)}
                          className="mr-3 text-teal-500"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-white">{server.name}</p>
                          <p className="text-sm text-slate-500">{server.url}</p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded ${
                          server.status === 'online'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {server.status}
                        </span>
                      </label>
                    ))
                  )}
                </div>

                {installError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm mb-4 p-3 bg-red-500/10 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {installError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowServerModal(false)}
                    className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleInstall}
                    disabled={!selectedServer || installing}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white rounded-lg hover:from-teal-600 hover:to-blue-600 transition-all disabled:opacity-50"
                  >
                    {installing ? '安装中...' : '安装'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

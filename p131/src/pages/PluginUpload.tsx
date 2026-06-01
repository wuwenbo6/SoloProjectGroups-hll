import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { FileUpload } from '../components/FileUpload';

import { pluginService } from '../services/plugins';
import { useAuthStore } from '../store/authStore';
import type { Category, ParsedPlugin } from '../types';

export const PluginUpload: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, checkAuth } = useAuthStore();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPlugin, setParsedPlugin] = useState<ParsedPlugin | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const init = async () => {
      await checkAuth();
      setCheckingAuth(false);
    };
    init();
  }, [checkAuth]);

  useEffect(() => {
    if (!checkingAuth && !isAuthenticated) {
      navigate('/login');
    }
  }, [checkingAuth, isAuthenticated, navigate]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const result = await pluginService.getCategories();
        if (result.success && result.data) {
          setCategories(result.data);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, []);

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setParsedPlugin(null);
    setParseError(null);
    setUploadError(null);
    setUploadSuccess(false);

    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await pluginService.validatePlugin(formData);
      if (result.success && result.data && result.data.metadata) {
        const metadata = result.data.metadata;
        setParsedPlugin({
          name: metadata.name,
          slug: metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          version: metadata.version,
          description: metadata.description,
          author: metadata.author,
          email: metadata.email,
          qgisMinVersion: metadata.qgisMinimumVersion,
          qgisMaxVersion: metadata.qgisMaximumVersion,
          category: metadata.category,
          icon: metadata.icon,
          homepage: metadata.homepage,
          tracker: metadata.tracker,
          repository: metadata.repository,
          license: metadata.license,
          deprecated: metadata.deprecated,
          experimental: metadata.experimental,
          changelog: metadata.changelog,
          dependencies: metadata.dependencies?.map((dep: string) => ({ dependencyName: dep })),
          filename: file.name,
          fileSize: file.size,
          md5Hash: '',
        });
        setSelectedCategory(metadata.category || '');
      } else {
        setParseError(result.error || result.data?.error || '解析插件失败');
      }
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async (file: File, onProgress: (progress: number) => void) => {
    if (!parsedPlugin) {
      throw new Error('请先选择并解析插件文件');
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', selectedCategory || parsedPlugin.category || '');
      
      const result = await pluginService.uploadPlugin(formData, onProgress);
      
      if (result.success && result.data) {
        setUploadSuccess(true);
        setTimeout(() => {
          navigate(`/plugins/${result.data!.plugin.id}`);
        }, 2000);
      } else {
        throw new Error(result.error || '上传失败');
      }
    } catch (err) {
      setUploadError((err as Error).message);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          返回插件列表
        </Link>

        <div className="bg-gradient-to-r from-slate-800/50 to-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-teal-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center border border-teal-500/30">
              <Package className="w-8 h-8 text-teal-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">上传 QGIS 插件</h1>
            <p className="text-slate-400">
              上传您的 QGIS 插件 ZIP 包，系统将自动解析 metadata.txt
            </p>
          </div>

          <FileUpload
            onFileSelect={handleFileSelect}
            onUpload={handleUpload}
            disabled={parsing || uploading || uploadSuccess}
          />

          {parsing && (
            <div className="mt-6 flex items-center justify-center gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <span>正在解析插件 metadata.txt...</span>
            </div>
          )}

          {parseError && (
            <div className="mt-6 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">解析失败</p>
                <p className="text-sm text-red-400/80 mt-1">{parseError}</p>
              </div>
            </div>
          )}

          {parsedPlugin && !parseError && (
            <div className="mt-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="h-px bg-gradient-to-r from-transparent via-slate-600/50 to-transparent" />

              <div>
                <h3 className="text-lg font-semibold text-white mb-4">插件信息预览</h3>
                <div className="bg-slate-700/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 bg-slate-600/50 rounded-lg flex items-center justify-center border border-slate-600 overflow-hidden flex-shrink-0">
                      {parsedPlugin.icon ? (
                        <img src={parsedPlugin.icon} alt="" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Package className="w-8 h-8 text-teal-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xl font-semibold text-white truncate">{parsedPlugin.name}</h4>
                      <p className="text-slate-400 mt-1">{parsedPlugin.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">插件标识</p>
                      <p className="font-mono text-sm text-white">{parsedPlugin.slug}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">版本</p>
                      <p className="font-mono text-sm text-white">{parsedPlugin.version}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">作者</p>
                      <p className="text-white">{parsedPlugin.author}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">QGIS 最低版本</p>
                      <p className="font-mono text-white">{parsedPlugin.qgisMinVersion}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-600/50">
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      分类 <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-slate-600/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">请选择分类</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.name}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {parsedPlugin.dependencies && parsedPlugin.dependencies.length > 0 && (
                    <div className="pt-4 border-t border-slate-600/50">
                      <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">依赖项</p>
                      <div className="flex flex-wrap gap-2">
                        {parsedPlugin.dependencies.map((dep, idx) => (
                          <span
                            key={idx}
                            className={`text-xs px-2 py-1 rounded ${
                              dep.optional
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-teal-500/20 text-teal-400'
                            }`}
                          >
                            {dep.dependencyName}
                            {dep.minVersion && ` (${dep.minVersion}+)`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 bg-teal-500/10 border border-teal-500/30 rounded-lg">
                <Info className="w-5 h-5 text-teal-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-teal-400/80">
                  <p className="font-medium text-teal-400">上传须知</p>
                  <ul className="mt-2 space-y-1 list-disc list-inside">
                    <li>插件将被自动解析并添加到仓库</li>
                    <li>管理员可能会审核您提交的插件</li>
                    <li>请确保您拥有该插件的合法版权</li>
                    <li>插件需符合 QGIS 插件开发规范</li>
                  </ul>
                </div>
              </div>

              {!selectedCategory && (
                <div className="flex items-center gap-2 text-orange-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>请先选择插件分类</span>
                </div>
              )}
            </div>
          )}

          {uploadSuccess && (
            <div className="mt-6 flex items-center justify-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">上传成功！</p>
                <p className="text-sm text-green-400/80">正在跳转到插件详情页...</p>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="mt-6 flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">上传失败</p>
                <p className="text-sm text-red-400/80 mt-1">{uploadError}</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

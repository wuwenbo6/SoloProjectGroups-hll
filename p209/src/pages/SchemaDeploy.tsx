import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, AlertCircle, Check, Play, ArrowLeft, FileCode, FileText, RefreshCw, Copy, CheckCheck, AlertTriangle, Terminal, Database, Search, Zap } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useLdapStore } from '../store/ldapStore.js';
import { useAttributeStore } from '../store/attributeStore.js';
import { useSchemaStore } from '../store/schemaStore.js';

export default function SchemaDeploy() {
  const navigate = useNavigate();
  const { isConnected } = useLdapStore();
  const { fetchSchema } = useSchemaStore();
  const {
    generatedLdif,
    generatedSchemaFile,
    generatedIndexConfig,
    indexConfigs,
    isGenerating,
    isDeploying,
    isReindexing,
    generateErrors,
    generateWarnings,
    deployResult,
    reindexResult,
    draftAttributes,
    deploySchema,
    downloadLdif,
    downloadSchemaFile,
    downloadIndexConfig,
    clearDeployResult,
    clearReindexResult,
    generateSchema,
    reindex,
  } = useAttributeStore();

  const [activeTab, setActiveTab] = useState<'ldif' | 'schema' | 'index'>('ldif');
  const [copied, setCopied] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [databaseDn, setDatabaseDn] = useState('olcDatabase={1}mdb,cn=config');
  const [showReindexOptions, setShowReindexOptions] = useState(false);

  const handleCopy = async () => {
    let content: string | null = null;
    if (activeTab === 'ldif') content = generatedLdif;
    else if (activeTab === 'schema') content = generatedSchemaFile;
    else if (activeTab === 'index') content = generatedIndexConfig;
    
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDeploy = async () => {
    const success = await deploySchema(restartRequired);
    if (success) {
      await fetchSchema();
    }
  };

  const handleRegenerate = async () => {
    clearDeployResult();
    clearReindexResult();
    await generateSchema();
  };

  const handleReindex = async () => {
    reindex(databaseDn);
  };

  const getActiveContent = () => {
    if (activeTab === 'ldif') return generatedLdif;
    if (activeTab === 'schema') return generatedSchemaFile;
    if (activeTab === 'index') return generatedIndexConfig;
    return null;
  };

  const handleDownload = () => {
    if (activeTab === 'ldif') downloadLdif();
    else if (activeTab === 'schema') downloadSchemaFile();
    else if (activeTab === 'index') downloadIndexConfig();
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-600 mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            未连接到 LDAP 服务器
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            请先配置并连接到 LDAP 服务器
          </p>
          <button
            onClick={() => navigate('/connection')}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 mx-auto"
          >
            前往连接配置
          </button>
        </div>
      </div>
    );
  }

  if (!generatedLdif && !isGenerating && generateErrors.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 text-slate-400 mb-4">
            <FileCode className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            尚未生成 Schema
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            请先在新属性定义页面定义属性并生成 Schema
          </p>
          <button
            onClick={() => navigate('/attributes/new')}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 mx-auto"
          >
            前往定义属性
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3 mb-2">
                <Upload className="w-8 h-8 text-primary" />
                Schema 生成与部署
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                预览生成的 Schema 文件，下载或部署到 LDAP 服务器
              </p>
            </div>
            <button
              onClick={() => navigate('/attributes/new')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              返回编辑
            </button>
          </div>

          {generateErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
                    生成 Schema 时发生错误
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {generateErrors.map((err, idx) => (
                      <li key={idx} className="text-sm text-red-600 dark:text-red-400">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {generateWarnings.length > 0 && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                    警告信息
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    {generateWarnings.map((warn, idx) => (
                      <li key={idx} className="text-sm text-amber-600 dark:text-amber-400">
                        {warn}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {deployResult && (
            <div
              className={`mb-6 p-4 rounded-xl border ${
                deployResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-3 mb-4">
                {deployResult.success ? (
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      deployResult.success
                        ? 'text-green-800 dark:text-green-300'
                        : 'text-red-800 dark:text-red-300'
                    }`}
                  >
                    {deployResult.success ? '部署成功' : '部署失败'}
                  </p>
                  <p
                    className={`text-sm ${
                      deployResult.success
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {deployResult.message}
                  </p>
                  {deployResult.restartRequired && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                      注意：需要重启 LDAP 服务器才能使更改生效
                    </p>
                  )}
                </div>
                <button
                  onClick={clearDeployResult}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  关闭
                </button>
              </div>

              {deployResult.deployLog && deployResult.deployLog.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      部署日志
                    </span>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-auto">
                    {deployResult.deployLog.map((log, idx) => (
                      <div
                        key={idx}
                        className={`text-sm font-mono ${
                          log.includes('Error') || log.includes('error') || log.includes('失败')
                            ? 'text-red-400'
                            : log.includes('Success') || log.includes('success') || log.includes('成功')
                            ? 'text-green-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {reindexResult && (
            <div
              className={`mb-6 p-4 rounded-xl border ${
                reindexResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-3 mb-4">
                {reindexResult.success ? (
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      reindexResult.success
                        ? 'text-green-800 dark:text-green-300'
                        : 'text-red-800 dark:text-red-300'
                    }`}
                  >
                    {reindexResult.success ? '索引配置已添加' : '索引配置失败'}
                  </p>
                  <p
                    className={`text-sm ${
                      reindexResult.success
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {reindexResult.message}
                  </p>
                  {reindexResult.restartRequired && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 mt-2">
                      注意：需要运行 slapindex 或重启 slapd 来构建实际索引
                    </p>
                  )}
                </div>
                <button
                  onClick={clearReindexResult}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  关闭
                </button>
              </div>

              {reindexResult.log && reindexResult.log.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      重新索引日志
                    </span>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-auto">
                    {reindexResult.log.map((log, idx) => (
                      <div
                        key={idx}
                        className={`text-sm font-mono ${
                          log.includes('Error') || log.includes('error') || log.includes('失败')
                            ? 'text-red-400'
                            : log.includes('Success') || log.includes('success') || log.includes('成功')
                            ? 'text-green-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
                  <button
                    onClick={() => setActiveTab('ldif')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === 'ldif'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    LDIF 文件
                  </button>
                  <button
                    onClick={() => setActiveTab('schema')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === 'schema'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <FileCode className="w-4 h-4" />
                    Schema 文件
                  </button>
                  <button
                    onClick={() => setActiveTab('index')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                      activeTab === 'index'
                        ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Database className="w-4 h-4" />
                    索引配置
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
                    title="复制到剪贴板"
                  >
                    {copied ? (
                      <CheckCheck className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
                    title="下载文件"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[600px] overflow-auto">
                {isGenerating ? (
                  <div className="p-12 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 dark:text-slate-400">正在生成 Schema...</p>
                  </div>
                ) : (
                  <SyntaxHighlighter
                  language="plaintext"
                  style={oneDark}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: 'transparent',
                    fontSize: '13px',
                  }}
                  showLineNumbers
                  lineNumberStyle={{
                    minWidth: '3em',
                    paddingRight: '1em',
                    color: '#64748b',
                    userSelect: 'none',
                  }}
                >
                  {getActiveContent() || ''}
                </SyntaxHighlighter>
              )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                部署到 LDAP
              </h2>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    部署内容概览
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">属性数量</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {draftAttributes.filter((a) => a.name && a.oid).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">索引数量</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {indexConfigs.length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">文件格式</span>
                      <span className="font-medium text-slate-900 dark:text-white">LDIF</span>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restartRequired}
                    onChange={(e) => setRestartRequired(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500/50"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      需要重启服务器
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      某些 LDAP 配置更改需要重启服务才能生效
                    </p>
                  </div>
                </label>

                <button
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                  重新生成
                </button>

                <button
                  onClick={handleDeploy}
                  disabled={isDeploying || !generatedLdif}
                  className="w-full px-4 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isDeploying ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      部署中...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      部署到 LDAP 服务器
                    </>
                  )}
                </button>
              </div>
            </div>

            {indexConfigs.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5 text-primary" />
                  索引管理
                </h2>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
                      将建立索引的属性
                    </h3>
                    <div className="space-y-2">
                      {indexConfigs.map((config, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-slate-900 dark:text-white">
                            {config.attributeName}
                          </span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {config.indexTypes.join(', ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                <button
                  onClick={() => setShowReindexOptions(!showReindexOptions)}
                  className="w-full px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
                >
                  {showReindexOptions ? '收起选项' : '高级选项'}
                </button>

                {showReindexOptions && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        数据库 DN
                      </label>
                      <input
                        type="text"
                        value={databaseDn}
                        onChange={(e) => setDatabaseDn(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        OpenLDAP cn=config 中的数据库条目
                      </p>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleReindex}
                  disabled={isReindexing || indexConfigs.length === 0}
                  className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                >
                  {isReindexing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      处理中...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      添加索引配置
                    </>
                  )}
                </button>

                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>注意：</strong>添加索引配置后，需要运行 <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">slapindex</code> 命令或重启 slapd 来构建实际的索引数据。
                  </p>
                </div>
              </div>
            </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                下载文件
              </h2>

              <div className="space-y-3">
                <button
                  onClick={downloadLdif}
                  disabled={!generatedLdif}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileText className="w-5 h-5" />
                  下载 LDIF 文件
                </button>
                <button
                  onClick={downloadSchemaFile}
                  disabled={!generatedSchemaFile}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileCode className="w-5 h-5" />
                  下载 Schema 文件
                </button>
                {generatedIndexConfig && (
                  <button
                    onClick={downloadIndexConfig}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Database className="w-5 h-5" />
                    下载索引配置
                  </button>
                )}
              </div>

              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>LDIF</strong>: 用于直接导入到 LDAP 服务器的格式<br />
                  <strong>Schema</strong>: OpenLDAP 配置目录中使用的 schema 文件格式<br />
                  <strong>索引配置</strong>: olcDbIndex 配置的 LDIF 格式
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

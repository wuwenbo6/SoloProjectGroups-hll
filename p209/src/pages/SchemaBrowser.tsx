import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Search, Filter, RefreshCw, AlertCircle, Loader2, ChevronRight, Tag, Hash, ToggleLeft, List, FileCode, ArrowRight, Download, FileDown } from 'lucide-react';
import { useLdapStore } from '../store/ldapStore.js';
import { useSchemaStore } from '../store/schemaStore.js';
import { LDAP_SYNTAX_OPTIONS } from '../../shared/types.js';
import type { LdapObjectClass, LdapAttributeType } from '../../shared/types.js';

export default function SchemaBrowser() {
  const navigate = useNavigate();
  const { isConnected } = useLdapStore();
  const {
    objectClasses,
    attributeTypes,
    loading,
    error,
    selectedObjectClass,
    selectedAttributeType,
    searchQuery,
    filterType,
    fetchSchema,
    setSelectedObjectClass,
    setSelectedAttributeType,
    setSearchQuery,
    setFilterType,
    exportSchemaAsLdif,
    isExporting,
  } = useSchemaStore();

  const [activeTab, setActiveTab] = useState<'objectClass' | 'attributeType'>('objectClass');
  const [exportFormat, setExportFormat] = useState<'add' | 'full'>('add');
  const [showExportOptions, setShowExportOptions] = useState(false);

  const handleExport = async (selectedOnly: boolean) => {
    const ldifContent = await exportSchemaAsLdif(exportFormat, selectedOnly);
    if (ldifContent) {
      const blob = new Blob([ldifContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = selectedOnly ? `selected-schema-${timestamp}.ldif` : `full-schema-${timestamp}.ldif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    if (isConnected && objectClasses.length === 0 && attributeTypes.length === 0) {
      fetchSchema();
    }
  }, [isConnected, objectClasses.length, attributeTypes.length, fetchSchema]);

  const syntaxLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    LDAP_SYNTAX_OPTIONS.forEach((opt) => {
      map[opt.value] = opt.label;
    });
    return map;
  }, []);

  const filteredObjectClasses = useMemo(() => {
    if (!searchQuery.trim()) return objectClasses;
    const query = searchQuery.toLowerCase();
    return objectClasses.filter(
      (oc) =>
        oc.name.some((n) => n.toLowerCase().includes(query)) ||
        oc.oid.toLowerCase().includes(query) ||
        oc.description?.toLowerCase().includes(query)
    );
  }, [objectClasses, searchQuery]);

  const filteredAttributeTypes = useMemo(() => {
    if (!searchQuery.trim()) return attributeTypes;
    const query = searchQuery.toLowerCase();
    return attributeTypes.filter(
      (at) =>
        at.name.some((n) => n.toLowerCase().includes(query)) ||
        at.oid.toLowerCase().includes(query) ||
        at.description?.toLowerCase().includes(query)
    );
  }, [attributeTypes, searchQuery]);

  const handleRefresh = () => {
    fetchSchema();
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
            请先配置并连接到 LDAP 服务器，然后才能浏览 Schema
          </p>
          <button
            onClick={() => navigate('/connection')}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2 mx-auto"
          >
            前往连接配置
            <ArrowRight className="w-4 h-4" />
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
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                <Database className="w-8 h-8 text-primary" />
                Schema 浏览
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                浏览 LDAP 服务器上的所有 objectClass 和 attributeType 定义
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowExportOptions(!showExportOptions)}
                  disabled={isExporting || (objectClasses.length === 0 && attributeTypes.length === 0)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  导出 LDIF
                </button>
                {showExportOptions && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-20 p-4">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">导出格式</h4>
                    <div className="space-y-2 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="exportFormat"
                          value="add"
                          checked={exportFormat === 'add'}
                          onChange={() => setExportFormat('add')}
                          className="text-primary focus:ring-primary/50"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Modify (add)</span>
                          <p className="text-xs text-slate-500 dark:text-slate-400">适用于添加到已有Schema</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="exportFormat"
                          value="full"
                          checked={exportFormat === 'full'}
                          onChange={() => setExportFormat('full')}
                          className="text-primary focus:ring-primary/50"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Full entry</span>
                          <p className="text-xs text-slate-500 dark:text-slate-400">完整的 cn=schema 条目</p>
                        </div>
                      </label>
                    </div>
                    <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3">
                      <button
                        onClick={() => { handleExport(true); setShowExportOptions(false); }}
                        disabled={!selectedObjectClass && !selectedAttributeType}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <FileDown className="w-4 h-4" />
                        导出选中项
                      </button>
                      <button
                        onClick={() => { handleExport(false); setShowExportOptions(false); }}
                        className="w-full px-3 py-2 text-sm rounded-lg bg-primary hover:bg-primary/90 text-white font-medium shadow-lg shadow-primary/25 transition-all flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        导出全部 Schema
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Tag className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {objectClasses.length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">ObjectClasses</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {attributeTypes.length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">AttributeTypes</p>
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <List className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">
                    {objectClasses.length + attributeTypes.length}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">总定义数</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称、OID 或描述..."
                className="w-full pl-12 pr-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                onClick={() => setActiveTab('objectClass')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'objectClass'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                ObjectClasses ({filteredObjectClasses.length})
              </button>
              <button
                onClick={() => setActiveTab('attributeType')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'attributeType'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                AttributeTypes ({filteredAttributeTypes.length})
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                {activeTab === 'objectClass' ? <Tag className="w-5 h-5 text-blue-500" /> : <Hash className="w-5 h-5 text-green-500" />}
                {activeTab === 'objectClass' ? 'ObjectClass 列表' : 'AttributeType 列表'}
              </h2>
            </div>

            {loading ? (
              <div className="p-12 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <p className="text-slate-500 dark:text-slate-400">正在加载 Schema...</p>
              </div>
            ) : error ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-red-600 dark:text-red-400 font-medium mb-2">加载失败</p>
                <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
                <button
                  onClick={handleRefresh}
                  className="mt-4 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all"
                >
                  重试
                </button>
              </div>
            ) : (
              <div className="max-h-[600px] overflow-auto">
                {activeTab === 'objectClass' ? (
                  filteredObjectClasses.length === 0 ? (
                    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                      没有找到匹配的 ObjectClass
                    </div>
                  ) : (
                    filteredObjectClasses.map((oc) => (
                      <button
                        key={oc.oid}
                        onClick={() => setSelectedObjectClass(oc)}
                        className={`w-full px-6 py-4 text-left border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all flex items-center justify-between group ${
                          selectedObjectClass?.oid === oc.oid
                            ? 'bg-primary/5 border-l-4 border-l-primary'
                            : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {oc.name[0]}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                oc.type === 'structural'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : oc.type === 'auxiliary'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              }`}
                            >
                              {oc.type}
                            </span>
                            {oc.obsolete && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                obsolete
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                            {oc.oid}
                          </p>
                          {oc.description && (
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                              {oc.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                      </button>
                    ))
                  )
                ) : filteredAttributeTypes.length === 0 ? (
                  <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                    没有找到匹配的 AttributeType
                  </div>
                ) : (
                  filteredAttributeTypes.map((at) => (
                    <button
                      key={at.oid}
                      onClick={() => setSelectedAttributeType(at)}
                      className={`w-full px-6 py-4 text-left border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all flex items-center justify-between group ${
                        selectedAttributeType?.oid === at.oid
                          ? 'bg-primary/5 border-l-4 border-l-primary'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-900 dark:text-white">
                            {at.name[0]}
                          </span>
                          {at.singleValue && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              单值
                            </span>
                          )}
                          {at.obsolete && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              obsolete
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                          {at.oid}
                        </p>
                        {at.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                            {at.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
              <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileCode className="w-5 h-5 text-primary" />
                详细信息
              </h2>
            </div>

            <div className="p-6">
              {selectedObjectClass ? (
                <ObjectClassDetail oc={selectedObjectClass} />
              ) : selectedAttributeType ? (
                <AttributeTypeDetail
                  at={selectedAttributeType}
                  syntaxLabelMap={syntaxLabelMap}
                />
              ) : (
                <div className="py-16 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
                    <Filter className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">
                    从左侧列表选择一个条目查看详细信息
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ObjectClassDetail({ oc }: { oc: LdapObjectClass }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{oc.name[0]}</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              oc.type === 'structural'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : oc.type === 'auxiliary'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
            }`}
          >
            {oc.type}
          </span>
        </div>
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{oc.oid}</p>
        {oc.description && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">{oc.description}</p>
        )}
      </div>

      {oc.superior && oc.superior.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            父类 (Superior)
          </h4>
          <div className="flex flex-wrap gap-2">
            {oc.superior.map((s) => (
              <span
                key={s}
                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-mono"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {oc.must.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
            <ToggleLeft className="w-4 h-4 text-red-500" />
            必须属性 (MUST)
          </h4>
          <div className="flex flex-wrap gap-2">
            {oc.must.map((m) => (
              <span
                key={m}
                className="px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-mono border border-red-200 dark:border-red-800"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {oc.may.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
            <ToggleLeft className="w-4 h-4 text-green-500" />
            可选属性 (MAY)
          </h4>
          <div className="flex flex-wrap gap-2">
            {oc.may.map((m) => (
              <span
                key={m}
                className="px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-mono border border-green-200 dark:border-green-800"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {oc.obsolete && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            此 ObjectClass 已标记为 obsolete（已废弃）
          </p>
        </div>
      )}

      {oc.name.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            别名 (Aliases)
          </h4>
          <div className="flex flex-wrap gap-2">
            {oc.name.slice(1).map((n) => (
              <span
                key={n}
                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-sm font-mono"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AttributeTypeDetail({
  at,
  syntaxLabelMap,
}: {
  at: LdapAttributeType;
  syntaxLabelMap: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{at.name[0]}</h3>
          {at.singleValue && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              单值
            </span>
          )}
          {at.collective && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
              集体属性
            </span>
          )}
        </div>
        <p className="text-sm font-mono text-slate-500 dark:text-slate-400">{at.oid}</p>
        {at.description && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">{at.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            语法类型
          </h4>
          <p className="text-sm font-medium text-slate-900 dark:text-white font-mono">
            {syntaxLabelMap[at.syntax] || at.syntax}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">{at.syntax}</p>
        </div>
        <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            值类型
          </h4>
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {at.singleValue ? '单值 (Single-Value)' : '多值 (Multi-Value)'}
          </p>
        </div>
      </div>

      {at.matchingRule && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
            相等匹配规则 (EQUALITY)
          </h4>
          <p className="text-sm font-medium text-blue-900 dark:text-blue-300 font-mono">
            {at.matchingRule}
          </p>
        </div>
      )}

      {at.substringMatchingRule && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">
            子串匹配规则 (SUBSTR)
          </h4>
          <p className="text-sm font-medium text-green-900 dark:text-green-300 font-mono">
            {at.substringMatchingRule}
          </p>
        </div>
      )}

      {at.orderingMatchingRule && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">
            排序匹配规则 (ORDERING)
          </h4>
          <p className="text-sm font-medium text-purple-900 dark:text-purple-300 font-mono">
            {at.orderingMatchingRule}
          </p>
        </div>
      )}

      {at.obsolete && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            此 AttributeType 已标记为 obsolete（已废弃）
          </p>
        </div>
      )}

      {at.name.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            别名 (Aliases)
          </h4>
          <div className="flex flex-wrap gap-2">
            {at.name.slice(1).map((n) => (
              <span
                key={n}
                className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-sm font-mono"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

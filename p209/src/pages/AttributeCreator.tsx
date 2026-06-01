import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Trash2, ArrowRight, AlertCircle, Check, Plus, Hash, Tag, FileText, ToggleLeft, List, Search, Database, ShieldCheck, ShieldAlert, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useLdapStore } from '../store/ldapStore.js';
import { useAttributeStore } from '../store/attributeStore.js';
import { LDAP_SYNTAX_OPTIONS, MATCHING_RULE_OPTIONS, INDEX_TYPE_OPTIONS, DEFAULT_INDEX_TYPES } from '../../shared/types.js';
import type { NewAttributeDefinition, CompatibilityConflict } from '../../shared/types.js';

export default function AttributeCreator() {
  const navigate = useNavigate();
  const { isConnected } = useLdapStore();
  const {
    draftAttributes,
    addDraftAttribute,
    removeDraftAttribute,
    updateDraftAttribute,
    clearDraftAttributes,
    generateSchema,
    isGenerating,
    generateErrors,
    generateWarnings,
    objectClassName,
    objectClassOid,
    objectClassType,
    createObjectClass,
    setObjectClassName,
    setObjectClassOid,
    setObjectClassType,
    setCreateObjectClass,
    checkCompatibility,
    compatibilityConflicts,
    isCheckingCompatibility,
    compatibilitySummary,
    clearCompatibilityResult,
  } = useAttributeStore();

  const [showCompatibilityPanel, setShowCompatibilityPanel] = useState(false);

  const handleCompatibilityCheck = async () => {
    setShowCompatibilityPanel(true);
    await checkCompatibility();
  };

  const handleGenerate = async () => {
    const success = await generateSchema();
    if (success) {
      navigate('/deploy');
    }
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
            请先配置并连接到 LDAP 服务器，然后才能定义新属性
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
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3 mb-2">
            <PlusCircle className="w-8 h-8 text-primary" />
            新属性定义
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            定义新的 LDAP 属性类型，配置语法、单/多值等参数
          </p>
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
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
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

        <div className="space-y-6 mb-8">
          {draftAttributes.map((attr, index) => (
            <AttributeFormCard
              key={index}
              index={index}
              attribute={attr}
              isLast={index === draftAttributes.length - 1}
              canRemove={draftAttributes.length > 1}
              onUpdate={(updates) => updateDraftAttribute(index, updates)}
              onRemove={() => removeDraftAttribute(index)}
            />
          ))}
        </div>

        <button
          onClick={addDraftAttribute}
          className="w-full mb-8 p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-medium"
        >
          <Plus className="w-5 h-5" />
          添加另一个属性
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                兼容性检查
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                检查新定义是否与现有 Schema 冲突
              </p>
            </div>
            <div className="flex items-center gap-2">
              {compatibilityConflicts.length > 0 && (
                <button
                  onClick={() => {
                    setShowCompatibilityPanel(!showCompatibilityPanel);
                  }}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
                >
                  {showCompatibilityPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              )}
              <button
                onClick={handleCompatibilityCheck}
                disabled={isCheckingCompatibility}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {isCheckingCompatibility ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    检查中...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    检查兼容性
                  </>
                )}
              </button>
            </div>
          </div>

          {compatibilitySummary && (
            <div className={`p-3 rounded-lg mb-3 ${
              compatibilityConflicts.filter((c) => c.severity === 'error').length > 0
                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                : compatibilityConflicts.filter((c) => c.severity === 'warning').length > 0
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
            }`}>
              <div className="flex items-center gap-2">
                {compatibilityConflicts.filter((c) => c.severity === 'error').length > 0 ? (
                  <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0" />
                ) : compatibilityConflicts.filter((c) => c.severity === 'warning').length > 0 ? (
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                )}
                <p className={`text-sm font-medium ${
                  compatibilityConflicts.filter((c) => c.severity === 'error').length > 0
                    ? 'text-red-700 dark:text-red-300'
                    : compatibilityConflicts.filter((c) => c.severity === 'warning').length > 0
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  {compatibilitySummary}
                </p>
                <button
                  onClick={() => { clearCompatibilityResult(); setShowCompatibilityPanel(false); }}
                  className="ml-auto p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {showCompatibilityPanel && compatibilityConflicts.length > 0 && (
            <div className="space-y-2">
              {compatibilityConflicts.map((conflict, idx) => (
                <CompatibilityConflictItem key={idx} conflict={conflict} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-500" />
                创建 ObjectClass（可选）
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                将新定义的属性组织到一个自定义的 ObjectClass 中
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createObjectClass}
                onChange={(e) => setCreateObjectClass(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500/50"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                启用
              </span>
            </label>
          </div>

          {createObjectClass && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Hash className="w-4 h-4 text-purple-500" />
                  ObjectClass 名称 *
                </label>
                <input
                  type="text"
                  value={objectClassName}
                  onChange={(e) => setObjectClassName(e.target.value)}
                  placeholder="myCustomObjectClass"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <Hash className="w-4 h-4 text-purple-500" />
                  OID *
                </label>
                <input
                  type="text"
                  value={objectClassOid}
                  onChange={(e) => setObjectClassOid(e.target.value)}
                  placeholder="1.3.6.1.4.1.xxxxx.1.1"
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <List className="w-4 h-4 text-purple-500" />
                  类型
                </label>
                <select
                  value={objectClassType}
                  onChange={(e) => setObjectClassType(e.target.value as 'structural' | 'auxiliary')}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all"
                >
                  <option value="auxiliary">Auxiliary（辅助类）</option>
                  <option value="structural">Structural（结构类）</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4 justify-end">
          <button
            onClick={clearDraftAttributes}
            className="px-6 py-3 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
          >
            清空所有
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="px-8 py-3 rounded-lg bg-primary hover:bg-primary/90 text-white font-medium shadow-lg shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                生成中...
              </>
            ) : (
              <>
                生成 Schema
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompatibilityConflictItem({ conflict }: { conflict: CompatibilityConflict }) {
  const typeLabelMap: Record<string, string> = {
    oid_conflict: 'OID 冲突',
    name_conflict: '名称冲突',
    syntax_mismatch: '语法不一致',
    matching_rule_mismatch: '匹配规则不一致',
    single_value_mismatch: '单值/多值不一致',
    object_class_oid_conflict: 'ObjectClass OID 冲突',
    object_class_name_conflict: 'ObjectClass 名称冲突',
    object_class_superior_conflict: 'MUST/MAY 不一致',
  };

  return (
    <div className={`p-3 rounded-lg border ${
      conflict.severity === 'error'
        ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50'
        : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50'
    }`}>
      <div className="flex items-start gap-2">
        {conflict.severity === 'error' ? (
          <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              conflict.severity === 'error'
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
            }`}>
              {conflict.severity === 'error' ? '错误' : '警告'}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-medium">
              {typeLabelMap[conflict.type] || conflict.type}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono">
              {conflict.elementName}
            </span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {conflict.message}
          </p>
          {conflict.detail && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {conflict.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AttributeFormCard({
  index,
  attribute,
  isLast,
  canRemove,
  onUpdate,
  onRemove,
}: {
  index: number;
  attribute: NewAttributeDefinition;
  isLast: boolean;
  canRemove: boolean;
  onUpdate: (updates: Partial<NewAttributeDefinition>) => void;
  onRemove: () => void;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div
        className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">
            {index + 1}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              {attribute.name || `属性 ${index + 1}`}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
              {attribute.oid || '未设置 OID'}
            </p>
          </div>
          {attribute.name && attribute.oid && (
            <div className="ml-4">
              <Check className="w-5 h-5 text-green-500" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 transition-all"
          >
            {isCollapsed ? '展开' : '收起'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Tag className="w-4 h-4 text-primary" />
                属性名称 *
              </label>
              <input
                type="text"
                value={attribute.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                placeholder="myAttribute"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                以字母开头，只能包含字母、数字和连字符
              </p>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Hash className="w-4 h-4 text-primary" />
                OID *
              </label>
              <input
                type="text"
                value={attribute.oid}
                onChange={(e) => onUpdate({ oid: e.target.value })}
                placeholder="1.3.6.1.4.1.xxxxx.1.1"
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                对象标识符，例如 1.3.6.1.4.1.99999.1.1
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <FileText className="w-4 h-4 text-primary" />
              描述
            </label>
            <input
              type="text"
              value={attribute.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="属性描述信息"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <List className="w-4 h-4 text-primary" />
                语法类型 *
              </label>
              <select
                value={attribute.syntax}
                onChange={(e) => onUpdate({ syntax: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              >
                {LDAP_SYNTAX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <ToggleLeft className="w-4 h-4 text-primary" />
                相等匹配规则
              </label>
              <select
                value={attribute.matchingRule || ''}
                onChange={(e) => onUpdate({ matchingRule: e.target.value || undefined })}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              >
                <option value="">不指定</option>
                {MATCHING_RULE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} - {opt.description}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attribute.singleValue}
                onChange={(e) => onUpdate({ singleValue: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/50"
              />
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  单值属性
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  该属性只能有一个值
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attribute.mandatory}
                onChange={(e) => onUpdate({ mandatory: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/50"
              />
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  必须属性
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  在 ObjectClass 中作为 MUST 属性
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attribute.collective}
                onChange={(e) => onUpdate({ collective: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/50"
              />
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  集体属性
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  COLLECTIVE 类型属性
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={attribute.indexEnabled ?? true}
                onChange={(e) => onUpdate({ indexEnabled: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary/50"
              />
              <div>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  启用索引
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  为此属性创建数据库索引
                </p>
              </div>
            </label>
          </div>

          {(attribute.indexEnabled ?? true) && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-primary" />
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    索引类型
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  {INDEX_TYPE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={(attribute.indexTypes ?? DEFAULT_INDEX_TYPES).includes(opt.value)}
                        onChange={(e) => {
                          const currentTypes = attribute.indexTypes ?? [...DEFAULT_INDEX_TYPES];
                          if (e.target.checked) {
                            onUpdate({ indexTypes: [...currentTypes, opt.value] });
                          } else {
                            onUpdate({ indexTypes: currentTypes.filter((t) => t !== opt.value) });
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/50"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {opt.label}
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {opt.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

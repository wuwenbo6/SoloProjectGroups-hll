import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Copy,
  Download,
  FileCode,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useLogStore } from '@/store/useLogStore';
import {
  generateAllowRules,
  generateTEFile,
  generateAudit2AllowOutput,
  downloadFile,
  formatRuleAsAllow,
} from '@/utils/policyGenerator';
import type { AllowRule } from '@/utils/policyGenerator';

export function PolicyRecommendations() {
  const { parseResult } = useLogStore();
  const [expanded, setExpanded] = useState(false);
  const [moduleName, setModuleName] = useState('local_audit2allow');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showModuleSettings, setShowModuleSettings] = useState(false);

  const rules = useMemo(() => {
    if (!parseResult) return [];
    return generateAllowRules(parseResult.records);
  }, [parseResult]);

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const exportTEFile = () => {
    const content = generateTEFile(rules, moduleName);
    downloadFile(content, `${moduleName}.te`, 'text/plain');
  };

  const exportAllowRules = () => {
    const content = generateAudit2AllowOutput(rules);
    downloadFile(content, 'audit2allow.txt', 'text/plain');
  };

  if (!parseResult || rules.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          策略规则建议
          <span className="text-sm font-normal text-slate-500">
            (共 {rules.length} 条)
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {expanded ? '收起全部' : '展开全部'}
          </button>

          <button
            onClick={exportAllowRules}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Copy className="w-4 h-4" />
            导出 allow 规则
          </button>

          <button
            onClick={() => setShowModuleSettings(!showModuleSettings)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 transition-all"
          >
            <FileCode className="w-4 h-4" />
            导出 .te 模块
          </button>
        </div>
      </div>

      {showModuleSettings && (
        <div className="mb-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-emerald-700 mb-1">
                模块名称
              </label>
              <input
                type="text"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
            <button
              onClick={exportTEFile}
              className="mt-4 sm:mt-6 flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              下载 {moduleName}.te
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {(expanded ? rules : rules.slice(0, 5)).map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            isCopied={copiedIndex === index}
            onCopy={() => copyToClipboard(formatRuleAsAllow(rule), index)}
          />
        ))}
      </div>

      {!expanded && rules.length > 5 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-4 w-full py-2 text-sm text-cyan-600 hover:text-cyan-700 font-medium"
        >
          显示全部 {rules.length} 条规则
        </button>
      )}

      <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-700">
            <p className="font-medium mb-1">使用说明</p>
            <ul className="list-disc list-inside space-y-1 text-amber-600">
              <li>这些规则是基于 AVC 拒绝记录自动生成的</li>
              <li>
                导出 .te 文件后，在系统上编译加载:{' '}
                <code className="bg-amber-100 px-1 rounded">
                  make -f /usr/share/selinux/devel/Makefile {moduleName}.pp &amp;&amp;
                  semodule -i {moduleName}.pp
                </code>
              </li>
              <li>请谨慎审核规则，避免过度放宽安全策略</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RuleCardProps {
  rule: AllowRule;
  isCopied: boolean;
  onCopy: () => void;
}

function RuleCard({ rule, isCopied, onCopy }: RuleCardProps) {
  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-cyan-200 hover:bg-cyan-50 transition-all">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
              源: {rule.sourceType}
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
              目标: {rule.targetType}
            </span>
            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-xs font-medium rounded font-mono">
              {rule.tclass}
            </span>
          </div>
          <code className="text-sm font-mono text-slate-700 block overflow-x-auto">
            <span className="text-purple-600">allow</span>{' '}
            <span className="text-blue-600">{rule.sourceType}</span>{' '}
            <span className="text-amber-600">{rule.targetType}</span>
            <span className="text-slate-500">:</span>
            <span className="text-emerald-600">{rule.tclass}</span>{' '}
            <span className="text-slate-500">{'{'}</span>
            <span className="text-red-600">
              {Array.from(rule.permissions).sort().join(' ')}
            </span>
            <span className="text-slate-500">{'}'}</span>
            <span className="text-slate-500">;</span>
          </code>
        </div>
        <button
          onClick={onCopy}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-slate-200 transition-colors"
          title="复制规则"
        >
          {isCopied ? (
            <Check className="w-4 h-4 text-emerald-500" />
          ) : (
            <Copy className="w-4 h-4 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}

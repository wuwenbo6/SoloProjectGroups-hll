import React, { useState } from 'react';
import { LayoutTemplate, ChevronRight, X } from 'lucide-react';
import { ACL_TEMPLATES, resolveTemplatePlaceholders } from '../../shared/types';
import type { ACLTemplate, ACE } from '../../shared/types';

interface ACLTemplatePanelProps {
  onApply: (aces: ACE[]) => void;
  onClose: () => void;
}

const ACLTemplatePanel: React.FC<ACLTemplatePanelProps> = ({
  onApply,
  onClose,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<ACLTemplate | null>(null);
  const [ownerInput, setOwnerInput] = useState('user:');
  const [groupInput, setGroupInput] = useState('group:');

  const handleApply = () => {
    if (!selectedTemplate) return;
    const resolved = resolveTemplatePlaceholders(
      selectedTemplate.aces,
      ownerInput || 'user:owner',
      groupInput || 'group:staff',
    );
    onApply(resolved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl shadow-lg shadow-indigo-600/20">
              <LayoutTemplate className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">权限模板</h2>
              <p className="text-xs text-slate-400">选择预设 ACL 模板快速配置</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedTemplate ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ACL_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template)}
                  className="text-left p-4 bg-slate-800/50 border border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800 rounded-xl transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{template.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-sm">
                          {template.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">
                          {template.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {template.description}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-[10px] text-slate-500">
                          {template.aces.length} ACE
                        </span>
                        <ChevronRight className="h-3 w-3 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1"
              >
                ← 返回模板列表
              </button>

              <div className="flex items-start gap-3 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
                <span className="text-2xl">{selectedTemplate.icon}</span>
                <div>
                  <h3 className="font-bold text-slate-200">{selectedTemplate.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{selectedTemplate.description}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3">
                  模板参数
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      <span className="font-mono text-indigo-400">${'{OWNER}'}</span>
                      <span className="ml-1 text-slate-500">所有者主体</span>
                    </label>
                    <input
                      type="text"
                      value={ownerInput}
                      onChange={(e) => setOwnerInput(e.target.value)}
                      placeholder="user:username"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      <span className="font-mono text-indigo-400">${'{GROUP}'}</span>
                      <span className="ml-1 text-slate-500">所属组主体</span>
                    </label>
                    <input
                      type="text"
                      value={groupInput}
                      onChange={(e) => setGroupInput(e.target.value)}
                      placeholder="group:groupname"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-mono text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-300 mb-3">
                  预览 ({selectedTemplate.aces.length} ACE)
                </h4>
                <div className="bg-slate-950/50 border border-slate-700 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800/80">
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Type</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Flags</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Principal</th>
                        <th className="px-3 py-2 text-left text-slate-500 font-medium">Permissions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {selectedTemplate.aces.map((ace, i) => {
                        const resolved = resolveTemplatePlaceholders(
                          [ace],
                          ownerInput || 'user:owner',
                          groupInput || 'group:staff',
                        );
                        return (
                          <tr key={i} className="hover:bg-slate-800/30">
                            <td className="px-3 py-2">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  ace.type === 'A'
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-red-500/15 text-red-400'
                                }`}
                              >
                                {ace.type === 'A' ? 'Allow' : 'Deny'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-400">
                              {ace.flags || '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-300">
                              {resolved[0].principal}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-300">
                              {ace.permissions.join('')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedTemplate && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/80">
            <button
              type="button"
              onClick={() => setSelectedTemplate(null)}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-600/20 transition-colors"
            >
              应用模板
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ACLTemplatePanel;

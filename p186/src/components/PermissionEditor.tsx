import React from 'react';
import { PERMISSIONS, FLAGS } from '../../shared/types';

interface PermissionEditorProps {
  permissions: string[];
  flags: string;
  onPermissionsChange: (permissions: string[]) => void;
  onFlagsChange: (flags: string) => void;
}

const CATEGORY_LABELS: Record<string, { title: string; subtitle: string }> = {
  data: { title: '数据权限', subtitle: 'Data — 文件内容与目录操作' },
  attribute: { title: '属性权限', subtitle: 'Attribute — 元数据与ACL管理' },
};

const FLAG_GROUP_LABELS: Record<string, { title: string; subtitle: string }> = {
  inheritance: { title: '继承标志', subtitle: 'Inheritance — ACE 如何向下传播' },
  audit: { title: '审计标志', subtitle: 'Audit — 访问审计日志' },
};

const PermissionEditor: React.FC<PermissionEditorProps> = ({
  permissions,
  flags,
  onPermissionsChange,
  onFlagsChange,
}) => {
  const togglePermission = (code: string) => {
    if (permissions.includes(code)) {
      onPermissionsChange(permissions.filter((p) => p !== code));
    } else {
      onPermissionsChange([...permissions, code]);
    }
  };

  const toggleFlag = (code: string) => {
    if (flags.includes(code)) {
      onFlagsChange(flags.replace(code, ''));
    } else {
      onFlagsChange(flags + code);
    }
  };

  const groupedPermissions = {
    data: PERMISSIONS.filter((p) => p.category === 'data'),
    attribute: PERMISSIONS.filter((p) => p.category === 'attribute'),
  };

  const groupedFlags = {
    inheritance: FLAGS.filter((f) => f.group === 'inheritance'),
    audit: FLAGS.filter((f) => f.group === 'audit'),
  };

  const selectAllPerms = (category: 'data' | 'attribute') => {
    const catPerms = groupedPermissions[category].map((p) => p.code);
    const otherPerms = permissions.filter(
      (p) => !groupedPermissions[category].some((gp) => gp.code === p)
    );
    onPermissionsChange([...otherPerms, ...catPerms]);
  };

  const clearCategoryPerms = (category: 'data' | 'attribute') => {
    const remaining = permissions.filter(
      (p) => !groupedPermissions[category].some((gp) => gp.code === p)
    );
    onPermissionsChange(remaining);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline gap-2 mb-3">
          <h4 className="text-sm font-semibold text-slate-200">标志位</h4>
          <span className="text-xs text-slate-500">Flags</span>
        </div>
        {(['inheritance', 'audit'] as const).map((group) => (
          <div key={group} className="mb-3">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-medium text-slate-400">
                {FLAG_GROUP_LABELS[group].title}
              </span>
              <span className="text-[10px] text-slate-600">
                {FLAG_GROUP_LABELS[group].subtitle}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {groupedFlags[group].map((flag) => (
                <button
                  key={flag.code}
                  type="button"
                  onClick={() => toggleFlag(flag.code)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all transform hover:scale-105 ${
                    flags.includes(flag.code)
                      ? group === 'inheritance'
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                        : 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                  }`}
                  title={flag.description}
                >
                  <span className="font-mono font-bold">{flag.code}</span>
                  <span className="ml-1 text-xs opacity-80">{flag.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-700/50 pt-5">
        {(['data', 'attribute'] as const).map((category) => (
          <div key={category} className="mb-5 last:mb-0">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <h4 className="text-sm font-semibold text-slate-200">
                  {CATEGORY_LABELS[category].title}
                </h4>
                <span className="text-[10px] text-slate-600">
                  {CATEGORY_LABELS[category].subtitle}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => selectAllPerms(category)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  全选
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={() => clearCategoryPerms(category)}
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  清空
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {groupedPermissions[category].map((perm) => (
                <label
                  key={perm.code}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${
                    permissions.includes(perm.code)
                      ? category === 'data'
                        ? 'bg-cyan-600/15 border border-cyan-500/40'
                        : 'bg-violet-600/15 border border-violet-500/40'
                      : 'bg-slate-800/50 border border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm.code)}
                    onChange={() => togglePermission(perm.code)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-sm text-slate-200">
                        {perm.code}
                      </span>
                      <span className="text-xs text-slate-400 truncate">
                        {perm.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {perm.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PermissionEditor;

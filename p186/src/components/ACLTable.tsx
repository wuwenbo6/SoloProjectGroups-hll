import React from 'react';
import { Edit2, Trash2, CheckCircle, XCircle, ArrowDown, Shield } from 'lucide-react';
import type { ACE } from '../../shared/types';
import { isInheritedACE, PERMISSIONS } from '../../shared/types';

interface ACLTableProps {
  aces: ACE[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  isLoading: boolean;
}

const DATA_PERM_CODES = new Set(PERMISSIONS.filter((p) => p.category === 'data').map((p) => p.code));

const ACLTable: React.FC<ACLTableProps> = ({
  aces,
  onEdit,
  onDelete,
  isLoading,
}) => {
  const getTypeColor = (type: string) => {
    return type === 'A'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';
  };

  const getTypeIcon = (type: string) => {
    return type === 'A' ? (
      <CheckCircle className="h-3.5 w-3.5" />
    ) : (
      <XCircle className="h-3.5 w-3.5" />
    );
  };

  const getTypeLabel = (type: string) => {
    return type === 'A' ? 'Allow' : 'Deny';
  };

  const getPermBadgeStyle = (permCode: string) => {
    if (DATA_PERM_CODES.has(permCode)) {
      return 'bg-cyan-600/20 border-cyan-500/40 text-cyan-300';
    }
    return 'bg-violet-600/20 border-violet-500/40 text-violet-300';
  };

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-12 bg-slate-800 rounded-t-lg mb-px" />
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-16 bg-slate-800/50 mb-px last:rounded-b-lg"
          />
        ))}
      </div>
    );
  }

  if (aces.length === 0) {
    return (
      <div className="text-center py-16 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
        <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-slate-600" />
        </div>
        <p className="text-slate-400 text-lg font-medium">No ACE entries found</p>
        <p className="text-slate-500 text-sm mt-1">
          输入路径并点击 "Load ACL" 查看条目
        </p>
      </div>
    );
  }

  let lastInherited: boolean | null = null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800/30">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/80">
              <th className="w-10 px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                #
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                来源
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                类型
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Flags
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Principal
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                权限掩码
              </th>
              <th className="w-28 px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {aces.map((ace, index) => {
              const inherited = isInheritedACE(ace);
              const showDivider = lastInherited !== null && lastInherited !== inherited;
              lastInherited = inherited;

              const dataPerms = ace.permissions.filter((p) => DATA_PERM_CODES.has(p));
              const attrPerms = ace.permissions.filter((p) => !DATA_PERM_CODES.has(p));

              return (
                <React.Fragment key={index}>
                  {showDivider && (
                    <tr>
                      <td colSpan={7} className="px-4 py-1 bg-slate-900/60">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 border-t border-dashed border-slate-600/50" />
                          <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                            <ArrowDown className="h-3 w-3 inline mr-1" />
                            自主条目 — Self-owned
                          </span>
                          <div className="flex-1 border-t border-dashed border-slate-600/50" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`group hover:bg-slate-700/30 transition-colors ${
                      inherited ? 'bg-amber-500/[0.03]' : ''
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-slate-500 font-mono text-sm">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inherited ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/25">
                          <ArrowDown className="h-3 w-3" />
                          继承
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-700/50 text-slate-400 border border-slate-600/50">
                          <Shield className="h-3 w-3" />
                          自主
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTypeColor(
                          ace.type
                        )}`}
                      >
                        {getTypeIcon(ace.type)}
                        <span className="font-mono font-bold">{ace.type}</span>
                        <span className="opacity-80">{getTypeLabel(ace.type)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm text-slate-300">
                        {ace.flags || (
                          <span className="text-slate-600">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm text-slate-200">
                        {ace.principal}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {dataPerms.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {dataPerms.map((perm, pIndex) => (
                              <span
                                key={`d-${pIndex}`}
                                className={`inline-flex items-center justify-center w-7 h-7 border rounded text-xs font-mono font-bold ${getPermBadgeStyle(perm)}`}
                                title={`数据权限: ${perm}`}
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                        {attrPerms.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {attrPerms.map((perm, pIndex) => (
                              <span
                                key={`a-${pIndex}`}
                                className={`inline-flex items-center justify-center w-7 h-7 border rounded text-xs font-mono font-bold ${getPermBadgeStyle(perm)}`}
                                title={`属性权限: ${perm}`}
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onEdit(index)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                          title="Edit ACE"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(index)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete ACE"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 bg-slate-900/50 border-t border-slate-700/50 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-cyan-600/30 border border-cyan-500/50" />
          数据权限 (Data)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-600/30 border border-violet-500/50" />
          属性权限 (Attribute)
        </span>
        <span className="flex items-center gap-1">
          <ArrowDown className="h-2.5 w-2.5 text-amber-400" />
          继承 (Inherited)
        </span>
        <span className="flex items-center gap-1">
          <Shield className="h-2.5 w-2.5 text-slate-400" />
          自主 (Self-owned)
        </span>
        <span className="ml-auto">排序: 继承 → 自主, Deny → Allow</span>
      </div>
    </div>
  );
};

export default ACLTable;

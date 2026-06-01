import { useState, useMemo, Fragment } from 'react';
import {
  Table,
  ChevronDown,
  ChevronRight,
  Filter,
  User,
  Target,
  KeyRound,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useLogStore } from '@/store/useLogStore';
import type { AvcRecord } from '@/types';
import { parseSecurityContext } from '@/types';

interface SecurityContextDisplayProps {
  context: string;
  isSource: boolean;
}

function SecurityContextDisplay({ context, isSource }: SecurityContextDisplayProps) {
  const parsed = parseSecurityContext(context);
  const colorClass = isSource ? 'text-blue-600' : 'text-amber-600';
  const bgClass = isSource ? 'bg-blue-50' : 'bg-amber-50';
  const Icon = isSource ? User : Target;

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-1 ${colorClass}`}>
        <Icon className="w-3 h-3" />
        <span className="text-xs font-medium">
          {isSource ? '源' : '目标'}: {parsed.type}
        </span>
      </div>
      <div className={`px-2 py-1 rounded ${bgClass}`}>
        <span className="font-mono text-xs" title={context}>
          {parsed.user}:{parsed.role}:{parsed.type}
          {parsed.level && (
            <span className="text-slate-400">:{parsed.level}</span>
          )}
        </span>
      </div>
    </div>
  );
}

export function DataTable() {
  const {
    parseResult,
    currentPage,
    pageSize,
    filterTclass,
    setCurrentPage,
    setFilterTclass,
  } = useLogStore();
  
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredRecords = useMemo(() => {
    if (!parseResult) return [];
    return filterTclass === 'all'
      ? parseResult.records
      : parseResult.records.filter((r) => r.tclass === filterTclass);
  }, [parseResult, filterTclass]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const tclasses = useMemo(() => {
    if (!parseResult) return ['all'];
    return ['all', ...Array.from(new Set(parseResult.records.map((r) => r.tclass)))];
  }, [parseResult]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const goToPage = (page: number) => {
    const safePage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(safePage);
  };

  if (!parseResult) return null;

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Table className="w-5 h-5 text-cyan-500" />
          违规记录详情
          <span className="text-sm font-normal text-slate-500">
            (共 {filteredRecords.length} 条)
          </span>
        </h2>
        
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterTclass}
            onChange={(e) => setFilterTclass(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {tclasses.map((tc) => (
              <option key={tc} value={tc}>
                {tc === 'all' ? '全部类型' : tc}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              <th className="w-8 px-3 py-3 text-left"></th>
              <th className="px-3 py-3 text-left text-slate-600 font-medium whitespace-nowrap">进程</th>
              <th className="px-3 py-3 text-left text-slate-600 font-medium min-w-[180px]">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-blue-500" />
                  源安全上下文
                </div>
              </th>
              <th className="px-3 py-3 text-left text-slate-600 font-medium min-w-[180px]">
                <div className="flex items-center gap-1">
                  <Target className="w-3 h-3 text-amber-500" />
                  目标安全上下文
                </div>
              </th>
              <th className="px-3 py-3 text-left text-slate-600 font-medium whitespace-nowrap">权限</th>
              <th className="px-3 py-3 text-left text-slate-600 font-medium whitespace-nowrap">类型</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRecords.map((record: AvcRecord) => (
              <Fragment key={record.id}>
                <tr
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(record.id)}
                >
                  <td className="px-3 py-3">
                    {expandedId === record.id ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-700">{record.comm}</span>
                      <span className="text-slate-400 text-xs">PID: {record.pid}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <SecurityContextDisplay context={record.scontext} isSource={true} />
                  </td>
                  <td className="px-3 py-3">
                    <SecurityContextDisplay context={record.tcontext} isSource={false} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {record.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium whitespace-nowrap"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                      {record.tclass}
                    </span>
                  </td>
                </tr>
                {expandedId === record.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex items-start gap-2">
                        <KeyRound className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
                            <div>
                              <p className="text-xs text-slate-500 mb-1">完整源上下文:</p>
                              <code className="text-xs text-blue-600 bg-white p-2 rounded border block overflow-x-auto">
                                {record.scontext}
                              </code>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 mb-1">完整目标上下文:</p>
                              <code className="text-xs text-amber-600 bg-white p-2 rounded border block overflow-x-auto">
                                {record.tcontext}
                              </code>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mb-1">原始日志:</p>
                          <code className="text-xs text-slate-700 bg-white p-2 rounded border block overflow-x-auto whitespace-pre-wrap">
                            {record.raw}
                          </code>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 pt-4 border-t border-slate-200 gap-4">
          <div className="text-sm text-slate-500">
            显示 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredRecords.length)} 条，
            共 {filteredRecords.length} 条，第 {currentPage} / {totalPages} 页
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="第一页"
            >
              <ChevronsLeft className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="上一页"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600" />
            </button>
            
            <div className="flex items-center gap-1 px-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 text-center border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <span className="text-slate-500 text-sm">/ {totalPages}</span>
            </div>
            
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="下一页"
            >
              <ArrowRight className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="最后一页"
            >
              <ChevronsRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

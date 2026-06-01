import React, { useState, useMemo } from 'react';
import { Search, ChevronLeft, ChevronRight, AlertTriangle, Edit3, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { useTLPStore } from '@/store/tlpStore';
import { TLP } from '@/types/tlp';
import { cn } from '@/lib/utils';

const ITEMS_PER_PAGE = 20;

export const TLPList: React.FC = () => {
  const { parseResult, selectedTLP, selectTLP, modifiedTLPs } = useTLPStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const filteredTLP = useMemo(() => {
    if (!parseResult) return [];
    if (!searchTerm) return parseResult.tlps;

    const term = searchTerm.toLowerCase();
    return parseResult.tlps.filter((tlp) => {
      return (
        tlp.header.type.toLowerCase().includes(term) ||
        tlp.header.length.toString().includes(term) ||
        (tlp.header.address?.toString(16) || '').includes(term) ||
        (tlp.header.status || '').toLowerCase().includes(term)
      );
    });
  }, [parseResult, searchTerm]);

  const totalPages = Math.ceil(filteredTLP.length / ITEMS_PER_PAGE);
  const paginatedTLP = filteredTLP.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const getStatusColor = (tlp: TLP) => {
    if (modifiedTLPs.has(tlp.index)) return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    if (tlp.header.statusCode !== undefined && tlp.header.statusCode !== 0) {
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    }
    return 'bg-slate-700/50 text-slate-300 border-slate-600';
  };

  if (!parseResult) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>请先上传PCIe捕获文件</p>
      </div>
    );
  }

  if (parseResult.tlps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-4 text-amber-500" />
        <p>未解析到有效的TLP数据包</p>
        <p className="text-sm mt-2">{parseResult.parseErrors.join('; ')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="搜索TLP类型、地址、状态..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(0);
            }}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 z-10">
            <tr className="text-left text-slate-400 border-b border-slate-700">
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">类型</th>
              <th className="py-2 px-3 font-medium">长度</th>
              <th className="py-2 px-3 font-medium">地址</th>
              <th className="py-2 px-3 font-medium">ECRC</th>
              <th className="py-2 px-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTLP.map((tlp) => (
              <tr
                key={tlp.index}
                onClick={() => selectTLP(tlp)}
                className={cn(
                  "cursor-pointer border-b border-slate-800 transition-colors",
                  selectedTLP?.index === tlp.index
                    ? "bg-cyan-500/10"
                    : "hover:bg-slate-800/50"
                )}
              >
                <td className="py-2 px-3 font-mono text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    {modifiedTLPs.has(tlp.index) && (
                      <Edit3 className="w-3 h-3 text-amber-400" />
                    )}
                    {tlp.index}
                  </div>
                </td>
                <td className="py-2 px-3 font-mono text-xs">
                  <span className={cn(
                    "px-2 py-0.5 rounded border text-xs",
                    getStatusColor(tlp)
                  )}>
                    {tlp.header.type.split(' ')[0]}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-xs text-slate-300">
                  {tlp.header.length} DW
                </td>
                <td className="py-2 px-3 font-mono text-xs text-cyan-400">
                  {tlp.header.address !== undefined
                    ? `0x${tlp.header.address.toString(16).toUpperCase().padStart(8, '0')}`
                    : '-'}
                </td>
                <td className="py-2 px-3 font-mono text-xs">
                  {tlp.ecrc?.hasECRC ? (
                    tlp.ecrc.valid ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-red-400" />
                    )
                  ) : (
                    <ShieldX className="w-4 h-4 text-slate-600" />
                  )}
                </td>
                <td className="py-2 px-3 font-mono text-xs">
                  {tlp.header.statusCode !== undefined ? (
                    <span className={tlp.header.statusCode === 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {tlp.header.status}
                    </span>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-500">
          显示 {currentPage * ITEMS_PER_PAGE + 1} - {Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredTLP.length)} / {filteredTLP.length}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
            disabled={currentPage === 0}
            className="p-2 bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-2 text-xs text-slate-400">
            {currentPage + 1} / {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
            disabled={currentPage >= totalPages - 1}
            className="p-2 bg-slate-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

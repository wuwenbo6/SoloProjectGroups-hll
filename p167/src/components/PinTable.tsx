import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ChevronLeft, ChevronRight, Pin } from 'lucide-react';
import { Pin as PinType, PinType as PinTypeType } from '../types';
import { useSelectedChip } from '../hooks/useBSDLStore';

const PIN_TYPE_COLORS: Record<PinTypeType, string> = {
  input: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  output: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  inout: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  power: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  ground: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  control: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  other: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
};

const ITEMS_PER_PAGE = 20;

export const PinTable: React.FC = () => {
  const chip = useSelectedChip();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<PinTypeType | 'all'>('all');
  const [sortField, setSortField] = useState<'name' | 'type' | 'cell'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredPins = useMemo(() => {
    if (!chip) return [];

    let pins = [...chip.pins];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      pins = pins.filter(pin => 
        pin.name.toLowerCase().includes(term) ||
        (pin.description?.toLowerCase().includes(term))
      );
    }

    if (filterType !== 'all') {
      pins = pins.filter(pin => pin.type === filterType);
    }

    pins.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'type') {
        comparison = a.type.localeCompare(b.type);
      } else if (sortField === 'cell') {
        comparison = (a.cell || 0) - (b.cell || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return pins;
  }, [chip, searchTerm, filterType, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredPins.length / ITEMS_PER_PAGE);
  const paginatedPins = filteredPins.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: 'name' | 'type' | 'cell') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  if (!chip) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <Pin className="w-12 h-12 mb-3 opacity-50" />
        <p>请先选择一个芯片查看引脚信息</p>
      </div>
    );
  }

  const pinTypes: (PinTypeType | 'all')[] = ['all', 'input', 'output', 'inout', 'power', 'ground', 'control', 'other'];

  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索引脚名称..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                         text-slate-200 placeholder-slate-500 text-sm
                         focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as PinTypeType | 'all');
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg
                         text-slate-200 text-sm focus:outline-none focus:border-cyan-500
                         transition-colors cursor-pointer"
            >
              {pinTypes.map(type => (
                <option key={type} value={type}>
                  {type === 'all' ? '全部类型' : type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <span>共 {chip.pins.length} 个引脚</span>
          <span>筛选后 {filteredPins.length} 个</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  引脚名称
                  <ArrowUpDown className={`w-3.5 h-3.5 ${sortField === 'name' ? 'text-cyan-400' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('type')}
                  className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  类型
                  <ArrowUpDown className={`w-3.5 h-3.5 ${sortField === 'type' ? 'text-cyan-400' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => handleSort('cell')}
                  className="flex items-center gap-2 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  BS单元
                  <ArrowUpDown className={`w-3.5 h-3.5 ${sortField === 'cell' ? 'text-cyan-400' : ''}`} />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-slate-300">
                描述
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {paginatedPins.map((pin, index) => (
              <tr 
                key={pin.name}
                className="hover:bg-slate-700/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-slate-200">{pin.name}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-1 rounded-md text-xs font-medium border
                    ${PIN_TYPE_COLORS[pin.type]}`}>
                    {pin.type}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-slate-400">
                    {pin.cell !== undefined ? `#${pin.cell}` : '-'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-400 text-xs">
                    {pin.description || '-'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-700 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            第 {currentPage} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-600 text-slate-400
                         hover:bg-slate-700 hover:text-slate-200 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                      ${currentPage === pageNum
                        ? 'bg-cyan-500 text-white'
                        : 'text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                      }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-600 text-slate-400
                         hover:bg-slate-700 hover:text-slate-200 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {filteredPins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <Pin className="w-10 h-10 mb-2 opacity-50" />
          <p>没有找到匹配的引脚</p>
        </div>
      )}
    </div>
  );
};

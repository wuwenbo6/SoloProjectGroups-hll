import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { ParseResult, NALUnit, NAL_TYPE_COLORS, NAL_TYPE_NAMES, NALUnitType } from '../types';
import { formatBytes } from '../utils/h265Parser';

interface NALTableProps {
  result: ParseResult;
}

type SortField = 'index' | 'type' | 'size' | 'offset';
type SortOrder = 'asc' | 'desc';

export const NALTable: React.FC<NALTableProps> = ({ result }) => {
  const { nalUnits } = result;
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<NALUnitType | 'ALL'>('ALL');
  const [sortField, setSortField] = useState<SortField>('index');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [displayCount, setDisplayCount] = useState(100);

  const uniqueTypes = useMemo(() => {
    const types = new Set(nalUnits.map((n) => n.type));
    return Array.from(types);
  }, [nalUnits]);

  const filteredAndSorted = useMemo(() => {
    let filtered = nalUnits.filter((nal) => {
      const matchesSearch =
        searchTerm === '' ||
        nal.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        nal.index.toString().includes(searchTerm) ||
        nal.typeCode.toString().includes(searchTerm);

      const matchesType = typeFilter === 'ALL' || nal.type === typeFilter;

      return matchesSearch && matchesType;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'index':
          comparison = a.index - b.index;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'offset':
          comparison = a.offset - b.offset;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [nalUnits, searchTerm, typeFilter, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  const loadMore = () => {
    setDisplayCount((c) => Math.min(c + 100, filteredAndSorted.length));
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          NAL 单元详情
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-900/50 border border-gray-600/50 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-full sm:w-48"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as NALUnitType | 'ALL')}
            className="px-3 py-2 bg-gray-900/50 border border-gray-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50"
          >
            <option value="ALL">全部类型</option>
            {uniqueTypes.map((type) => (
              <option key={type} value={type}>
                {type} - {NAL_TYPE_NAMES[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 text-sm text-gray-400">
        显示 {Math.min(displayCount, filteredAndSorted.length)} / {filteredAndSorted.length} 个 NAL 单元
        {typeFilter !== 'ALL' && ` (已筛选: ${typeFilter})`}
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-gray-700/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr>
              <th
                className="px-4 py-3 text-left text-gray-400 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                onClick={() => handleSort('index')}
              >
                <div className="flex items-center gap-1">
                  索引
                  <SortIcon field="index" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-gray-400 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                onClick={() => handleSort('type')}
              >
                <div className="flex items-center gap-1">
                  类型
                  <SortIcon field="type" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium whitespace-nowrap">
                类型码
              </th>
              <th
                className="px-4 py-3 text-left text-gray-400 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                onClick={() => handleSort('size')}
              >
                <div className="flex items-center gap-1">
                  大小
                  <SortIcon field="size" />
                </div>
              </th>
              <th
                className="px-4 py-3 text-left text-gray-400 font-medium cursor-pointer hover:text-white transition-colors whitespace-nowrap"
                onClick={() => handleSort('offset')}
              >
                <div className="flex items-center gap-1">
                  偏移
                  <SortIcon field="offset" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium whitespace-nowrap">
                TID
              </th>
              <th className="px-4 py-3 text-left text-gray-400 font-medium whitespace-nowrap">
                首字节
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.slice(0, displayCount).map((nal, idx) => (
              <tr
                key={nal.index}
                className={`border-t border-gray-700/30 transition-colors hover:bg-gray-700/20 ${
                  idx % 2 === 0 ? 'bg-gray-900/30' : ''
                }`}
              >
                <td className="px-4 py-2 text-gray-300 font-mono">#{nal.index}</td>
                <td className="px-4 py-2">
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: NAL_TYPE_COLORS[nal.type] + '40' }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: NAL_TYPE_COLORS[nal.type] }}
                    />
                    {nal.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-400 font-mono">{nal.typeCode}</td>
                <td className="px-4 py-2 text-gray-300 font-mono">{formatBytes(nal.size)}</td>
                <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                  0x{nal.offset.toString(16).toUpperCase().padStart(8, '0')}
                </td>
                <td className="px-4 py-2 text-gray-400 font-mono">{nal.temporalId}</td>
                <td className="px-4 py-2 text-gray-500 font-mono text-xs">{nal.firstBytes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {displayCount < filteredAndSorted.length && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            className="px-4 py-2 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg text-sm transition-colors"
          >
            加载更多 (+100)
          </button>
        </div>
      )}
    </div>
  );
};

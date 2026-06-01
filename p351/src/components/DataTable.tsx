import { Database, Clock } from 'lucide-react';
import type { DataRecord } from '@/types';

interface DataTableProps {
  title: string;
  data: DataRecord[];
  type: 'publisher' | 'subscriber';
  highlightIds?: number[];
}

export default function DataTable({ title, data, type, highlightIds = [] }: DataTableProps) {
  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const isHighlighted = (id: number) => highlightIds.includes(id);

  const iconColorClass = type === 'publisher' ? 'text-pg' : 'text-emerald-500';
  const idColorClass = type === 'publisher' ? 'text-pg' : 'text-emerald-400';

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <Database className={`w-5 h-5 ${iconColorClass}`} />
          {title}
        </h2>
        <span className="badge badge-info">
          {data.length} 条记录
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm z-10">
            <tr className="text-left text-slate-400 text-xs">
              <th className="px-4 py-3 font-medium border-b border-slate-700/50">ID</th>
              <th className="px-4 py-3 font-medium border-b border-slate-700/50">数据</th>
              <th className="px-4 py-3 font-medium border-b border-slate-700/50">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  时间戳
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {data.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  暂无数据
                </td>
              </tr>
            ) : (
              data.map((record) => (
                <tr
                  key={record.id}
                  className={`table-row border-b border-slate-700/30 ${
                    isHighlighted(record.id) ? 'conflict-row' : ''
                  }`}
                >
                  <td className="px-4 py-2">
                    <span className={`font-bold ${idColorClass}`}>{record.id}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-300">{record.data}</td>
                  <td className="px-4 py-2 text-slate-500">{formatTime(record.timestamp)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

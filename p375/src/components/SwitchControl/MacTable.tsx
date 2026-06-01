import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Trash2, Clock } from 'lucide-react';
import type { MacTableEntry } from '../../types';

interface MacTableProps {
  entries: MacTableEntry[];
  onClear: () => void;
}

export function MacTable({ entries, onClear }: MacTableProps) {
  const formatAge = (age: number) => {
    if (age < 60) return `${age}s`;
    if (age < 3600) return `${Math.floor(age / 60)}m`;
    return `${Math.floor(age / 3600)}h`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl p-6 border border-slate-700 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-purple-400" />
          MAC 地址表
        </h3>
        <button
          onClick={onClear}
          className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-1"
        >
          <Trash2 className="w-4 h-4" />
          清空
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center text-slate-400 py-8">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>暂无 MAC 地址表项</p>
          <p className="text-xs mt-1">发送数据包后将自动学习 MAC 地址</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-60">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm">
              <tr className="text-slate-400 text-left">
                <th className="pb-2 font-medium">MAC 地址</th>
                <th className="pb-2 font-medium">端口</th>
                <th className="pb-2 font-medium text-right">剩余时间</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {entries.map((entry, index) => (
                  <motion.tr
                    key={entry.macAddress}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.03 }}
                    className="border-t border-slate-700/50 hover:bg-slate-700/30"
                  >
                    <td className="py-2 font-mono text-cyan-400">{entry.macAddress}</td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                        Port {entry.portId}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <span className="flex items-center justify-end gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        {formatAge(entry.age)}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}

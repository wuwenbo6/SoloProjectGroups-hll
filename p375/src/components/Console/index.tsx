import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Trash2, AlertCircle, AlertTriangle, Info, Bug } from 'lucide-react';
import type { LogEntry } from '../../types';

interface ConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function Console({ logs, onClear }: ConsoleProps) {
  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />;
      case 'info':
        return <Info className="w-3.5 h-3.5 text-blue-400" />;
      case 'debug':
        return <Bug className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Info className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-rose-400';
      case 'warning':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'debug':
        return 'text-purple-400';
      default:
        return 'text-slate-400';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border border-slate-700 backdrop-blur-sm flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-400" />
          <h3 className="font-semibold text-white">系统控制台</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
            {logs.length}
          </span>
        </div>
        <button
          onClick={onClear}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
          title="清空日志"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="overflow-y-auto max-h-48 p-2 font-mono text-xs space-y-1">
        {logs.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <Terminal className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>暂无日志</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log, index) => (
              <motion.div
                key={`${log.timestamp}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2 py-1 px-2 rounded hover:bg-slate-700/30"
              >
                <span className="text-slate-500 whitespace-nowrap mt-0.5">
                  {formatTime(log.timestamp)}
                </span>
                <span className="mt-0.5">{getLevelIcon(log.level)}</span>
                <span className={`uppercase font-semibold w-14 ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="text-slate-400 whitespace-nowrap">[{log.module}]</span>
                <span className="text-slate-300 flex-1">{log.message}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

import { useEffect, useRef } from 'react';
import { useStore } from '@/hooks/useStore';
import { AlertTriangle, Info, Bug, XCircle, ArrowDownToLine, ArrowUpFromLine, Cpu } from 'lucide-react';

const levelConfig = {
  INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  DEBUG: { icon: Bug, color: 'text-space-400', bg: 'bg-space-500/10' },
  WARNING: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ERROR: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const dirConfig = {
  IN: { icon: ArrowDownToLine, color: 'text-cyber-400' },
  OUT: { icon: ArrowUpFromLine, color: 'text-violet-400' },
  SYSTEM: { icon: Cpu, color: 'text-space-400' },
};

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function highlightPduType(msg: string, pduType?: string): React.ReactNode {
  if (!pduType) return msg;
  const parts = msg.split(pduType);
  if (parts.length < 2) return msg;
  return (
    <>
      {parts[0]}
      <span className="text-cyber-300 font-semibold bg-cyber-500/10 px-1 rounded">{pduType}</span>
      {parts.slice(1).join(pduType)}
    </>
  );
}

export function LogPanel() {
  const logs = useStore((s) => s.logs);
  const logFilter = useStore((s) => s.logFilter);
  const isPaused = useStore((s) => s.isLogPaused);
  const togglePause = useStore((s) => s.toggleLogPause);
  const setFilter = useStore((s) => s.setLogFilter);
  const clearLogs = useStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = logFilter
    ? logs.filter(
        (l) =>
          l.message.toLowerCase().includes(logFilter.toLowerCase()) ||
          l.pduType?.toLowerCase().includes(logFilter.toLowerCase())
      )
    : logs;

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, isPaused]);

  return (
    <div className="rounded-xl bg-space-900/60 backdrop-blur border border-space-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-space-800">
        <span className="text-space-400 text-xs font-medium uppercase tracking-wider">实时日志</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="过滤日志..."
            value={logFilter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-space-800 border border-space-700 rounded-md px-2.5 py-1 text-xs text-space-200 placeholder-space-600 focus:outline-none focus:border-cyber-600 w-36 transition-colors"
          />
          <button
            onClick={togglePause}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              isPaused
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-space-800 text-space-400 border border-space-700 hover:text-space-200'
            }`}
          >
            {isPaused ? '继续' : '暂停'}
          </button>
          <button
            onClick={clearLogs}
            className="px-2.5 py-1 text-xs rounded-md bg-space-800 text-space-400 border border-space-700 hover:text-red-400 transition-colors"
          >
            清空
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="h-[400px] overflow-y-auto font-mono text-xs leading-5">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-space-600">等待日志...</div>
        ) : (
          filtered.map((log) => {
            const lc = levelConfig[log.level] || levelConfig.INFO;
            const dc = dirConfig[log.direction] || dirConfig.SYSTEM;
            const LevelIcon = lc.icon;
            const DirIcon = dc.icon;
            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 px-4 py-1.5 border-b border-space-800/50 hover:bg-space-800/40 transition-colors ${lc.bg} animate-slide-in`}
              >
                <span className="text-space-600 shrink-0 w-20">{formatTime(log.timestamp)}</span>
                <LevelIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${lc.color}`} />
                <DirIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${dc.color}`} />
                <span className="text-space-300 break-all">{highlightPduType(log.message, log.pduType)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

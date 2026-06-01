import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { ConflictLog } from '@/types';
import { useSimStore } from '@/store/useSimStore';

const COLORS = ['#336791', '#f59e0b'];

export default function ConflictPanel() {
  const { state } = useSimStore();
  const logEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state?.conflict_logs, autoScroll]);

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  const chartData = state ? [
    { name: '保留传入', value: state.resolved_incoming, color: COLORS[0] },
    { name: '保留本地', value: state.resolved_existing, color: COLORS[1] },
  ] : [];

  return (
    <div className="card h-full flex flex-col">
      <div className="card-header">
        <h2 className="card-title">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          冲突监控
        </h2>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`text-xs px-2 py-1 rounded-md transition-colors ${
            autoScroll ? 'bg-pg/20 text-pg-light' : 'bg-slate-700 text-slate-400'
          }`}
        >
          {autoScroll ? '自动滚动' : '暂停滚动'}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="text-xs text-slate-400 mb-1">总冲突数</div>
            <div className="stat-value text-amber-400">
              {state?.conflict_count || 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
              <ArrowDown className="w-3 h-3 text-pg" />
              保留传入
            </div>
            <div className="stat-value text-pg-light">
              {state?.resolved_incoming || 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
              <ArrowUp className="w-3 h-3 text-amber-500" />
              保留本地
            </div>
            <div className="stat-value text-amber-400">
              {state?.resolved_existing || 0}
            </div>
          </div>
        </div>

        {state && state.conflict_count > 0 && (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={40}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px' }}
                  formatter={(value) => <span className="text-slate-400">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="border-t border-slate-700/50 pt-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Clock className="w-3 h-3" />
            解决日志
          </h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!state?.conflict_logs?.length ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            暂无冲突记录
          </div>
        ) : (
          <div className="space-y-2">
            {[...state.conflict_logs].reverse().map((log: ConflictLog) => (
              <div
                key={log.id}
                className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 animate-slide-in"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${
                      log.resolved_to === 'incoming' ? 'badge-success' : 'badge-warning'
                    }`}>
                      {log.resolved_to === 'incoming' ? (
                        <><CheckCircle2 className="w-3 h-3 inline mr-1" /> 传入获胜</>
                      ) : (
                        <><XCircle className="w-3 h-3 inline mr-1" /> 本地获胜</>
                      )}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      ID: {log.record_id}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{formatTime(log.timestamp)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-2 rounded ${
                    log.resolved_to === 'incoming' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50 border border-slate-700/50'
                  }`}>
                    <div className="text-slate-400 mb-1">传入记录</div>
                    <div className="font-mono text-slate-200">{log.incoming_value}</div>
                    <div className="text-slate-500 mt-1">ts: {log.incoming_ts.toFixed(6)}</div>
                  </div>
                  <div className={`p-2 rounded ${
                    log.resolved_to === 'existing' ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-800/50 border border-slate-700/50'
                  }`}>
                    <div className="text-slate-400 mb-1">本地记录</div>
                    <div className="font-mono text-slate-200">{log.existing_value}</div>
                    <div className="text-slate-500 mt-1">ts: {log.existing_ts.toFixed(6)}</div>
                  </div>
                </div>

                <div className="mt-2 text-xs text-slate-400 bg-slate-800/30 rounded px-2 py-1">
                  {log.reason}
                </div>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

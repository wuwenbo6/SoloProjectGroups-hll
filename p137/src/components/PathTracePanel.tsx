import React from 'react';
import { Route, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useStore } from '@/store/useStore';

const PathTracePanel: React.FC = () => {
  const { packetTraces, activePath, setActivePath, clearActivePath } = useStore();

  return (
    <div className="h-48 bg-slate-900 border-t border-slate-700 flex flex-col">
      <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-semibold text-sm">转发路径追踪</h3>
        </div>
        {activePath.length > 0 && (
          <button
            onClick={clearActivePath}
            className="text-xs text-slate-400 hover:text-white transition-colors"
          >
            清除高亮
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {packetTraces.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="text-center">
              <Route className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">暂无数据包追踪记录</p>
              <p className="text-xs mt-1">启动仿真后发送测试包</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {packetTraces.map((trace) => (
              <div
                key={trace.packet_id}
                onClick={() => setActivePath(trace.path)}
                className={`p-3 rounded-lg cursor-pointer transition-all ${
                  activePath === trace.path
                    ? 'bg-blue-600/20 border border-blue-500/50'
                    : 'bg-slate-800 border border-slate-700 hover:bg-slate-750'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded font-mono">
                      {trace.type}
                    </span>
                    <span className="text-slate-300 text-xs font-mono">
                      {trace.src} → {trace.dst}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                    <Clock className="w-3 h-3" />
                    {trace.hops.length} hops
                  </div>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {trace.hops.map((hop, index) => (
                    <React.Fragment key={index}>
                      <div
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${
                          hop.type === 'switch'
                            ? hop.rule_matched
                              ? 'bg-emerald-600/30 text-emerald-400'
                              : 'bg-slate-600/50 text-slate-400'
                            : 'bg-emerald-500/30 text-emerald-300'
                        }`}
                      >
                        {hop.type === 'switch' ? (
                          hop.rule_matched ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )
                        ) : null}
                        <span className="font-mono">{hop.node}</span>
                      </div>
                      {index < trace.hops.length - 1 && (
                        <span className="text-slate-500">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {trace.matched_rules.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700/50">
                    <p className="text-slate-400 text-xs mb-1">匹配的流表规则:</p>
                    {trace.matched_rules.map((match, idx) => (
                      <div key={idx} className="text-xs text-slate-300 font-mono">
                        {match.switch}: {Object.entries(match.rule.match)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ') || 'any'}
                        {' → '}
                        {match.rule.actions.map((a) => a.type).join(', ')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PathTracePanel;

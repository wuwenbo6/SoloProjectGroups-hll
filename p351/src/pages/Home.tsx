import { useEffect, useMemo, useState } from 'react';
import { Database, GitBranch, Activity, FileSpreadsheet, ScrollText, Code2, Clock } from 'lucide-react';
import ControlPanel from '@/components/ControlPanel';
import DataTable from '@/components/DataTable';
import ConflictPanel from '@/components/ConflictPanel';
import WALLog from '@/components/WALLog';
import AuditTable from '@/components/AuditTable';
import LuaEditor from '@/components/LuaEditor';
import LatencyChart from '@/components/LatencyChart';
import { useSimStore } from '@/store/useSimStore';

export default function Home() {
  const { state, initSocket, disconnectSocket, fetchState, error } = useSimStore();
  const [activeTab, setActiveTab] = useState<'wal' | 'audit'>('wal');
  const [rightTab, setRightTab] = useState<'conflict' | 'lua' | 'latency'>('conflict');

  useEffect(() => {
    initSocket();
    fetchState();

    const interval = setInterval(() => {
      if (!useSimStore.getState().isConnected) {
        fetchState();
      }
    }, 2000);

    return () => {
      disconnectSocket();
      clearInterval(interval);
    };
  }, [initSocket, disconnectSocket, fetchState]);

  const pubRecordIds = useMemo(() => {
    if (!state) return new Set<number>();
    return new Set(state.publisher_data.map((r) => r.id));
  }, [state?.publisher_data]);

  const subRecordIds = useMemo(() => {
    if (!state) return new Set<number>();
    return new Set(state.subscriber_data.map((r) => r.id));
  }, [state?.subscriber_data]);

  const divergingIds = useMemo(() => {
    if (!state) return [];
    const ids: number[] = [];
    const pubMap = new Map(state.publisher_data.map((r) => [r.id, r]));
    const subMap = new Map(state.subscriber_data.map((r) => [r.id, r]));

    for (const [id, pubRec] of pubMap) {
      const subRec = subMap.get(id);
      if (subRec && pubRec.data !== subRec.data) {
        ids.push(id);
      }
    }
    return ids;
  }, [state]);

  const resolverLabel = state?.lua_enabled ? 'Lua脚本 + UTC时间戳' : 'UTC时间戳';

  return (
    <div className="h-full flex flex-col bg-slate-950 grid-bg">
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800/50 bg-slate-900/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pg to-pg-dark flex items-center justify-center shadow-lg shadow-pg/20">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                PostgreSQL 逻辑复制模拟器
                <span className="text-xs font-normal bg-pg/20 text-pg-light px-2 py-0.5 rounded-full border border-pg/30">
                  v2.0
                </span>
                {state?.lua_enabled && (
                  <span className="text-xs font-normal bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
                    Lua
                  </span>
                )}
              </h1>
              <p className="text-xs text-slate-400">
                发布-订阅模式 · 冲突解决 · {resolverLabel}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-pg animate-pulse" />
            <span className="text-slate-400 text-xs">Pub</span>
            <span className="font-mono text-pg-light font-bold text-xs">{state?.publisher_data?.length || 0}</span>
          </div>
          <GitBranch className="w-4 h-4 text-slate-600" />
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 text-xs">Sub</span>
            <span className="font-mono text-emerald-400 font-bold text-xs">{state?.subscriber_data?.length || 0}</span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-1">
            <Activity className={`w-3 h-3 ${state?.is_running ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
            <span className="text-xs text-slate-400">冲突</span>
            <span className="font-mono text-amber-400 font-bold">{state?.conflict_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-xs text-slate-400">延迟</span>
            <span className="font-mono text-blue-400 font-bold">{state?.latency_stats?.avg_ms?.toFixed(1) || '0'}ms</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2 text-sm text-rose-400">
          {error}
        </div>
      )}

      <main className="flex-1 grid grid-cols-12 gap-3 p-3 overflow-hidden">
        <div className="col-span-2 h-full">
          <ControlPanel />
        </div>

        <div className="col-span-6 grid grid-rows-2 gap-3 h-full">
          <div className="grid grid-cols-2 gap-3">
            <DataTable
              title="Publisher (发布端)"
              data={state?.publisher_data || []}
              type="publisher"
              highlightIds={divergingIds}
            />
            <DataTable
              title="Subscriber (订阅端)"
              data={state?.subscriber_data || []}
              type="subscriber"
              highlightIds={divergingIds}
            />
          </div>
          <div className="h-full flex flex-col">
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setActiveTab('wal')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'wal'
                    ? 'bg-pg text-white shadow-lg shadow-pg/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" /> WAL 日志
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'audit'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Audit
                <span className="text-[10px] bg-slate-700 px-1 py-0.5 rounded-full">
                  {state?.audit_logs?.length || 0}
                </span>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {activeTab === 'wal' ? <WALLog /> : <AuditTable />}
            </div>
          </div>
        </div>

        <div className="col-span-4 h-full flex flex-col">
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setRightTab('conflict')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rightTab === 'conflict'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> 冲突监控
            </button>
            <button
              onClick={() => setRightTab('lua')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rightTab === 'lua'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" /> Lua 脚本
              {state?.lua_enabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
            <button
              onClick={() => setRightTab('latency')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rightTab === 'latency'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" /> 延迟趋势
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === 'conflict' && <ConflictPanel />}
            {rightTab === 'lua' && <LuaEditor />}
            {rightTab === 'latency' && <LatencyChart />}
          </div>
        </div>
      </main>

      <footer className="px-6 py-2 border-t border-slate-800/50 bg-slate-900/50 text-xs text-slate-500 flex items-center justify-between">
        <div>
          冲突解决策略：<span className="text-slate-300">{resolverLabel}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>发布端: {pubRecordIds.size}</span>
          <span>订阅端: {subRecordIds.size}</span>
          <span>不一致: {divergingIds.length}</span>
          <span>Audit: {state?.audit_logs?.length || 0}</span>
          <span>延迟事件: {state?.latency_stats?.count || 0}</span>
        </div>
      </footer>
    </div>
  );
}

import { useState } from 'react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Plus, 
  Edit3, 
  Zap,
  Database,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useSimStore } from '@/store/useSimStore';

export default function ControlPanel() {
  const { 
    state, 
    isConnected, 
    insertRecord, 
    updateRecord, 
    triggerConflict,
    startSimulation, 
    stopSimulation, 
    resetSimulation 
  } = useSimStore();

  const [insertId, setInsertId] = useState('');
  const [insertData, setInsertData] = useState('');
  const [updateId, setUpdateId] = useState('');
  const [updateData, setUpdateData] = useState('');
  const [conflictId, setConflictId] = useState('');
  const [interval, setInterval] = useState(1.0);
  const [conflictRate, setConflictRate] = useState(0.3);

  const handleInsert = () => {
    const id = insertId ? parseInt(insertId) : undefined;
    insertRecord(id, insertData || undefined);
    setInsertId('');
    setInsertData('');
  };

  const handleUpdate = () => {
    if (!updateId) return;
    updateRecord(parseInt(updateId), updateData || undefined);
    setUpdateId('');
    setUpdateData('');
  };

  const handleTriggerConflict = () => {
    if (!conflictId) return;
    triggerConflict(parseInt(conflictId));
    setConflictId('');
  };

  const handleToggleSim = () => {
    if (state?.is_running) {
      stopSimulation();
    } else {
      startSimulation(interval, conflictRate);
    }
  };

  return (
    <div className="card h-full flex flex-col neon-border">
      <div className="card-header">
        <h2 className="card-title">
          <Database className="w-5 h-5 text-pg" />
          控制面板
        </h2>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Wifi className="w-4 h-4" />
              已连接
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-rose-400">
              <WifiOff className="w-4 h-4" />
              未连接
            </span>
          )}
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        </div>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            手动操作
          </h3>
          
          <div className="space-y-2">
            <label className="text-xs text-slate-400">插入记录</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1 text-sm"
                placeholder="ID (可选)"
                value={insertId}
                onChange={(e) => setInsertId(e.target.value)}
              />
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="数据 (可选)"
                value={insertData}
                onChange={(e) => setInsertData(e.target.value)}
              />
              <button className="btn btn-success text-sm" onClick={handleInsert}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">更新记录</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1 text-sm"
                placeholder="ID"
                value={updateId}
                onChange={(e) => setUpdateId(e.target.value)}
              />
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="新数据 (可选)"
                value={updateData}
                onChange={(e) => setUpdateData(e.target.value)}
              />
              <button className="btn btn-primary text-sm" onClick={handleUpdate}>
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-slate-400">触发冲突</label>
            <div className="flex gap-2">
              <input
                type="number"
                className="input flex-1 text-sm"
                placeholder="ID"
                value={conflictId}
                onChange={(e) => setConflictId(e.target.value)}
              />
              <button className="btn btn-warning text-sm" onClick={handleTriggerConflict}>
                <Zap className="w-4 h-4" />
                冲突
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-700/50 pt-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            自动模拟
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">间隔: {interval}s</label>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.1"
                value={interval}
                onChange={(e) => setInterval(parseFloat(e.target.value))}
                className="w-32 accent-pg"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">冲突率: {Math.round(conflictRate * 100)}%</label>
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={conflictRate}
                onChange={(e) => setConflictRate(parseFloat(e.target.value))}
                className="w-32 accent-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className={`btn ${state?.is_running ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleSim}
            >
              {state?.is_running ? (
                <><Square className="w-4 h-4" /> 停止</>
              ) : (
                <><Play className="w-4 h-4" /> 开始</>
              )}
            </button>
            <button className="btn btn-secondary" onClick={resetSimulation}>
              <RotateCcw className="w-4 h-4" /> 重置
            </button>
          </div>
        </div>

        <div className="border-t border-slate-700/50 pt-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            运行状态
          </h3>
          <div className={`p-3 rounded-lg border ${state?.is_running ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-700/30 border-slate-600/30'}`}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state?.is_running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-sm font-medium">
                {state?.is_running ? '模拟运行中' : '模拟已停止'}
              </span>
            </div>
            {state?.is_running && (
              <p className="text-xs text-slate-400 mt-1 ml-4">
                间隔 {interval}s · 冲突率 {Math.round(conflictRate * 100)}%
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

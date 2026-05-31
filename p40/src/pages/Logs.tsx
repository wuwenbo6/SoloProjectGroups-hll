import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, Calendar, User, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogEntry } from '../types';

export const Logs: React.FC = () => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const limit = 20;

  useEffect(() => {
    fetchLogs();
  }, [page]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?page=${page}&limit=${limit}`);
      const data = await res.json();
      setLogs(data.data || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#050d18] via-[#0a1628] to-[#0a1628] text-white p-4 md:p-6">
      <header className="mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg bg-[#1a3a5c]/50 border border-cyan-500/20 hover:bg-[#1a3a5c]/70 transition-all"
          >
            <ArrowLeft size={20} className="text-cyan-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent font-mono">
              操作日志
            </h1>
            <p className="text-white/60 text-sm mt-1 font-mono">
              记录所有机器人控制操作
            </p>
          </div>
        </div>
      </header>

      <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20">
        <div className="p-4 border-b border-cyan-500/10">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="搜索日志..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <button
              onClick={fetchLogs}
              className="px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 transition-all text-sm font-mono"
            >
              刷新
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs font-mono text-white/60 bg-[#1a3a5c]/20">
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作</th>
                <th className="px-4 py-3">用户</th>
                <th className="px-4 py-3">IP地址</th>
                <th className="px-4 py-3">指令</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                    加载中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                    暂无日志记录
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs font-mono text-white/60">
                        <Calendar size={12} />
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded text-xs font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <User size={14} className="text-white/40" />
                        <span className="text-white/80">用户 #{log.userId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-white/40">
                        {log.ipAddress || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-cyan-400/60 truncate max-w-xs block">
                        {log.commandJson ? JSON.stringify(JSON.parse(log.commandJson), null, 0) : '-'}
                      </code>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-cyan-500/10 flex items-center justify-between">
          <span className="text-xs font-mono text-white/60">
            共 {total} 条记录，第 {page} / {totalPages || 1} 页
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded bg-[#1a3a5c]/50 border border-white/10 disabled:opacity-30 hover:bg-[#1a3a5c]/70 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded bg-[#1a3a5c]/50 border border-white/10 disabled:opacity-30 hover:bg-[#1a3a5c]/70 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

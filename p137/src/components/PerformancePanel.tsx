import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock,
  Database,
  Package,
  RefreshCw,
  Zap,
  AlertCircle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { simulationApi } from '@/services/api';

interface PerformanceStats {
  packet_in_queue: {
    current_size: number;
    max_size: number;
    utilization: string;
  };
  flow_installation: {
    pending_batches: number;
    avg_install_time_ms: number;
  };
  performance: {
    packet_in_count: number;
    packet_in_processed: number;
    packet_in_dropped: number;
    avg_processing_time: number;
    loop_detected: number;
  };
}

const PerformancePanel: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<PerformanceStats | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchStats = async () => {
      setIsRefreshing(true);
      try {
        const response = await simulationApi.stats();
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
      setIsRefreshing(false);
    };

    fetchStats();

    if (autoRefresh) {
      const interval = setInterval(fetchStats, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen, autoRefresh]);

  if (!isOpen) return null;

  const queueUtilization = stats?.packet_in_queue.utilization || '0%';
  const queuePercent = parseFloat(queueUtilization);
  const queueColor = queuePercent > 80 ? 'text-red-400' : queuePercent > 50 ? 'text-yellow-400' : 'text-emerald-400';
  const queueBgColor = queuePercent > 80 ? 'bg-red-500/20' : queuePercent > 50 ? 'bg-yellow-500/20' : 'bg-emerald-500/20';

  return (
    <div className="fixed right-0 top-14 bottom-48 w-80 bg-slate-900 border-l border-slate-700 shadow-2xl z-40 flex flex-col">
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-semibold">性能监控</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-1.5 rounded transition-colors ${
              autoRefresh ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'
            }`}
            title="自动刷新"
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isRefreshing && !stats && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
          </div>
        )}

        {stats && (
          <>
            <div className="space-y-3">
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                <Package className="w-3.5 h-3.5" />
                Packet-in 队列
              </h4>
              
              <div className={`p-3 rounded-lg ${queueBgColor} border border-slate-700`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-300 text-sm">队列利用率</span>
                  <span className={`font-mono font-bold ${queueColor}`}>
                    {queueUtilization}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      queuePercent > 80 ? 'bg-red-500' : queuePercent > 50 ? 'bg-yellow-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(queuePercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                  <span className="text-slate-400">
                    {stats.packet_in_queue.current_size} / {stats.packet_in_queue.max_size}
                  </span>
                  {queuePercent > 80 && (
                    <span className="text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      队列即将满
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-400 text-xs">接收总数</div>
                  <div className="text-white font-mono text-lg">
                    {stats.performance.packet_in_count.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-400 text-xs">已处理</div>
                  <div className="text-emerald-400 font-mono text-lg">
                    {stats.performance.packet_in_processed.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-400 text-xs">已丢弃</div>
                  <div className={`font-mono text-lg ${
                    stats.performance.packet_in_dropped > 0 ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {stats.performance.packet_in_dropped.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-800 rounded-lg p-2">
                  <div className="text-slate-400 text-xs">平均处理时间</div>
                  <div className="text-blue-400 font-mono text-lg">
                    {stats.performance.avg_processing_time.toFixed(1)}ms
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                <Database className="w-3.5 h-3.5" />
                流表安装
              </h4>
              
              <div className="bg-slate-800 rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm">平均安装时间</span>
                  <span className="text-blue-400 font-mono">
                    {stats.flow_installation.avg_install_time_ms.toFixed(2)}ms
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm">待处理批次</span>
                  <span className={`font-mono ${
                    stats.flow_installation.pending_batches > 0 ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    {stats.flow_installation.pending_batches}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                异常检测
              </h4>
              
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {stats.performance.loop_detected > 0 ? (
                      <AlertTriangle className="w-5 h-5 text-red-400" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    )}
                    <span className="text-slate-300 text-sm">环路检测</span>
                  </div>
                  <span className={`font-mono ${
                    stats.performance.loop_detected > 0 ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {stats.performance.loop_detected} 次
                  </span>
                </div>
                {stats.performance.loop_detected > 0 && (
                  <p className="text-xs text-red-400 mt-2 flex items-start gap-1">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    检测到临时环路，两阶段提交机制已阻止环路数据包转发
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-slate-400 text-xs font-medium uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                优化机制状态
              </h4>
              
              <div className="space-y-1.5">
                <div className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 text-sm">两阶段流表提交</span>
                  </div>
                  <span className="text-emerald-400 text-xs">已启用</span>
                </div>
                <div className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 text-sm">Packet-in 队列缓冲</span>
                  </div>
                  <span className="text-emerald-400 text-xs">已启用</span>
                </div>
                <div className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 text-sm">TTL 超时保护</span>
                  </div>
                  <span className="text-emerald-400 text-xs">已启用</span>
                </div>
                <div className="flex items-center justify-between bg-slate-800/50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-300 text-sm">环路检测与抑制</span>
                  </div>
                  <span className="text-emerald-400 text-xs">已启用</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
        <p className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          每秒自动刷新 · 可手动关闭
        </p>
      </div>
    </div>
  );
};

export default PerformancePanel;

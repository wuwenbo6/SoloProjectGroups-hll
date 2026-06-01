import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Download,
  Trash2,
  RefreshCw,
  Filter,
  CheckCircle2,
  XCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Lock,
  MoreHorizontal,
} from 'lucide-react';
import type { SignLogEntry } from '../types';
import { getLogList, getLogStats, exportLogs, deleteLog, clearAllLogs } from '../services/api';
import { cn } from '../lib/utils';

interface SignLogViewerProps {
  className?: string;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const StatusBadge: React.FC<{ status: 'success' | 'failed' }> = ({ status }) => (
  <span className={cn(
    'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md',
    status === 'success'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-red-500/20 text-red-400'
  )}>
    {status === 'success' ? (
      <><CheckCircle2 className="w-3 h-3" /> 成功</>
    ) : (
      <><XCircle className="w-3 h-3" /> 失败</>
    )}
  </span>
);

const OperationBadge: React.FC<{ operation: SignLogEntry['operation'] }> = ({ operation }) => {
  const configs = {
    sign: { icon: ShieldCheck, label: '签名', class: 'bg-cyan-500/20 text-cyan-400' },
    verify: { icon: FileText, label: '验签', class: 'bg-purple-500/20 text-purple-400' },
    encrypt: { icon: Lock, label: '加密', class: 'bg-cyber-blue/20 text-cyber-blue' },
    decrypt: { icon: Lock, label: '解密', class: 'bg-orange-500/20 text-orange-400' },
  };

  const config = configs[operation];
  const Icon = config.icon;

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md',
      config.class
    )}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
};

const LogRow: React.FC<{
  entry: SignLogEntry;
  onDelete: (id: string) => void;
}> = ({ entry, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条日志吗？')) return;
    
    setDeleting(true);
    try {
      await deleteLog(entry.id);
      onDelete(entry.id);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border-b border-navy-700 last:border-b-0">
      <div
        className="flex items-center gap-4 p-4 hover:bg-navy-700/30 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-1 text-gray-500 hover:text-white">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex items-center gap-3 min-w-[140px]">
          <StatusBadge status={entry.status} />
          <OperationBadge operation={entry.operation} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm text-white font-medium truncate">{entry.firmwareName}</p>
            <span className="text-xs text-gray-500">({formatBytes(entry.firmwareSize)})</span>
          </div>
          <p className="text-xs text-gray-500 font-mono truncate">
            {entry.certificateCN}
          </p>
        </div>

        <div className="text-xs text-gray-400 whitespace-nowrap">
          {formatDate(entry.timestamp)}
        </div>

        {entry.durationMs && (
          <div className="text-xs text-gray-500 whitespace-nowrap w-16 text-right">
            {entry.durationMs}ms
          </div>
        )}

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pl-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-navy-800/50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500">日志ID</p>
              <p className="text-sm text-cyber-blue font-mono">{entry.id}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">固件哈希</p>
              <p className="text-sm text-gray-300 font-mono text-xs truncate" title={entry.firmwareHash}>
                {entry.firmwareHash.substring(0, 16)}...
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">证书序列号</p>
              <p className="text-sm text-gray-300 font-mono text-xs">{entry.certificateSerial}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">算法</p>
              <p className="text-sm text-gray-300 text-xs">{entry.signAlgorithm} / {entry.encryptAlgorithm}</p>
            </div>
          </div>

          {entry.packageFilename && (
            <div className="mt-2 p-3 bg-navy-800/50 rounded-lg">
              <p className="text-xs text-gray-500">输出包</p>
              <p className="text-sm text-white font-mono">{entry.packageFilename}</p>
              {entry.packageSize && (
                <p className="text-xs text-gray-400">大小: {formatBytes(entry.packageSize)}</p>
              )}
            </div>
          )}

          {entry.errorMessage && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-400 flex items-center gap-1 mb-1">
                <AlertTriangle className="w-3 h-3" /> 错误信息
              </p>
              <p className="text-sm text-red-300">{entry.errorMessage}</p>
            </div>
          )}

          {entry.versionInfo && (
            <div className="mt-2 p-3 bg-navy-800/50 rounded-lg">
              <p className="text-xs text-gray-500 mb-2">版本信息</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <span className="text-gray-400">固件: <span className="text-white">{entry.versionInfo.firmwareVersion}</span></span>
                <span className="text-gray-400">包: <span className="text-white">{entry.versionInfo.packageVersion}</span></span>
                <span className="text-gray-400">密钥: <span className="text-white">{entry.versionInfo.keyVersion}</span></span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const SignLogViewer: React.FC<SignLogViewerProps> = ({ className }) => {
  const [logs, setLogs] = useState<SignLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    success: number;
    failed: number;
    signOps: number;
    verifyOps: number;
    last24h: number;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOperation, setFilterOperation] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'txt'>('json');
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsResult, statsResult] = await Promise.all([
        getLogList({ limit: 100 }),
        getLogStats(),
      ]);

      if (logsResult.success && logsResult.data) {
        setLogs(logsResult.data.entries);
      }
      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportLogs(exportFormat);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sign_logs_${Date.now()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('确定要清空所有日志吗？此操作不可恢复。')) return;
    
    setClearing(true);
    try {
      await clearAllLogs();
      setLogs([]);
      loadData();
    } catch (error) {
      console.error('Clear failed:', error);
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteLog = (id: string) => {
    setLogs(prev => prev.filter(l => l.id !== id));
    if (stats) {
      setStats(prev => prev ? { ...prev, total: prev.total - 1 } : null);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filterOperation !== 'all' && log.operation !== filterOperation) return false;
    if (filterStatus !== 'all' && log.status !== filterStatus) return false;
    if (searchTerm && !log.firmwareName.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !log.certificateCN.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyber-blue" />
          <span className="text-sm font-medium text-white">签名日志</span>
          <span className="text-xs text-gray-500">({filteredLogs.length} 条)</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-navy-700"
            title="刷新"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>

          <div className="flex items-center gap-1 p-1 bg-navy-800 rounded-lg">
            {(['json', 'csv', 'txt'] as const).map(format => (
              <button
                key={format}
                onClick={() => setExportFormat(format)}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  exportFormat === format
                    ? 'bg-cyber-blue text-navy-900'
                    : 'text-gray-400 hover:text-white'
                )}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || logs.length === 0}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors',
              logs.length === 0
                ? 'bg-navy-700 text-gray-500 cursor-not-allowed'
                : 'bg-cyber-blue/20 text-cyber-blue hover:bg-cyber-blue/30'
            )}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            导出
          </button>

          <button
            onClick={handleClearAll}
            disabled={clearing || logs.length === 0}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-colors',
              logs.length === 0
                ? 'bg-navy-700 text-gray-500 cursor-not-allowed'
                : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
            )}
          >
            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            清空
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">总计</p>
            <p className="text-xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">成功</p>
            <p className="text-xl font-bold text-emerald-400">{stats.success}</p>
          </div>
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">失败</p>
            <p className="text-xl font-bold text-red-400">{stats.failed}</p>
          </div>
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">签名操作</p>
            <p className="text-xl font-bold text-cyan-400">{stats.signOps}</p>
          </div>
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">验签操作</p>
            <p className="text-xl font-bold text-purple-400">{stats.verifyOps}</p>
          </div>
          <div className="p-3 bg-navy-800/50 rounded-lg border border-navy-700">
            <p className="text-xs text-gray-400">24小时内</p>
            <p className="text-xl font-bold text-cyber-blue">{stats.last24h}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索固件名或证书..."
            className="w-full pl-9 pr-3 py-2 bg-navy-800/50 border border-navy-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-blue/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterOperation}
            onChange={(e) => setFilterOperation(e.target.value)}
            className="px-3 py-2 bg-navy-800/50 border border-navy-600 rounded-lg text-sm text-white focus:outline-none focus:border-cyber-blue/50"
          >
            <option value="all">全部操作</option>
            <option value="sign">签名</option>
            <option value="verify">验签</option>
            <option value="encrypt">加密</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 bg-navy-800/50 border border-navy-600 rounded-lg text-sm text-white focus:outline-none focus:border-cyber-blue/50"
          >
            <option value="all">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
          </select>
        </div>
      </div>

      <div className="bg-navy-800/30 border border-navy-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-cyber-blue animate-spin mb-3" />
            <p className="text-gray-500 text-sm">加载中...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-gray-600 mb-3" />
            <p className="text-gray-500 text-sm">
              {logs.length === 0 ? '暂无日志记录' : '没有匹配的日志'}
            </p>
            {logs.length === 0 && (
              <p className="text-gray-600 text-xs mt-1">执行签名操作后将在此显示日志</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-navy-700">
            {filteredLogs.map(entry => (
              <LogRow
                key={entry.id}
                entry={entry}
                onDelete={handleDeleteLog}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignLogViewer;

import { useEffect, useState } from 'react';
import {
  Download,
  FileText,
  CheckCircle,
  AlertTriangle,
  Bell,
  Clock,
  User,
  Filter,
} from 'lucide-react';
import { AlarmLog } from '../types';
import { getAuthHeaders } from '../store/authStore';

const API_BASE = 'http://localhost:3001/api';

export default function Alarms() {
  const [alarms, setAlarms] = useState<AlarmLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unacknowledged' | 'acknowledged'>('all');

  const fetchAlarms = async () => {
    try {
      const response = await fetch(`${API_BASE}/alarms`, {
        headers: getAuthHeaders(),
      });
      const result = await response.json();
      if (result.success) {
        setAlarms(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch alarms:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlarms();
  }, []);

  const handleAcknowledge = async (id: number) => {
    try {
      await fetch(`${API_BASE}/alarms/${id}/acknowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      fetchAlarms();
    } catch (error) {
      console.error('Failed to acknowledge alarm:', error);
    }
  };

  const handleAcknowledgeAll = async () => {
    try {
      await fetch(`${API_BASE}/alarms/acknowledge/all`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      fetchAlarms();
    } catch (error) {
      console.error('Failed to acknowledge all alarms:', error);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const response = await fetch(`${API_BASE}/alarms/export/${format}`, {
        headers: getAuthHeaders(),
      });
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alarm_logs_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export alarms:', error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-400 bg-red-500/20 border-red-500/50';
      case 'warning':
        return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50';
      default:
        return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '严重';
      case 'warning':
        return '警告';
      default:
        return '信息';
    }
  };

  const filteredAlarms = alarms.filter((alarm) => {
    if (filter === 'unacknowledged') return !alarm.acknowledged;
    if (filter === 'acknowledged') return alarm.acknowledged;
    return true;
  });

  const unacknowledgedCount = alarms.filter((a) => !a.acknowledged).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">报警记录</h1>
          {unacknowledgedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 border border-red-500/50 rounded-full">
              <Bell className="w-4 h-4 text-red-400" />
              <span className="text-red-400 text-sm font-medium">
                {unacknowledgedCount} 条未确认
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unacknowledgedCount > 0 && (
            <button
              onClick={handleAcknowledgeAll}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              全部确认
            </button>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              导出 CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              导出 JSON
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Filter className="w-5 h-5 text-slate-400" />
        <div className="flex gap-2">
          {(['all', 'unacknowledged', 'acknowledged'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {f === 'all'
                ? '全部'
                : f === 'unacknowledged'
                ? '未确认'
                : '已确认'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredAlarms.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>暂无报警记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlarms.map((alarm) => (
            <div
              key={alarm.id}
              className={`p-4 rounded-xl border ${
                !alarm.acknowledged
                  ? 'bg-slate-800/80 border-slate-600'
                  : 'bg-slate-800/30 border-slate-700/50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div
                    className={`p-2 rounded-lg border ${getSeverityColor(
                      alarm.severity
                    )}`}
                  >
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-medium text-white">{alarm.message}</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(
                          alarm.severity
                        )}`}
                      >
                        {getSeverityLabel(alarm.severity)}
                      </span>
                      {alarm.acknowledged && (
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">
                          已确认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(alarm.timestamp).toLocaleString('zh-CN')}
                      </div>
                      {alarm.temperature !== undefined && (
                        <span>温度: {alarm.temperature.toFixed(1)}°C</span>
                      )}
                      {alarm.pressure !== undefined && (
                        <span>压力: {alarm.pressure.toFixed(2)} MPa</span>
                      )}
                    </div>
                    {alarm.acknowledged && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-slate-500">
                        <User className="w-4 h-4" />
                        <span>
                          由 {alarm.acknowledged_by_name || '未知用户'} 于{' '}
                          {alarm.acknowledged_at
                            ? new Date(alarm.acknowledged_at).toLocaleString('zh-CN')
                            : '未知时间'} 确认
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                {!alarm.acknowledged && (
                  <button
                    onClick={() => handleAcknowledge(alarm.id)}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    确认
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

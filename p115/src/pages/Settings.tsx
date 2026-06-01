import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { 
  Settings as SettingsIcon, 
  Server, 
  Database, 
  Save,
  RefreshCw,
  Check,
  AlertCircle,
  Play,
  Square,
  RefreshCw as RefreshHorizontal,
  FileSpreadsheet as FileJsonIcon,
  FileSpreadsheet,
  FileSpreadsheet as FileXml,
  Clock,
  Trash2,
  Activity,
  Download
} from 'lucide-react';
import { exportApi } from '../lib/api';

const Settings: React.FC = () => {
  const { 
    systemConfig, 
    serverStatus,
    syncStatus,
    fetchConfig, 
    fetchServerStatus,
    fetchSyncStatus,
    updateConfig,
    startServer,
    stopServer,
    startSync,
    stopSync,
    modbusToUaSync,
    cleanupHistory,
    loading 
  } = useAppStore();

  const [formData, setFormData] = useState({
    opcuaPort: 4840,
    opcuaEndpoint: '/OPCUA/Server',
    databasePath: './data/database.sqlite',
    autoStart: false,
    historyEnabled: true,
    historyRetentionDays: 30,
    syncEnabled: true,
    syncIntervalMs: 1000,
  });

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchServerStatus();
    fetchSyncStatus();
  }, []);

  useEffect(() => {
    if (systemConfig) {
      setFormData({
        opcuaPort: systemConfig.opcuaPort,
        opcuaEndpoint: systemConfig.opcuaEndpoint,
        databasePath: systemConfig.databasePath,
        autoStart: systemConfig.autoStart,
        historyEnabled: systemConfig.historyEnabled,
        historyRetentionDays: systemConfig.historyRetentionDays,
        syncEnabled: systemConfig.syncEnabled,
        syncIntervalMs: systemConfig.syncIntervalMs,
      });
    }
  }, [systemConfig]);

  const handleChange = (field: keyof typeof formData, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (formData.opcuaPort < 1 || formData.opcuaPort > 65535) {
      setMessage({ text: '端口号必须在1-65535之间', type: 'error' });
      return;
    }

    const success = await updateConfig({
      opcuaPort: formData.opcuaPort,
      opcuaEndpoint: formData.opcuaEndpoint,
      databasePath: formData.databasePath,
      autoStart: formData.autoStart,
      historyEnabled: formData.historyEnabled,
      historyRetentionDays: formData.historyRetentionDays,
      syncEnabled: formData.syncEnabled,
      syncIntervalMs: formData.syncIntervalMs,
    });

    if (success) {
      setMessage({ text: '配置保存成功', type: 'success' });
      setIsDirty(false);
    } else {
      setMessage({ text: '保存失败', type: 'error' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStartServer = async () => {
    const result = await startServer();
    setMessage({ 
      text: result.message || (result.success ? '服务器启动成功' : '启动失败'), 
      type: result.success ? 'success' : 'error' 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStopServer = async () => {
    const result = await stopServer();
    setMessage({ 
      text: result.message || (result.success ? '服务器已停止' : '停止失败'), 
      type: result.success ? 'success' : 'error' 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStartSync = async () => {
    const result = await startSync();
    setMessage({ 
      text: result.message || (result.success ? '同步服务已启动' : '启动失败'), 
      type: result.success ? 'success' : 'error' 
    });
    fetchSyncStatus();
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStopSync = async () => {
    const result = await stopSync();
    setMessage({ 
      text: result.message || (result.success ? '同步服务已停止' : '停止失败'), 
      type: result.success ? 'success' : 'error' 
    });
    fetchSyncStatus();
    setTimeout(() => setMessage(null), 3000);
  };

  const handleModbusToUaSync = async () => {
    const result = await modbusToUaSync();
    if (result.success) {
      setMessage({ text: `同步完成，成功${result.syncedCount}条${result.errors?.length ? `，失败${result.errors.length}条` : ''}`, type: 'success' });
    } else {
      setMessage({ text: '同步失败', type: 'error' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleCleanupHistory = async () => {
    const result = await cleanupHistory(formData.historyRetentionDays);
    if (result.success) {
      setMessage({ text: `清理完成，删除${result.deletedCount}条记录`, type: 'success' });
    } else {
      setMessage({ text: '清理失败', type: 'error' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExport = (format: 'xml' | 'csv' | 'json') => {
    const url = exportApi.export(format);
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">系统设置</h1>
          <p className="text-slate-400 mt-1">配置OPC UA服务器参数和数据库设置</p>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {message.text}
            </div>
          )}
          <button
            onClick={fetchConfig}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
            <Server className="w-5 h-5 text-cyan-400" />
            <h2 className="font-semibold text-white">OPC UA 服务器配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                服务器端口
              </label>
              <input
                type="number"
                min="1"
                max="65535"
                value={formData.opcuaPort}
                onChange={(e) => handleChange('opcuaPort', parseInt(e.target.value) || 0)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">OPC UA服务器监听端口，默认4840</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                端点路径
              </label>
              <input
                type="text"
                value={formData.opcuaEndpoint}
                onChange={(e) => handleChange('opcuaEndpoint', e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">OPC UA服务器端点路径</p>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <div className="text-sm text-slate-400 mb-1">完整端点URL</div>
              <div className="text-cyan-400 font-mono text-sm">
                opc.tcp://localhost:{formData.opcuaPort}{formData.opcuaEndpoint}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.autoStart}
                  onChange={(e) => handleChange('autoStart', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-white font-medium">自动启动服务器</span>
                  <p className="text-xs text-slate-400">应用启动时自动启动OPC UA服务器</p>
                </div>
              </label>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-300">服务器状态</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${serverStatus?.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className={serverStatus?.running ? 'text-green-400' : 'text-red-400'}>
                    {serverStatus?.running ? '运行中' : '已停止'}
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleStartServer}
                  disabled={serverStatus?.running || loading.serverControl}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  <Play className="w-4 h-4" />
                  启动服务器
                </button>
                <button
                  onClick={handleStopServer}
                  disabled={!serverStatus?.running || loading.serverControl}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4" />
                  停止服务器
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
            <RefreshHorizontal className="w-5 h-5 text-green-400" />
            <h2 className="font-semibold text-white">双向同步配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.syncEnabled}
                  onChange={(e) => handleChange('syncEnabled', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-white font-medium">启用双向同步</span>
                  <p className="text-xs text-slate-400">OPC UA 写入值同步到 MODBUS，MODBUS 数据同步到 OPC UA</p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                同步间隔 (毫秒)
              </label>
              <input
                type="number"
                min="100"
                max="60000"
                value={formData.syncIntervalMs}
                onChange={(e) => handleChange('syncIntervalMs', parseInt(e.target.value) || 1000)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">MODBUS 到 OPC UA 的自动同步间隔</p>
            </div>

            <div className="bg-slate-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">同步状态</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${syncStatus?.enabled ? 'bg-green-500' : 'bg-slate-500'}`} />
                  <span className={syncStatus?.enabled ? 'text-green-400' : 'text-slate-400'}>
                    {syncStatus?.enabled ? '已启用' : '已禁用'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-lg font-bold text-cyan-400">{syncStatus?.pendingCount || 0}</div>
                  <div className="text-xs text-slate-400">等待中</div>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-lg font-bold text-green-400">{syncStatus?.successCount || 0}</div>
                  <div className="text-xs text-slate-400">成功</div>
                </div>
                <div className="bg-slate-800 rounded p-2">
                  <div className="text-lg font-bold text-red-400">{syncStatus?.failedCount || 0}</div>
                  <div className="text-xs text-slate-400">失败</div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStartSync}
                disabled={syncStatus?.enabled || loading.sync}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                启动同步
              </button>
              <button
                onClick={handleStopSync}
                disabled={!syncStatus?.enabled}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Square className="w-4 h-4" />
                停止同步
              </button>
            </div>

            <button
              onClick={handleModbusToUaSync}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              立即同步 (MODBUS → OPC UA)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
            <Database className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-white">历史数据配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.historyEnabled}
                  onChange={(e) => handleChange('historyEnabled', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-600 focus:ring-cyan-500"
                />
                <div>
                  <span className="text-white font-medium">启用历史数据记录</span>
                  <p className="text-xs text-slate-400">记录节点值变化历史</p>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                数据保留天数
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={formData.historyRetentionDays}
                onChange={(e) => handleChange('historyRetentionDays', parseInt(e.target.value) || 30)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">超过此天数的历史数据将被自动清理</p>
            </div>

            <button
              onClick={handleCleanupHistory}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              清理历史数据 (保留 {formData.historyRetentionDays} 天)
            </button>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
            <FileXml className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-white">导出配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-slate-400 text-sm">
              导出当前的映射规则配置为不同格式，用于备份或在其他系统中使用。
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handleExport('xml')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <FileXml className="w-5 h-5 text-green-400" />
                <div className="text-left">
                  <div className="font-medium">导出 XML 格式</div>
                  <div className="text-xs text-slate-400">标准 XML 配置文件，可用于 OPC UA 服务器</div>
                </div>
              </button>

              <button
                onClick={() => handleExport('csv')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                <div className="text-left">
                  <div className="font-medium">导出 CSV 格式</div>
                  <div className="text-xs text-slate-400">Excel 兼容格式，便于查看和编辑</div>
                </div>
              </button>

              <button
                onClick={() => handleExport('json')}
                className="w-full flex items-center gap-3 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
              >
                <FileJsonIcon className="w-5 h-5 text-cyan-400" />
                <div className="text-left">
                  <div className="font-medium">导出 JSON 格式</div>
                  <div className="text-xs text-slate-400">完整配置数据，便于程序处理</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-3">
          <Database className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold text-white">数据库配置</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              数据库路径
            </label>
            <input
              type="text"
              value={formData.databasePath}
              onChange={(e) => handleChange('databasePath', e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <p className="text-xs text-slate-400 mt-1">SQLite数据库文件路径</p>
          </div>

          <div className="bg-slate-900 rounded-lg p-4">
            <h3 className="text-white font-medium mb-3">数据库信息</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">数据库类型</span>
                <span className="text-white">SQLite 3</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">存储引擎</span>
                <span className="text-white">WAL (Write-Ahead Log)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">外键约束</span>
                <span className="text-green-400">已启用</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4">
            <h3 className="text-white font-medium mb-3">数据表</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                  <span className="text-white">mapping_rules</span>
                </div>
                <span className="text-xs text-slate-400">映射规则表</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span className="text-white">system_config</span>
                </div>
                <span className="text-xs text-slate-400">系统配置表</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <span className="text-white">devices</span>
                </div>
                <span className="text-xs text-slate-400">设备信息表</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  <span className="text-white">node_history</span>
                </div>
                <span className="text-xs text-slate-400">历史数据表</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-pink-500 rounded-full" />
                  <span className="text-white">sync_log</span>
                </div>
                <span className="text-xs text-slate-400">同步日志表</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            if (systemConfig) {
              setFormData({
                opcuaPort: systemConfig.opcuaPort,
                opcuaEndpoint: systemConfig.opcuaEndpoint,
                databasePath: systemConfig.databasePath,
                autoStart: systemConfig.autoStart,
                historyEnabled: systemConfig.historyEnabled,
                historyRetentionDays: systemConfig.historyRetentionDays,
                syncEnabled: systemConfig.syncEnabled,
                syncIntervalMs: systemConfig.syncIntervalMs,
              });
              setIsDirty(false);
            }
          }}
          disabled={!isDirty}
          className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          重置
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
        >
          <Save className="w-4 h-4" />
          保存配置
        </button>
      </div>
    </div>
  );
};

export default Settings;

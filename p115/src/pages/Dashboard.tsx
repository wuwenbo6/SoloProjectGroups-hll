import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { 
  Server, 
  Activity, 
  Database, 
  Network, 
  Play, 
  Square, 
  RefreshCw,
  Clock,
  Users,
  Layers
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { 
    serverStatus, 
    mappingRules, 
    fetchServerStatus, 
    fetchMappingRules, 
    startServer, 
    stopServer,
    restartServer,
    loading 
  } = useAppStore();

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchServerStatus();
    fetchMappingRules();
    
    const interval = setInterval(fetchServerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    const result = await startServer();
    setMessage({ 
      text: result.message || (result.success ? '服务器启动成功' : '操作失败'), 
      type: result.success ? 'success' : 'error' 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleStop = async () => {
    const result = await stopServer();
    setMessage({ 
      text: result.message || (result.success ? '服务器已停止' : '操作失败'), 
      type: result.success ? 'success' : 'error' 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleRestart = async () => {
    const result = await restartServer();
    setMessage({ 
      text: result.message || (result.success ? '服务器重启成功' : '操作失败'), 
      type: result.success ? 'success' : 'error' 
    });
    setTimeout(() => setMessage(null), 3000);
  };

  const formatUptime = (startTime: string) => {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const diff = now - start;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const deviceCount = new Set(mappingRules.map(r => r.deviceName)).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">仪表盘</h1>
          <p className="text-slate-400 mt-1">监控OPC UA服务器状态和数据映射</p>
        </div>
        {message && (
          <div className={`px-4 py-2 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-xl p-6 shadow-xl shadow-cyan-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cyan-200 text-sm">服务器状态</p>
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-3 h-3 rounded-full animate-pulse ${
                  serverStatus?.running ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <p className="text-2xl font-bold text-white">
                  {serverStatus?.running ? '运行中' : '已停止'}
                </p>
              </div>
            </div>
            <Server className="w-12 h-12 text-cyan-300/40" />
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">设备数量</p>
              <p className="text-3xl font-bold text-white mt-2">{deviceCount}</p>
            </div>
            <Database className="w-12 h-12 text-amber-500/40" />
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">映射规则</p>
              <p className="text-3xl font-bold text-white mt-2">{mappingRules.length}</p>
            </div>
            <Layers className="w-12 h-12 text-emerald-500/40" />
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm">OPC UA节点</p>
              <p className="text-3xl font-bold text-white mt-2">{serverStatus?.totalNodes || 0}</p>
            </div>
            <Network className="w-12 h-12 text-purple-500/40" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">服务器控制</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchServerStatus()}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                disabled={loading.serverStatus}
              >
                <RefreshCw className={`w-4 h-4 ${loading.serverStatus ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Network className="w-4 h-4" />
                  <span>端点地址</span>
                </div>
                <p className="text-cyan-400 font-mono text-sm">{serverStatus?.endpointUrl || '-'}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Users className="w-4 h-4" />
                  <span>连接客户端</span>
                </div>
                <p className="text-white font-semibold">{serverStatus?.connectedClients || 0}</p>
              </div>
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Clock className="w-4 h-4" />
                  <span>运行时间</span>
                </div>
                <p className="text-white font-semibold">
                  {serverStatus?.running && serverStatus.startTime 
                    ? formatUptime(serverStatus.startTime) 
                    : '-'}
                </p>
              </div>
              <div className="bg-slate-900 rounded-lg p-4">
                <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                  <Activity className="w-4 h-4" />
                  <span>节点总数</span>
                </div>
                <p className="text-white font-semibold">{serverStatus?.totalNodes || 0}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleStart}
                disabled={serverStatus?.running || loading.serverControl}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                启动服务器
              </button>
              <button
                onClick={handleStop}
                disabled={!serverStatus?.running || loading.serverControl}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <Square className="w-4 h-4" />
                停止服务器
              </button>
              <button
                onClick={handleRestart}
                disabled={!serverStatus?.running || loading.serverControl}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading.serverControl ? 'animate-spin' : ''}`} />
                重启
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">设备列表</h2>
          </div>
          <div className="p-4 max-h-80 overflow-auto">
            {deviceCount === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>暂无设备，请先配置映射规则</p>
              </div>
            ) : (
              <div className="space-y-2">
                {Array.from(new Set(mappingRules.map(r => r.deviceName))).map(device => {
                  const deviceRules = mappingRules.filter(r => r.deviceName === device);
                  return (
                    <div key={device} className="bg-slate-900 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white font-medium">{device}</span>
                        <span className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">
                          {deviceRules.length} 个点
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Array.from(new Set(deviceRules.map(r => r.registerType))).map(type => (
                          <span key={type} className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

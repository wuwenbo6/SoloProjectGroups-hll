import { useState } from 'react';
import { Save, RefreshCw, Server, Database, Wifi } from 'lucide-react';

export default function Settings() {
  const [settings, setSettings] = useState({
    opcuaEndpoint: 'opc.tcp://localhost:4840/UA/PLC_Server',
    pollInterval: 1000,
    databaseRetention: 7,
    autoReconnect: true,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">系统设置</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
        >
          {saved ? (
            <>
              <Save className="w-4 h-4" />
              已保存
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              保存设置
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Server className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">OPC UA 连接设置</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                OPC UA 服务器端点
              </label>
              <input
                type="text"
                value={settings.opcuaEndpoint}
                onChange={(e) =>
                  setSettings({ ...settings, opcuaEndpoint: e.target.value })
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                数据采集间隔 (ms)
              </label>
              <input
                type="number"
                value={settings.pollInterval}
                onChange={(e) =>
                  setSettings({ ...settings, pollInterval: parseInt(e.target.value) })
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                min="100"
                step="100"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-slate-400">自动重连</span>
              <button
                onClick={() =>
                  setSettings({ ...settings, autoReconnect: !settings.autoReconnect })
                }
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.autoReconnect ? 'bg-cyan-500' : 'bg-slate-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    settings.autoReconnect ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Database className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">数据库设置</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                数据保留时间 (天)
              </label>
              <input
                type="number"
                value={settings.databaseRetention}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    databaseRetention: parseInt(e.target.value),
                  })
                }
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                min="1"
                max="365"
              />
            </div>

            <div className="p-4 bg-slate-700/50 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">数据库类型</span>
                <span className="text-white">SQLite</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">数据路径</span>
                <span className="text-white font-mono text-xs">./data.db</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-yellow-500/20 rounded-lg">
            <Wifi className="w-6 h-6 text-yellow-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">连接状态</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 font-medium">OPC UA 服务器</span>
            </div>
            <p className="text-slate-400 text-sm font-mono">
              opc.tcp://localhost:4840
            </p>
          </div>

          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 font-medium">OPC UA 客户端</span>
            </div>
            <p className="text-slate-400 text-sm">已连接到服务器</p>
          </div>

          <div className="p-4 bg-slate-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-green-400 rounded-full" />
              <span className="text-green-400 font-medium">数据库</span>
            </div>
            <p className="text-slate-400 text-sm">正常运行中</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">系统信息</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-400">应用版本</span>
            <p className="text-white font-mono">1.0.0</p>
          </div>
          <div>
            <span className="text-slate-400">OPC UA 版本</span>
            <p className="text-white font-mono">1.04</p>
          </div>
          <div>
            <span className="text-slate-400">运行时间</span>
            <p className="text-white font-mono">00:00:00</p>
          </div>
          <div>
            <span className="text-slate-400">数据记录数</span>
            <p className="text-white font-mono">0</p>
          </div>
        </div>
      </div>
    </div>
  );
}

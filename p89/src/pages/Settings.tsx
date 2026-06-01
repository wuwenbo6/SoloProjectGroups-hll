import React, { useState } from 'react';
import { Save, Server, Key, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState({
    proxmoxHost: 'https://localhost:8006',
    proxmoxUser: 'root@pam',
    proxmoxPassword: '',
    proxmoxTokenId: '',
    proxmoxTokenSecret: '',
    demoMode: true,
  });

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">系统设置</h1>
        <p className="text-slate-500 mt-1">配置 ProxMox 连接参数</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-cyan-500" />
              <CardTitle>ProxMox 连接设置</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ProxMox 主机地址
              </label>
              <input
                type="text"
                value={settings.proxmoxHost}
                onChange={(e) =>
                  setSettings({ ...settings, proxmoxHost: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="https://192.168.1.100:8006"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                用户名
              </label>
              <input
                type="text"
                value={settings.proxmoxUser}
                onChange={(e) =>
                  setSettings({ ...settings, proxmoxUser: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="root@pam"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                密码
              </label>
              <input
                type="password"
                value={settings.proxmoxPassword}
                onChange={(e) =>
                  setSettings({ ...settings, proxmoxPassword: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-500" />
              <CardTitle>API Token 认证 (可选)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              使用 API Token 认证可替代密码认证，提供更好的安全性。
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Token ID
              </label>
              <input
                type="text"
                value={settings.proxmoxTokenId}
                onChange={(e) =>
                  setSettings({ ...settings, proxmoxTokenId: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="root@pam!api-token"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Token Secret
              </label>
              <input
                type="password"
                value={settings.proxmoxTokenSecret}
                onChange={(e) =>
                  setSettings({ ...settings, proxmoxTokenSecret: e.target.value })
                }
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              <CardTitle>演示模式</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">启用演示模式</p>
                <p className="text-sm text-slate-500">
                  使用模拟数据，无需真实 ProxMox 环境
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.demoMode}
                  onChange={(e) =>
                    setSettings({ ...settings, demoMode: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>保存设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-500">
              保存后，系统将使用新配置重新连接到 ProxMox 服务器。
            </p>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 w-full justify-center px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saved ? '已保存!' : '保存配置'}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

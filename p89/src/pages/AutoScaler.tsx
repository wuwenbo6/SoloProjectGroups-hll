import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card';
import { autoScalerApi } from '@/services/api';
import type { AutoScalerConfig, ScalingEvent } from '../../shared/types';

export const AutoScaler = () => {
  const [config, setConfig] = useState<AutoScalerConfig | null>(null);
  const [history, setHistory] = useState<ScalingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [configRes, historyRes] = await Promise.all([
        autoScalerApi.getConfig(),
        autoScalerApi.getHistory(),
      ]);
      if (configRes.success) setConfig(configRes.data);
      if (historyRes.success) setHistory(historyRes.data);
    } catch (error) {
      console.error('Failed to load autoscaler data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    try {
      if (config.enabled) {
        await autoScalerApi.stop();
      } else {
        await autoScalerApi.start();
      }
      loadData();
    } catch (error) {
      console.error('Failed to toggle autoscaler:', error);
    }
  };

  const handleConfigChange = async (key: keyof AutoScalerConfig, value: any) => {
    if (!config) return;
    setSaving(true);
    try {
      await autoScalerApi.updateConfig({ [key]: value });
      setConfig({ ...config, [key]: value });
    } catch (error) {
      console.error('Failed to update config:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">自动伸缩管理</h1>
        <button
          onClick={handleToggle}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            config?.enabled
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {config?.enabled ? '停止自动伸缩' : '启动自动伸缩'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>配置设置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">状态</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  config?.enabled
                    ? 'bg-green-500/20 text-green-500'
                    : 'bg-slate-500/20 text-slate-500'
                }`}>
                  {config?.enabled ? '运行中' : '已停止'}
                </span>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">最小实例数</label>
                <input
                  type="number"
                  value={config?.minVMs || 2}
                  onChange={(e) => handleConfigChange('minVMs', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">最大实例数</label>
                <input
                  type="number"
                  value={config?.maxVMs || 10}
                  onChange={(e) => handleConfigChange('maxVMs', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  扩容CPU阈值 (%)
                </label>
                <input
                  type="number"
                  value={(config?.scaleUpThreshold || 0.7) * 100}
                  onChange={(e) => handleConfigChange('scaleUpThreshold', parseInt(e.target.value) / 100)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  缩容CPU阈值 (%)
                </label>
                <input
                  type="number"
                  value={(config?.scaleDownThreshold || 0.3) * 100}
                  onChange={(e) => handleConfigChange('scaleDownThreshold', parseInt(e.target.value) / 100)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  扩容冷却时间 (秒)
                </label>
                <input
                  type="number"
                  value={(config?.scaleUpCooldown || 300000) / 1000}
                  onChange={(e) => handleConfigChange('scaleUpCooldown', parseInt(e.target.value) * 1000)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  缩容冷却时间 (秒)
                </label>
                <input
                  type="number"
                  value={(config?.scaleDownCooldown || 600000) / 1000}
                  onChange={(e) => handleConfigChange('scaleDownCooldown', parseInt(e.target.value) * 1000)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">模板VM ID</label>
                <input
                  type="number"
                  value={config?.templateVMID || 100}
                  onChange={(e) => handleConfigChange('templateVMID', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  disabled={saving}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>伸缩历史</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.length === 0 ? (
                <p className="text-slate-500 text-center py-8">暂无伸缩记录</p>
              ) : (
                history.map((event, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        event.action === 'scale_up'
                          ? 'bg-orange-500/20 text-orange-500'
                          : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {event.action === 'scale_up' ? '扩容' : '缩容'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          VM ID: {event.vmid || 'N/A'}
                        </p>
                        <p className="text-xs text-slate-500">{event.reason}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">
                      {new Date(event.timestamp).toLocaleString('zh-CN')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

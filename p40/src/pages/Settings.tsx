import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Usb, Radio, Shield, Sliders } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ConfigItem {
  config_key: string;
  config_value: string;
}

export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [serialPorts, setSerialPorts] = useState<string[]>([]);

  useEffect(() => {
    fetchConfigs();
    fetchSerialPorts();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfigs(data || []);
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    }
  };

  const fetchSerialPorts = async () => {
    try {
      const res = await fetch('/api/serial/ports');
      const data = await res.json();
      setSerialPorts(data.ports || []);
    } catch (err) {
      console.error('Failed to fetch serial ports:', err);
    }
  };

  const getConfigValue = (key: string) => {
    return configs.find((c) => c.config_key === key)?.config_value || '';
  };

  const updateConfig = async (key: string, value: string) => {
    setSaving(true);
    try {
      await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configKey: key, configValue: value }),
      });
      setConfigs((prev) =>
        prev.map((c) => (c.config_key === key ? { ...c, config_value: value } : c))
      );
    } catch (err) {
      console.error('Failed to update config:', err);
    } finally {
      setSaving(false);
    }
  };

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
              系统设置
            </h1>
            <p className="text-white/60 text-sm mt-1 font-mono">
              配置机器人连接参数
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl space-y-6">
        <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-cyan-500/10 flex items-center gap-2">
            <Usb size={18} className="text-cyan-400" />
            <h2 className="font-mono text-sm text-cyan-400">串口配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                串口设备
              </label>
              <select
                value={getConfigValue('serial_port')}
                onChange={(e) => updateConfig('serial_port', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                {serialPorts.length > 0 ? (
                  serialPorts.map((port) => (
                    <option key={port} value={port}>
                      {port}
                    </option>
                  ))
                ) : (
                  <option value="/dev/ttyUSB0">/dev/ttyUSB0</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                波特率
              </label>
              <select
                value={getConfigValue('serial_baudrate')}
                onChange={(e) => updateConfig('serial_baudrate', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400">38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
                <option value="230400">230400</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-cyan-500/10 flex items-center gap-2">
            <Radio size={18} className="text-cyan-400" />
            <h2 className="font-mono text-sm text-cyan-400">UDP 配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                目标主机
              </label>
              <input
                type="text"
                value={getConfigValue('udp_host')}
                onChange={(e) => updateConfig('udp_host', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                目标端口
              </label>
              <input
                type="number"
                value={getConfigValue('udp_port')}
                onChange={(e) => updateConfig('udp_port', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                通信模式
              </label>
              <select
                value={getConfigValue('communication_mode')}
                onChange={(e) => updateConfig('communication_mode', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              >
                <option value="udp">UDP</option>
                <option value="serial">串口</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#0a1628]/60 backdrop-blur rounded-lg border border-cyan-500/20 overflow-hidden">
          <div className="px-6 py-4 border-b border-cyan-500/10 flex items-center gap-2">
            <Shield size={18} className="text-cyan-400" />
            <h2 className="font-mono text-sm text-cyan-400">虚拟墙配置</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-mono text-white/60 mb-2">
                虚拟墙距离 (cm)
              </label>
              <input
                type="number"
                value={getConfigValue('virtual_wall_distance')}
                onChange={(e) => updateConfig('virtual_wall_distance', e.target.value)}
                className="w-full px-4 py-2 bg-[#1a3a5c]/30 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-white/60">启用虚拟墙</span>
              <button
                onClick={() => updateConfig('force_feedback_enabled', getConfigValue('force_feedback_enabled') === 'true' ? 'false' : 'true')}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  getConfigValue('force_feedback_enabled') === 'true'
                    ? 'bg-cyan-500'
                    : 'bg-gray-600'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    getConfigValue('force_feedback_enabled') === 'true'
                      ? 'translate-x-7'
                      : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-6 py-3 bg-cyan-500/20 text-cyan-400 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 transition-all font-mono text-sm"
          >
            <Save size={16} />
            返回控制台
          </button>
        </div>
      </div>
    </div>
  );
};

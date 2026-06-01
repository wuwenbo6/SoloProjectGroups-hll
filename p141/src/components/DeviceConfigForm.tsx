import React, { useMemo } from 'react';
import { Settings, CheckCircle2, AlertCircle, AlertTriangle, Monitor, Activity, Network } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { configService } from '../services/configService';
import { cn } from '../lib/utils';

export const DeviceConfigForm: React.FC = () => {
  const { deviceConfig, updateConfig, parsedGSDML } = useAppStore();

  const validation = useMemo(() => {
    if (!deviceConfig) return null;
    return configService.validateConfig(deviceConfig);
  }, [deviceConfig]);

  if (!deviceConfig || !parsedGSDML) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
        <Settings className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-sm text-center">上传GSDML文件后<br />在此配置设备参数</p>
      </div>
    );
  }

  const handleChange = (field: keyof typeof deviceConfig, value: string) => {
    updateConfig({ [field]: value } as Partial<typeof deviceConfig>);
  };

  const handleModuleToggle = (moduleId: string) => {
    const current = deviceConfig.selectedModules;
    const updated = current.includes(moduleId)
      ? current.filter((id) => id !== moduleId)
      : [...current, moduleId];
    updateConfig({ selectedModules: updated });
  };

  const handleToggle = (field: 'lldpEnabled' | 'diagnosticEnabled', value: boolean) => {
    updateConfig({ [field]: value } as Partial<typeof deviceConfig>);
  };

  const getInputStyle = (hasError: boolean) =>
    cn(
      'w-full px-3 py-2 border rounded-lg text-sm transition-all duration-150',
      'focus:outline-none focus:ring-2 focus:ring-[#165DFF]/50',
      hasError
        ? 'border-red-300 focus:border-red-500 focus:ring-red-200'
        : 'border-gray-300 focus:border-[#165DFF]'
    );

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Monitor className="w-4 h-4 text-[#165DFF]" />
          <h3 className="text-sm font-semibold text-gray-900">设备配置</h3>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">设备名称</label>
            <input
              type="text"
              value={deviceConfig.deviceName}
              onChange={(e) => handleChange('deviceName', e.target.value)}
              className={getInputStyle(
                !!validation?.errors.find((e) => e.includes('设备名称'))
              )}
              placeholder="输入设备名称"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">站名称 (Station Name)</label>
            <input
              type="text"
              value={deviceConfig.stationName}
              onChange={(e) => handleChange('stationName', e.target.value)}
              className={getInputStyle(
                !!validation?.errors.find((e) => e.includes('站名称'))
              )}
              placeholder="输入站名称"
            />
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
              网络配置
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">IP 地址</label>
                <input
                  type="text"
                  value={deviceConfig.ipAddress}
                  onChange={(e) => handleChange('ipAddress', e.target.value)}
                  className={getInputStyle(
                    !!validation?.errors.find((e) => e.includes('IP地址'))
                  )}
                  placeholder="192.168.0.1"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">子网掩码</label>
                <input
                  type="text"
                  value={deviceConfig.subnetMask}
                  onChange={(e) => handleChange('subnetMask', e.target.value)}
                  className={getInputStyle(
                    !!validation?.errors.find((e) => e.includes('子网掩码'))
                  )}
                  placeholder="255.255.255.0"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">网关</label>
                <input
                  type="text"
                  value={deviceConfig.gateway}
                  onChange={(e) => handleChange('gateway', e.target.value)}
                  className={getInputStyle(
                    !!validation?.errors.find((e) => e.includes('网关'))
                  )}
                  placeholder="192.168.0.254"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
              高级配置
            </h4>
            <div className="space-y-3">
              <label className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-2">
                  <Network className="w-4 h-4 text-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">LLDP 拓扑发现</p>
                    <p className="text-xs text-gray-500">启用链路层发现协议</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={deviceConfig.lldpEnabled ?? true}
                  onChange={(e) => handleToggle('lldpEnabled', e.target.checked)}
                  className="w-4 h-4 text-[#165DFF] rounded border-gray-300 focus:ring-[#165DFF]"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">通道诊断</p>
                    <p className="text-xs text-gray-500">启用IO通道诊断监控</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={deviceConfig.diagnosticEnabled ?? true}
                  onChange={(e) => handleToggle('diagnosticEnabled', e.target.checked)}
                  className="w-4 h-4 text-[#165DFF] rounded border-gray-300 focus:ring-[#165DFF]"
                />
              </label>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
              选择模块 ({deviceConfig.selectedModules.length})
            </h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {parsedGSDML.device.modules.map((module) => (
                <label
                  key={module.id}
                  className="flex items-start p-2 rounded-lg border cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={deviceConfig.selectedModules.includes(module.id)}
                    onChange={() => handleModuleToggle(module.id)}
                    className="mt-0.5 mr-3 w-4 h-4 text-[#165DFF] rounded border-gray-300 focus:ring-[#165DFF]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{module.name}</p>
                    <p className="text-xs text-gray-500">{module.id}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
            <div className="space-y-2 pt-4 border-t border-gray-200">
              {validation.errors.map((error, index) => (
                <div
                  key={`error-${index}`}
                  className="flex items-start space-x-2 p-2 bg-red-50 rounded-lg"
                >
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-700">{error}</span>
                </div>
              ))}
              {validation.warnings.map((warning, index) => (
                <div
                  key={`warning-${index}`}
                  className="flex items-start space-x-2 p-2 bg-amber-50 rounded-lg"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-700">{warning}</span>
                </div>
              ))}
            </div>
          )}

          {validation?.valid && (
            <div className="flex items-center space-x-2 p-2 bg-green-50 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-700">配置验证通过</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { useState, useEffect } from "react";
import { useSCTPStore } from "@/store";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { NetworkConfig } from "@/types";

const presets: { name: string; config: Partial<NetworkConfig> }[] = [
  {
    name: "理想网络",
    config: { lossRate: 0, minDelay: 50, maxDelay: 100, reorderRate: 0 },
  },
  {
    name: "良好网络",
    config: { lossRate: 0.01, minDelay: 100, maxDelay: 200, reorderRate: 0.3 },
  },
  {
    name: "普通网络",
    config: { lossRate: 0.05, minDelay: 200, maxDelay: 500, reorderRate: 0.5 },
  },
  {
    name: "较差网络",
    config: { lossRate: 0.1, minDelay: 300, maxDelay: 800, reorderRate: 0.7 },
  },
  {
    name: "恶劣网络",
    config: { lossRate: 0.2, minDelay: 500, maxDelay: 1500, reorderRate: 0.9 },
  },
];

export function NetworkConfig() {
  const { networkConfig, connectionStatus } = useSCTPStore((state) => ({
    networkConfig: state.networkConfig,
    connectionStatus: state.connectionStatus,
  }));
  const { sendNetworkConfig } = useWebSocket();

  const [localConfig, setLocalConfig] = useState<NetworkConfig>(networkConfig);

  useEffect(() => {
    setLocalConfig(networkConfig);
  }, [networkConfig]);

  const handleConfigChange = (key: keyof NetworkConfig, value: number) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
  };

  const applyConfig = () => {
    sendNetworkConfig(localConfig);
  };

  const applyPreset = (preset: Partial<NetworkConfig>) => {
    const newConfig = { ...localConfig, ...preset };
    setLocalConfig(newConfig);
    if (connectionStatus === "connected") {
      sendNetworkConfig(newConfig);
    }
  };

  const isDisabled = connectionStatus !== "connected";

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-lg font-semibold mb-4">网络配置</h2>

      <div className="mb-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">快速预设</h3>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.config)}
              disabled={isDisabled}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              丢包率
            </label>
            <span className="text-sm font-mono font-bold text-red-600">
              {(localConfig.lossRate * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={localConfig.lossRate}
            onChange={(e) =>
              handleConfigChange("lossRate", parseFloat(e.target.value))
            }
            disabled={isDisabled}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            模拟网络丢包，范围 0% - 50%
          </p>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              最小延迟
            </label>
            <span className="text-sm font-mono font-bold text-blue-600">
              {localConfig.minDelay}ms
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="1000"
            step="10"
            value={localConfig.minDelay}
            onChange={(e) =>
              handleConfigChange("minDelay", parseInt(e.target.value))
            }
            disabled={isDisabled}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              最大延迟
            </label>
            <span className="text-sm font-mono font-bold text-blue-600">
              {localConfig.maxDelay}ms
            </span>
          </div>
          <input
            type="range"
            min="50"
            max="2000"
            step="50"
            value={localConfig.maxDelay}
            onChange={(e) =>
              handleConfigChange("maxDelay", parseInt(e.target.value))
            }
            disabled={isDisabled}
            className="w-full"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-sm font-medium text-gray-700">
              乱序概率
            </label>
            <span className="text-sm font-mono font-bold text-purple-600">
              {(localConfig.reorderRate * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localConfig.reorderRate}
            onChange={(e) =>
              handleConfigChange("reorderRate", parseFloat(e.target.value))
            }
            disabled={isDisabled}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            批量消息发送时的乱序概率
          </p>
        </div>

        <button
          onClick={applyConfig}
          disabled={isDisabled}
          className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          应用配置
        </button>
      </div>

      <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">
          💡 提示
        </h3>
        <ul className="text-xs text-yellow-700 space-y-1">
          <li>• 连接服务器后才能调整网络参数</li>
          <li>• 点击预设可快速切换网络环境</li>
          <li>• 较高的丢包率会触发更多重传</li>
        </ul>
      </div>
    </div>
  );
}

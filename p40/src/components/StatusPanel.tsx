import React from 'react';
import { useStore } from '../store/useStore';
import { Battery, Signal, Thermometer, Ruler, Wifi, Activity } from 'lucide-react';

export const StatusPanel: React.FC = () => {
  const { robotStatus, webRTC, forceFeedback } = useStore();

  const getBatteryColor = (level: number) => {
    if (level > 60) return 'text-green-400';
    if (level > 30) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getDistanceColor = (distance: number) => {
    if (distance > 80) return 'text-green-400';
    if (distance > 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-[#0a1628]/80 backdrop-blur rounded-lg p-4 border border-cyan-500/20">
      <h3 className="text-cyan-400 font-mono text-sm mb-4 flex items-center gap-2">
        <Activity size={16} />
        机器人状态
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Battery size={14} />
            电量
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${robotStatus.battery > 60 ? 'bg-green-500' : robotStatus.battery > 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${robotStatus.battery}%` }}
              />
            </div>
            <span className={`font-mono text-sm ${getBatteryColor(robotStatus.battery)}`}>
              {robotStatus.battery}%
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Signal size={14} />
            信号
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 transition-all duration-300"
                style={{ width: `${robotStatus.signalStrength}%` }}
              />
            </div>
            <span className="font-mono text-sm text-cyan-400">
              {robotStatus.signalStrength}%
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Ruler size={14} />
            距离
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${robotStatus.distance > 80 ? 'bg-green-500' : robotStatus.distance > 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, robotStatus.distance)}%` }}
              />
            </div>
            <span className={`font-mono text-sm ${getDistanceColor(robotStatus.distance)}`}>
              {robotStatus.distance}cm
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <Thermometer size={14} />
            温度
          </div>
          <div className="font-mono text-sm text-white">
            {robotStatus.temperature}°C
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-cyan-500/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Wifi size={14} className={webRTC.isConnected ? 'text-green-400' : 'text-red-400'} />
            <span className="text-white/60">WebRTC</span>
          </div>
          <span className={`font-mono ${webRTC.isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {webRTC.connectionStatus.toUpperCase()}
          </span>
        </div>
        
        {webRTC.dataChannelReady && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-white/60">数据通道</span>
            <span className="font-mono text-green-400">已就绪</span>
          </div>
        )}
      </div>

      {forceFeedback.resistance > 0 && (
        <div className="mt-4 pt-4 border-t border-cyan-500/10">
          <div className="text-xs text-white/60 mb-2">力反馈阻力</div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                forceFeedback.warning === 'danger' ? 'bg-red-500' :
                forceFeedback.warning === 'caution' ? 'bg-yellow-500' : 'bg-cyan-500'
              }`}
              style={{ width: `${forceFeedback.resistance * 100}%` }}
            />
          </div>
          <div className="text-right text-xs font-mono mt-1 text-white/60">
            {Math.round(forceFeedback.resistance * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};

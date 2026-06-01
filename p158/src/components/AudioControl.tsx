import React from 'react';
import { Mic, MicOff, Settings, Volume2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface AudioControlProps {
  onToggle: () => void;
  isRecording: boolean;
  isLoading?: boolean;
}

export const AudioControl: React.FC<AudioControlProps> = ({ onToggle, isRecording, isLoading }) => {
  const { audio, error } = useAppStore();

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-400" />
          音频控制
        </h3>
        <div
          className={`w-3 h-3 rounded-full ${isRecording ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onToggle}
            disabled={isLoading}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium transition-all duration-300 ${
              isRecording
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 hover:shadow-lg hover:shadow-blue-500/20'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isRecording ? (
              <>
                <MicOff className="w-5 h-5" />
                停止采集
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                开始采集
              </>
            )}
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              信号强度
            </span>
            <span className="text-white font-mono">{Math.round(audio.volume * 100)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                audio.volume > 0.7 ? 'bg-green-400' : audio.volume > 0.3 ? 'bg-yellow-400' : 'bg-gray-500'
              }`}
              style={{ width: `${audio.volume * 100}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-gray-400 mb-1">采样率</div>
            <div className="text-white font-mono">{audio.sampleRate} Hz</div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3">
            <div className="text-gray-400 mb-1">设备数</div>
            <div className="text-white font-mono">{audio.devices.length}</div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {audio.devices.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm text-gray-400">选择音频设备</label>
            <select
              value={audio.deviceId || ''}
              onChange={(e) => useAppStore.getState().setDeviceId(e.target.value || null)}
              className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              disabled={isRecording}
            >
              <option value="">默认设备</option>
              {audio.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `麦克风 ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

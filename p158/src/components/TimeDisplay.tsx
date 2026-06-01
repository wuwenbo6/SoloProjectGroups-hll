import React, { useState, useEffect } from 'react';
import { Clock, Calendar, Signal, Cpu } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { formatTime, formatDate, getCurrentSystemTime } from '../utils/timeUtils';

export const TimeDisplay: React.FC = () => {
  const { decodedTime, isLocked, decoder } = useAppStore();
  const [systemTime, setSystemTime] = useState(getCurrentSystemTime());

  useEffect(() => {
    const interval = setInterval(() => {
      setSystemTime(getCurrentSystemTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-400" />
          解码时间
        </h3>
        <div className="flex items-center gap-2">
          <Signal className={`w-5 h-5 ${isLocked ? 'text-green-400' : 'text-gray-500'}`} />
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              isLocked
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
            }`}
          >
            {isLocked ? '信号锁定' : '等待信号'}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        <div className="text-center">
          <div className="text-6xl md:text-7xl font-bold font-mono tracking-wider mb-2">
            {decodedTime ? (
              <span className="text-green-400">
                {formatTime(decodedTime.hour, decodedTime.minute, decodedTime.second)}
              </span>
            ) : (
              <span className="text-gray-600">--:--:--</span>
            )}
          </div>
          <div className="text-xl md:text-2xl text-gray-400 font-mono">
            {decodedTime ? (
              <span className="flex items-center justify-center gap-2">
                <Calendar className="w-5 h-5" />
                {formatDate(decodedTime.fullYear, decodedTime.dayOfYear)}
                <span className="text-gray-600">|</span>
                第 {decodedTime.dayOfYear} 天
              </span>
            ) : (
              '----/--/--'
            )}
          </div>
        </div>

        {decodedTime && (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-4 text-center">
              <div className="text-gray-400 text-sm mb-1">信号质量</div>
              <div className="text-2xl font-bold text-green-400 font-mono">
                {decodedTime.signalQuality}%
              </div>
              <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    decodedTime.signalQuality > 80
                      ? 'bg-green-400'
                      : decodedTime.signalQuality > 50
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                  }`}
                  style={{ width: `${decodedTime.signalQuality}%` }}
                />
              </div>
            </div>
            <div className="bg-gray-900/50 rounded-lg p-4 text-center">
              <div className="text-gray-400 text-sm mb-1">完整年份</div>
              <div className="text-2xl font-bold text-blue-400 font-mono">
                {decodedTime.fullYear}
              </div>
            </div>
          </div>
        )}

        {decoder.formatInfo && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-400 text-sm mb-2">
              <Cpu className="w-4 h-4" />
              <span className="font-medium">检测格式</span>
            </div>
            <div className="text-white text-sm">
              {decoder.formatInfo.description}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span>码元周期: {decoder.formatInfo.symbolDuration.toFixed(1)}ms</span>
              <span>缓冲区: {decoder.formatInfo.bufferSize}</span>
              <span>置信度: {(decoder.formatInfo.confidence * 100).toFixed(0)}%</span>
            </div>
          </div>
        )}

        <div className="border-t border-gray-700/50 pt-4">
          <div className="text-sm text-gray-400 mb-2">系统时间 (参考)</div>
          <div className="text-2xl font-mono text-gray-300">
            {systemTime.dateStr} {systemTime.timeStr}
          </div>
        </div>
      </div>
    </div>
  );
};

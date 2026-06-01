import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { timeSourceManager } from '../utils/timeSources';
import { formatDateTime } from '../utils/timeUtils';

export function TimeSourceComparison() {
  const {
    timeSources,
    timeReadings,
    timeComparisons,
    decodedTime,
    setTimeSourceEnabled,
    setTimeReadings,
    setTimeComparisons,
  } = useAppStore();

  const updateTimeReadings = useCallback(() => {
    const readings = timeSourceManager.getAllReadings();

    if (decodedTime) {
      readings.set('irigb', {
        sourceId: 'irigb',
        timestamp: decodedTime.timestamp,
        rawTime: decodedTime.timestamp,
        uncertaintyMs: 10,
      });
      timeSourceManager.getLastReading = (sourceId: string) => {
        if (sourceId === 'irigb') {
          return {
            sourceId: 'irigb',
            timestamp: decodedTime.timestamp,
            rawTime: decodedTime.timestamp,
            uncertaintyMs: 10,
          };
        }
        return timeSourceManager['lastReadings'].get(sourceId) || null;
      };
    }

    setTimeReadings(readings);

    const irigbReading = decodedTime
      ? {
          sourceId: 'irigb',
          timestamp: decodedTime.timestamp,
          rawTime: decodedTime.timestamp,
          uncertaintyMs: 10,
        }
      : readings.get('irigb');

    if (irigbReading) {
      const comparisons = timeSources
        .filter((s) => s.isEnabled && s.isAvailable && s.id !== 'irigb')
        .map((source) => {
          const reading = readings.get(source.id);
          if (!reading) return null;

          const offsetMs = reading.timestamp - irigbReading.timestamp;

          return {
            sourceId: source.id,
            sourceName: source.name,
            timestamp: reading.timestamp,
            offsetMs,
            uncertaintyMs: reading.uncertaintyMs,
          };
        })
        .filter(Boolean);

      setTimeComparisons(comparisons);
    }
  }, [decodedTime, timeSources, setTimeReadings, setTimeComparisons]);

  useEffect(() => {
    const interval = setInterval(updateTimeReadings, 1000);
    updateTimeReadings();

    return () => clearInterval(interval);
  }, [updateTimeReadings]);

  const getStatusColor = (offsetMs: number) => {
    const absOffset = Math.abs(offsetMs);
    if (absOffset < 10) return 'text-green-500';
    if (absOffset < 100) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getStatusBg = (offsetMs: number) => {
    const absOffset = Math.abs(offsetMs);
    if (absOffset < 10) return 'bg-green-500/10 border-green-500/30';
    if (absOffset < 100) return 'bg-yellow-500/10 border-yellow-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'irigb':
        return '📡';
      case 'system':
        return '💻';
      case 'performance':
        return '⚡';
      case 'http':
        return '🌐';
      case 'ntp':
        return '⏰';
      default:
        return '❓';
    }
  };

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">📊</span>
        多时间源对比
      </h3>

      <div className="space-y-4">
        <div className="grid gap-3">
          {timeSources.map((source) => {
            const reading = timeReadings.get(source.id);
            const comparison = timeComparisons.find((c) => c.sourceId === source.id);

            return (
              <div
                key={source.id}
                className={`p-4 rounded-lg border transition-all ${
                  source.id === 'irigb'
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : comparison
                    ? `${getStatusBg(comparison.offsetMs)}`
                    : 'bg-gray-700/30 border-gray-600/30'
                } ${!source.isAvailable ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getSourceIcon(source.type)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{source.name}</span>
                        {source.id === 'irigb' && (
                          <span className="text-xs bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded">
                            参考基准
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">{source.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {source.isAvailable && source.type !== 'irigb' && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={source.isEnabled}
                          onChange={(e) => setTimeSourceEnabled(source.id, e.target.checked)}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span className="text-xs text-gray-400">启用</span>
                      </label>
                    )}

                    {!source.isAvailable && (
                      <span className="text-xs text-gray-500 bg-gray-700 px-2 py-1 rounded">
                        不可用
                      </span>
                    )}
                  </div>
                </div>

                {reading && (
                  <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-600/30">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">当前时间</p>
                      <p className="text-sm font-mono text-white">
                        {formatDateTime(new Date(reading.timestamp))}
                      </p>
                      <p className="text-xs text-gray-500">
                        不确定度: ±{reading.uncertaintyMs.toFixed(0)}ms
                      </p>
                    </div>

                    {comparison && (
                      <div className="text-right">
                        <p className="text-xs text-gray-400 mb-1">与IRIG-B偏差</p>
                        <p className={`text-lg font-bold font-mono ${getStatusColor(comparison.offsetMs)}`}>
                          {comparison.offsetMs > 0 ? '+' : ''}
                          {comparison.offsetMs.toFixed(2)} ms
                        </p>
                        <p className="text-xs text-gray-500">
                          {Math.abs(comparison.offsetMs) < 10
                            ? '同步良好'
                            : Math.abs(comparison.offsetMs) < 100
                            ? '轻微偏差'
                            : '偏差较大'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {!reading && source.isEnabled && source.isAvailable && (
                  <div className="mt-2 text-center text-sm text-gray-500">
                    等待数据...
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {timeComparisons.length > 0 && (
          <div className="mt-4 p-4 bg-gray-900/50 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">偏差统计</h4>
            <div className="flex items-center gap-6">
              {timeComparisons.map((comp) => (
                <div key={comp.sourceId} className="flex items-center gap-2">
                  <span className="text-lg">{getSourceIcon(comp.sourceId)}</span>
                  <div className="h-2 w-24 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        Math.abs(comp.offsetMs) < 10
                          ? 'bg-green-500'
                          : Math.abs(comp.offsetMs) < 100
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.abs(comp.offsetMs) / 2)}%` }}
                    />
                  </div>
                  <span className={`text-sm font-mono ${getStatusColor(comp.offsetMs)}`}>
                    {comp.offsetMs > 0 ? '+' : ''}
                    {comp.offsetMs.toFixed(1)}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

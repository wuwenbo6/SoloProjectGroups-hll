import { useState, useEffect } from 'react';
import { Activity, Settings, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import { api } from '../utils/api.js';
import { formatDateTime } from '../utils/format.js';
import type { MotionDetectionStatus, MotionRegion, MotionEvent } from '../../shared/types.js';

export function MotionDetectionPanel() {
  const [status, setStatus] = useState<MotionDetectionStatus | null>(null);
  const [motionEvents, setMotionEvents] = useState<MotionEvent[]>([]);
  const [sensitivity, setSensitivity] = useState(50);

  useEffect(() => {
    loadStatus();
    loadMotionEvents();
    const interval = setInterval(() => {
      loadStatus();
      loadMotionEvents();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    try {
      const data = await api.getMotionStatus() as MotionDetectionStatus;
      setStatus(data);
      setSensitivity(data.sensitivity);
    } catch (error) {
      console.error('Failed to load motion status:', error);
    }
  }

  async function loadMotionEvents() {
    try {
      const data = await api.getMotionEvents() as MotionEvent[];
      setMotionEvents(data);
    } catch (error) {
      console.error('Failed to load motion events:', error);
    }
  }

  async function handleToggleEnabled() {
    if (!status) return;
    try {
      await api.updateMotionConfig({ enabled: !status.enabled });
      loadStatus();
    } catch (error) {
      console.error('Failed to toggle motion detection:', error);
    }
  }

  async function handleSensitivityChange(value: number) {
    setSensitivity(value);
    try {
      await api.updateMotionConfig({ sensitivity: value });
    } catch (error) {
      console.error('Failed to update sensitivity:', error);
    }
  }

  async function handleToggleRegion(regionId: string, enabled: boolean) {
    try {
      await api.toggleRegion(regionId, enabled);
      loadStatus();
    } catch (error) {
      console.error('Failed to toggle region:', error);
    }
  }

  if (!status) return null;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={18} className={status.enabled ? 'text-yellow-400' : 'text-slate-500'} />
          <h3 className="font-semibold text-white">运动检测</h3>
          {status.enabled && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
              运行中
            </span>
          )}
        </div>
        <button
          onClick={handleToggleEnabled}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            status.enabled
              ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {status.enabled ? <><EyeOff size={14} className="inline mr-1" />禁用</> : <><Eye size={14} className="inline mr-1" />启用</>}
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-slate-400">灵敏度</label>
            <span className="text-sm font-mono text-white">{sensitivity}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={sensitivity}
            onChange={(e) => handleSensitivityChange(parseInt(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>低</span>
            <span>高</span>
          </div>
        </div>

        <div>
          <label className="text-sm text-slate-400 mb-2 block">检测区域</label>
          <div className="space-y-2">
            {status.regions.map((region) => (
              <div
                key={region.id}
                className="flex items-center justify-between p-2.5 bg-slate-800/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: region.enabled ? '#eab308' : '#475569',
                    }}
                  />
                  <span className="text-sm text-white">{region.name}</span>
                  <span className="text-xs text-slate-500">
                    ({region.x},{region.y}) {region.width}×{region.height}
                  </span>
                </div>
                <button
                  onClick={() => handleToggleRegion(region.id, !region.enabled)}
                  className={`px-2 py-1 rounded text-xs ${
                    region.enabled
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-slate-700 text-slate-500'
                  }`}
                >
                  {region.enabled ? '启用' : '禁用'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-slate-400">检测事件</label>
            <span className="text-xs text-slate-500">{motionEvents.length} 个</span>
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {motionEvents.length === 0 ? (
              <div className="text-xs text-slate-600 text-center py-3">暂无运动检测事件</div>
            ) : (
              [...motionEvents].reverse().slice(0, 20).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-2 bg-slate-800/30 rounded text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor:
                          event.intensity > 80
                            ? '#ef4444'
                            : event.intensity > 60
                            ? '#eab308'
                            : '#22c55e',
                      }}
                    />
                    <span className="text-slate-300">{event.regionName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-400">{event.intensity}%</span>
                    <span className="text-slate-500">
                      {(event.confidence)}%
                    </span>
                    <span className="text-slate-600">
                      {formatDateTime(event.timestamp).split(' ')[1]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-white">{status.eventCount}</div>
            <div className="text-xs text-slate-500">检测事件数</div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-yellow-400">
              {motionEvents.length > 0
                ? Math.max(...motionEvents.map(e => e.intensity))
                : 0}%
            </div>
            <div className="text-xs text-slate-500">最高强度</div>
          </div>
        </div>
      </div>
    </div>
  );
}

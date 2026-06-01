import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, AlertTriangle, Activity, Zap, Eye, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { DetectionResult, SyncStatus } from '../hooks/useWebSocket';

interface AlarmPanelProps {
  detectionResult: DetectionResult | null;
  seizureCount: number;
  alarmMuted: boolean;
  onToggleMute: () => void;
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  artifactThreshold?: number;
  onArtifactThresholdChange?: (threshold: number) => void;
  syncStatus?: SyncStatus;
  wsConnected?: boolean;
}

export function AlarmPanel({
  detectionResult,
  seizureCount,
  alarmMuted,
  onToggleMute,
  threshold,
  onThresholdChange,
  artifactThreshold = 0.6,
  onArtifactThresholdChange,
  syncStatus,
  wsConnected = true
}: AlarmPanelProps) {
  const [isAlarming, setIsAlarming] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<number | null>(null);

  const playAlarmSound = () => {
    if (alarmMuted) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error('Failed to play alarm:', e);
    }
  };

  useEffect(() => {
    if (detectionResult?.isSeizure && detectionResult.confidence >= threshold) {
      setIsAlarming(true);
      
      if (!alarmIntervalRef.current && !alarmMuted) {
        playAlarmSound();
        alarmIntervalRef.current = window.setInterval(playAlarmSound, 1000);
      }
    } else {
      setIsAlarming(false);
      
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
      }
    };
  }, [detectionResult?.isSeizure, detectionResult?.confidence, threshold, alarmMuted]);

  const confidence = detectionResult?.confidence ?? 0;
  const hasArtifact = detectionResult?.hasArtifact ?? false;
  const artifactScore = detectionResult?.artifactScore ?? 0;
  const artifactType = detectionResult?.artifactType;

  const statusColor = isAlarming ? 'text-red-500' : confidence > 0.5 ? 'text-yellow-500' : 'text-green-500';
  const statusBg = isAlarming ? 'bg-red-500/20' : confidence > 0.5 ? 'bg-yellow-500/20' : 'bg-green-500/20';
  
  const artifactColor = hasArtifact 
    ? (artifactType === 'emg' ? 'text-orange-500' : 'text-purple-500')
    : artifactScore > 0.3 ? 'text-yellow-500' : 'text-green-500';
  const artifactBg = hasArtifact 
    ? (artifactType === 'emg' ? 'bg-orange-500/20' : 'bg-purple-500/20')
    : 'bg-green-500/10';

  return (
    <div className="space-y-4">
      <div className={`p-6 rounded-xl border transition-all duration-300 ${
        isAlarming 
          ? 'border-red-500 bg-red-500/10 animate-pulse' 
          : 'border-slate-700 bg-slate-800/50'
      }`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-full ${statusBg}`}>
              {isAlarming ? (
                <AlertTriangle className={`w-6 h-6 ${statusColor} animate-bounce`} />
              ) : (
                <Activity className={`w-6 h-6 ${statusColor}`} />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">检测状态</h3>
              <p className={`text-sm font-medium ${statusColor}`}>
                {isAlarming ? '⚠️ 检测到癫痫样放电!' : '✓ 正常监测中'}
              </p>
            </div>
          </div>
          
          <button
            onClick={onToggleMute}
            className={`p-3 rounded-lg transition-colors ${
              alarmMuted 
                ? 'bg-slate-600 text-slate-400' 
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {alarmMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">置信度</span>
              <span className={`font-mono font-bold ${statusColor}`}>
                {(confidence * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  isAlarming ? 'bg-red-500' : confidence > 0.5 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">报警阈值</span>
              <span className="text-white font-mono">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={threshold}
              onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-3xl font-bold text-red-500 font-mono">{seizureCount}</div>
              <div className="text-xs text-slate-400 mt-1">检测到异常</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xl font-bold text-blue-500 font-mono">
                {detectionResult?.seizureType || '-'}
              </div>
              <div className="text-xs text-slate-400 mt-1">发作类型</div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-xl border border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${artifactBg}`}>
            <Zap className={`w-5 h-5 ${artifactColor}`} />
          </div>
          <h3 className="text-lg font-semibold text-white">伪迹检测</h3>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-400">伪迹程度</span>
              <span className={`font-mono font-bold ${artifactColor}`}>
                {hasArtifact 
                  ? (artifactType === 'emg' ? '肌电干扰' : '眼电干扰') 
                  : artifactScore > 0.3 ? '轻度干扰' : '良好'}
              </span>
            </div>
            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-200 ${
                  hasArtifact 
                    ? (artifactType === 'emg' ? 'bg-orange-500' : 'bg-purple-500')
                    : artifactScore > 0.3 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${artifactScore * 100}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className={`text-lg font-bold font-mono ${
                (detectionResult?.emgScore ?? 0) > 0.5 ? 'text-orange-500' : 'text-slate-300'
              }`}>
                {((detectionResult?.emgScore ?? 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400 mt-1">肌电(EMG)</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className={`text-lg font-bold font-mono ${
                (detectionResult?.eogScore ?? 0) > 0.5 ? 'text-purple-500' : 'text-slate-300'
              }`}>
                {((detectionResult?.eogScore ?? 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-slate-400 mt-1">眼电(EOG)</div>
            </div>
          </div>

          {onArtifactThresholdChange && (
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-slate-400">伪迹过滤强度</span>
                <span className="text-white font-mono">{(artifactThreshold * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                value={artifactThreshold}
                onChange={(e) => onArtifactThresholdChange(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
            </div>
          )}

          {hasArtifact && (
            <div className={`p-3 rounded-lg text-sm ${
              artifactType === 'emg' 
                ? 'bg-orange-500/10 border border-orange-500/30 text-orange-300'
                : 'bg-purple-500/10 border border-purple-500/30 text-purple-300'
            }`}>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                <span>
                  {artifactType === 'emg' 
                    ? '检测到肌电干扰，请减少肌肉活动'
                    : '检测到眼电干扰，请减少眨眼'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-6 rounded-xl border border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg ${
            syncStatus?.isSyncing ? 'bg-blue-500/20' : wsConnected ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            {syncStatus?.isSyncing ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            ) : wsConnected ? (
              <Cloud className="w-5 h-5 text-green-400" />
            ) : (
              <CloudOff className="w-5 h-5 text-red-400" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-white">数据同步</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">服务器连接</span>
            <span className={`text-sm font-medium ${wsConnected ? 'text-green-400' : 'text-red-400'}`}>
              {wsConnected ? '已连接' : '离线'}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">待同步数据</span>
            <span className="text-sm font-mono text-yellow-400">
              {syncStatus?.pendingCount ?? 0} 条
            </span>
          </div>

          {syncStatus?.isSyncing && (
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">同步进度</span>
              <span className="text-sm font-mono text-blue-400">
                {syncStatus.syncedCount} / {syncStatus.pendingCount + syncStatus.syncedCount}
              </span>
            </div>
          )}

          {!wsConnected && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>离线模式，数据已缓存到本地</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

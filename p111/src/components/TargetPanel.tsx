import React from 'react';
import { TargetTrack, TargetClassification, FISH_SPECIES_INFO } from '../types/sonar';

interface TargetPanelProps {
  tracks: TargetTrack[];
  classifications: TargetClassification[];
  selectedTargetId: string | null;
  onSelectTarget: (targetId: string | null) => void;
}

export const TargetPanel: React.FC<TargetPanelProps> = ({
  tracks,
  classifications,
  selectedTargetId,
  onSelectTarget,
}) => {
  const activeTracks = tracks.filter((t) => t.isActive).slice(0, 8);

  const getClassification = (targetId: string) => {
    return classifications.find((c) => c.targetId === targetId);
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-sonar-dark/90 backdrop-blur-sm rounded-xl p-4 border border-sonar-scan/30 shadow-xl">
      <h3 className="text-lg font-bold text-sonar-scan mb-4 font-mono border-b border-sonar-scan/30 pb-2">
        🎯 目标检测 ({activeTracks.length})
      </h3>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
        {activeTracks.length === 0 ? (
          <div className="text-gray-500 text-sm font-mono text-center py-4">
            未检测到有效目标
          </div>
        ) : (
          activeTracks.map((track) => {
            const classification = getClassification(track.targetId);
            const speciesInfo = classification
              ? FISH_SPECIES_INFO[classification.species]
              : FISH_SPECIES_INFO.unknown;
            const lastPoint = track.points[track.points.length - 1];
            const trackDuration = track.lastSeen - track.firstSeen;

            return (
              <div
                key={track.targetId}
                className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                  selectedTargetId === track.targetId
                    ? 'bg-sonar-scan/20 border border-sonar-scan/50'
                    : 'bg-black/30 border border-transparent hover:border-sonar-scan/30'
                }`}
                onClick={() =>
                  onSelectTarget(
                    selectedTargetId === track.targetId ? null : track.targetId
                  )
                }
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: speciesInfo.color }}
                    />
                    <span className="text-white font-mono text-xs">
                      {track.targetId.slice(0, 8)}
                    </span>
                  </div>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: `${speciesInfo.color}30`,
                      color: speciesInfo.color,
                    }}
                  >
                    {speciesInfo.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-gray-500">距离: </span>
                    <span className="text-white">
                      {(lastPoint.distance * 1000).toFixed(0)}m
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">方位: </span>
                    <span className="text-white">{lastPoint.angle.toFixed(1)}°</span>
                  </div>
                  <div>
                    <span className="text-gray-500">强度: </span>
                    <span className="text-sonar-echo">
                      {(lastPoint.intensity * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">跟踪: </span>
                    <span className="text-sonar-scan">{formatTime(trackDuration)}</span>
                  </div>
                </div>

                {classification && (
                  <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-mono">
                        置信度
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: speciesInfo.color }}
                      >
                        {(classification.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${classification.confidence * 100}%`,
                          backgroundColor: speciesInfo.color,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

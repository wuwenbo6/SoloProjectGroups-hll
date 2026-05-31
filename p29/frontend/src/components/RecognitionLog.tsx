import React, { useState, useEffect } from 'react';
import { recognitionLogger, RecognitionSession, ExportOptions } from '../utils/recognitionLogger';
import { RecognitionResult, FaceOrientation } from '../types';

interface RecognitionLogProps {
  isRecognizing: boolean;
  latestResult: RecognitionResult | null;
  orientation: FaceOrientation | null;
  imageQuality?: { brightness: number; noiseLevel: number };
}

export const RecognitionLog: React.FC<RecognitionLogProps> = ({
  isRecognizing,
  latestResult,
  orientation,
  imageQuality
}) => {
  const [sessions, setSessions] = useState<RecognitionSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'json' | 'csv' | 'txt'>('json');
  const [includeQuality, setIncludeQuality] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (isRecognizing && !recognitionLogger.getCurrentSession()) {
      recognitionLogger.startSession();
    } else if (!isRecognizing && recognitionLogger.getCurrentSession()) {
      recognitionLogger.endSession();
      loadSessions();
    }
  }, [isRecognizing]);

  useEffect(() => {
    if (isRecognizing && latestResult && latestResult.consonant !== 'silence') {
      recognitionLogger.logRecognition(
        latestResult,
        orientation || undefined,
        imageQuality,
        undefined,
        'main_camera'
      );
    }
  }, [latestResult, isRecognizing, orientation, imageQuality]);

  const loadSessions = () => {
    setSessions(recognitionLogger.getSessionHistory().reverse());
  };

  const handleExport = (sessionId: string) => {
    const options: ExportOptions = {
      format: exportFormat,
      includeQualityMetrics: includeQuality
    };
    recognitionLogger.downloadExport(sessionId, options);
  };

  const handleExportCurrent = () => {
    const current = recognitionLogger.getCurrentSession();
    if (current && current.entries.length > 0) {
      const options: ExportOptions = {
        format: exportFormat,
        includeQualityMetrics: includeQuality
      };
      
      const tempSession = {
        ...current,
        endTime: Date.now()
      };
      
      const content = recognitionLogger.exportSession(tempSession.id, options);
      if (content) {
        const extensions: Record<string, string> = {
          json: 'json',
          csv: 'csv',
          txt: 'txt'
        };
        const filename = `lip_reading_current.${extensions[exportFormat]}`;
        const mimeTypes: Record<string, string> = {
          json: 'application/json',
          csv: 'text/csv',
          txt: 'text/plain'
        };

        const blob = new Blob([content], { type: mimeTypes[exportFormat] });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const currentSession = recognitionLogger.getCurrentSession();

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-orange-400"></span>
          识别日志
        </h3>
        <button
          onClick={loadSessions}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          刷新
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-700/30 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-2">导出设置</p>
          <div className="flex flex-wrap gap-2">
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1"
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
              <option value="txt">TXT</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={includeQuality}
                onChange={(e) => setIncludeQuality(e.target.checked)}
                className="rounded"
              />
              包含质量指标
            </label>
          </div>
        </div>

        {currentSession && currentSession.entries.length > 0 && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                <span className="text-green-400 text-sm font-medium">正在记录</span>
              </div>
              <button
                onClick={handleExportCurrent}
                className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded hover:bg-green-500/30 transition-colors"
              >
                导出当前
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-500">识别次数</div>
              <div className="text-white text-right">{currentSession.totalRecognitions}</div>
              <div className="text-gray-500">平均置信度</div>
              <div className="text-white text-right">
                {(currentSession.averageConfidence * 100).toFixed(1)}%
              </div>
              <div className="text-gray-500">持续时间</div>
              <div className="text-white text-right">
                {formatDuration(Date.now() - currentSession.startTime)}
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400 mb-2">历史会话</p>
          {sessions.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              暂无历史记录
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`bg-gray-700/30 rounded-lg p-3 cursor-pointer transition-colors hover:bg-gray-700/50 ${
                    selectedSession === session.id ? 'ring-1 ring-cyan-500' : ''
                  }`}
                  onClick={() => setSelectedSession(
                    selectedSession === session.id ? null : session.id
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm">
                        {new Date(session.startTime).toLocaleString()}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {session.totalRecognitions} 次识别 · 平均 {(session.averageConfidence * 100).toFixed(0)}% · {formatDuration(session.endTime - session.startTime)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(session.id);
                      }}
                      className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded hover:bg-cyan-500/30 transition-colors"
                    >
                      导出
                    </button>
                  </div>

                  {selectedSession === session.id && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <p className="text-xs text-gray-400 mb-2">辅音统计</p>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(
                          recognitionLogger.getConsonantStats(session.id)
                        ).map(([consonant, stats]) => (
                          <div
                            key={consonant}
                            className="bg-gray-600/50 rounded px-2 py-1 text-xs"
                          >
                            <span className="text-white font-medium">{consonant.toUpperCase()}</span>
                            <span className="text-gray-400 ml-1">×{stats.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {sessions.length > 0 && (
          <button
            onClick={() => {
              recognitionLogger.clearHistory();
              loadSessions();
            }}
            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors"
          >
            清除所有历史
          </button>
        )}
      </div>
    </div>
  );
};

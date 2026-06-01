import React from 'react';

interface LogPanelProps {
  isLogging: boolean;
  logCount: number;
  onStartLogging: () => void;
  onStopLogging: () => void;
  onDownloadJSON: () => void;
  onDownloadCSV: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = ({
  isLogging,
  logCount,
  onStartLogging,
  onStopLogging,
  onDownloadJSON,
  onDownloadCSV,
}) => {
  return (
    <div className="bg-sonar-dark/90 backdrop-blur-sm rounded-xl p-4 border border-sonar-scan/30 shadow-xl">
      <h3 className="text-lg font-bold text-sonar-scan mb-4 font-mono border-b border-sonar-scan/30 pb-2">
        📋 日志记录
      </h3>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-black/30 rounded-lg">
          <div>
            <div className="text-white font-mono text-sm">状态</div>
            <div
              className={`text-sm font-mono flex items-center gap-2 ${
                isLogging ? 'text-green-400' : 'text-gray-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLogging ? 'bg-green-400 animate-pulse' : 'bg-gray-500'
                }`}
              />
              {isLogging ? '记录中...' : '待机'}
            </div>
          </div>
          <button
            onClick={isLogging ? onStopLogging : onStartLogging}
            className={`px-4 py-2 rounded-lg font-mono text-sm transition-all duration-300 ${
              isLogging
                ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                : 'bg-sonar-scan/20 text-sonar-scan border border-sonar-scan/50 hover:bg-sonar-scan/30'
            }`}
          >
            {isLogging ? '⏹ 停止' : '▶ 开始'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-black/30 rounded-lg text-center">
            <div className="text-gray-500 text-xs font-mono">已记录</div>
            <div className="text-white font-mono text-xl">{logCount}</div>
            <div className="text-gray-500 text-xs font-mono">条数据</div>
          </div>
          <div className="p-3 bg-black/30 rounded-lg text-center">
            <div className="text-gray-500 text-xs font-mono">预计大小</div>
            <div className="text-white font-mono text-xl">
              {(logCount * 0.5).toFixed(1)}
            </div>
            <div className="text-gray-500 text-xs font-mono">KB</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-gray-400 text-xs font-mono mb-2">导出数据</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDownloadJSON}
              disabled={logCount === 0}
              className="py-2 px-3 rounded-lg font-mono text-sm transition-all duration-200 bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📄 JSON
            </button>
            <button
              onClick={onDownloadCSV}
              disabled={logCount === 0}
              className="py-2 px-3 rounded-lg font-mono text-sm transition-all duration-200 bg-purple-500/20 text-purple-400 border border-purple-500/50 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📊 CSV
            </button>
          </div>
        </div>

        <div className="p-3 bg-black/30 rounded-lg">
          <div className="text-xs text-gray-400 font-mono space-y-1">
            <p>• 包含目标位置、强度、分类信息</p>
            <p>• 支持 Excel 直接打开 CSV 文件</p>
            <p>• JSON 包含完整元数据</p>
          </div>
        </div>
      </div>
    </div>
  );
};

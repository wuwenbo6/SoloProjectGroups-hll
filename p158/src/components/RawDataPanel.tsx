import React from 'react';
import { Binary, Info } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const RawDataPanel: React.FC = () => {
  const { decoder, decodedTime } = useAppStore();

  const getSymbolColor = (type: string) => {
    switch (type) {
      case '1':
        return 'bg-green-500/80 text-white';
      case '0':
        return 'bg-gray-600/80 text-gray-300';
      case 'P':
        return 'bg-blue-500/80 text-white';
      default:
        return 'bg-red-500/50 text-red-300';
    }
  };

  const displaySymbols = decoder.symbols.slice(-100);

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Binary className="w-5 h-5 text-blue-400" />
          原始数据
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/80" />
            <span className="text-gray-400">P码</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/80" />
            <span className="text-gray-400">1</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-gray-600/80" />
            <span className="text-gray-400">0</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-900/50 rounded-lg p-4">
          <div className="text-sm text-gray-400 mb-2">码元序列 (最近100个)</div>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
            {displaySymbols.length > 0 ? (
              displaySymbols.map((symbol, index) => (
                <div
                  key={index}
                  className={`w-6 h-6 rounded text-xs font-mono flex items-center justify-center ${getSymbolColor(
                    symbol.type
                  )}`}
                  title={`${symbol.type} - ${symbol.duration.toFixed(1)}ms`}
                >
                  {symbol.type}
                </div>
              ))
            ) : (
              <div className="text-gray-500 py-4">等待信号...</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm mb-1">检测码元数</div>
            <div className="text-2xl font-bold text-blue-400 font-mono">
              {decoder.symbols.length}
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm mb-1">P码数量</div>
            <div className="text-2xl font-bold text-purple-400 font-mono">
              {decoder.symbols.filter((s) => s.type === 'P').length}
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm mb-1">1码数量</div>
            <div className="text-2xl font-bold text-green-400 font-mono">
              {decoder.symbols.filter((s) => s.type === '1').length}
            </div>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-4 text-center">
            <div className="text-gray-400 text-sm mb-1">0码数量</div>
            <div className="text-2xl font-bold text-gray-400 font-mono">
              {decoder.symbols.filter((s) => s.type === '0').length}
            </div>
          </div>
        </div>

        {decodedTime && (
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
              <Info className="w-4 h-4" />
              帧结构解析
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div className="text-center">
                <div className="text-gray-500 mb-1">秒</div>
                <div className="font-mono text-lg text-green-400">
                  {decodedTime.second.toString().padStart(2, '0')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 mb-1">分</div>
                <div className="font-mono text-lg text-green-400">
                  {decodedTime.minute.toString().padStart(2, '0')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 mb-1">时</div>
                <div className="font-mono text-lg text-green-400">
                  {decodedTime.hour.toString().padStart(2, '0')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 mb-1">年积日</div>
                <div className="font-mono text-lg text-blue-400">
                  {decodedTime.dayOfYear.toString().padStart(3, '0')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-gray-500 mb-1">完整年份</div>
                <div className="font-mono text-lg text-blue-400">
                  {decodedTime.fullYear}
                </div>
              </div>
            </div>
          </div>
        )}

        {decoder.formatInfo && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
            <div className="text-sm text-purple-400 mb-2 font-medium">格式检测结果</div>
            <div className="text-white text-sm">
              {decoder.formatInfo.description}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-4 text-xs text-gray-400">
              <div>
                <span className="text-gray-500">格式:</span> {decoder.formatInfo.format}
              </div>
              <div>
                <span className="text-gray-500">码元周期:</span> {decoder.formatInfo.symbolDuration.toFixed(2)}ms
              </div>
              <div>
                <span className="text-gray-500">置信度:</span> {(decoder.formatInfo.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="text-sm text-blue-400 mb-2 font-medium">IRIG-B 格式说明</div>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• <span className="text-blue-300">B000</span>: 直流电平(DC) 100pps，每秒100个码元</li>
            <li>• <span className="text-blue-300">B001</span>: 调制交流(AC) 1000pps</li>
            <li>• <span className="text-blue-300">B002</span>: 1pps 秒脉冲信号</li>
            <li>• 脉冲宽度：2ms = '0'，5ms = '1'，8ms = 位置识别位 (P)</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

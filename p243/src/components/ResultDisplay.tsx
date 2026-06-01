import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Database, FileText, Info, Layers } from 'lucide-react';
import { EncodeResult, DecodeResult, PduPart } from '../types/pdu';

interface ResultDisplayProps {
  encodeResults: EncodeResult[] | null;
  decodeResult: DecodeResult | null;
}

type TabType = 'overview' | 'hex';

const ResultDisplay: React.FC<ResultDisplayProps> = ({ encodeResults, decodeResult }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [selectedPartIndex, setSelectedPartIndex] = useState(0);

  const allResults: (EncodeResult | DecodeResult)[] = [];
  if (encodeResults && encodeResults.length > 0) {
    allResults.push(...encodeResults);
  } else if (decodeResult) {
    allResults.push(decodeResult);
  }

  if (allResults.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 min-h-[300px] flex items-center justify-center">
        <div className="text-center text-gray-400">
          <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">编码或解码后，结果将显示在这里</p>
        </div>
      </div>
    );
  }

  const currentResult = allResults[selectedPartIndex];
  const parts = currentResult.parts || [];
  const rawPdu = 'pdu' in currentResult ? currentResult.pdu : currentResult.rawPdu;

  const togglePart = (partKey: string) => {
    const newExpanded = new Set(expandedParts);
    if (newExpanded.has(partKey)) {
      newExpanded.delete(partKey);
    } else {
      newExpanded.add(partKey);
    }
    setExpandedParts(newExpanded);
  };

  const getPartColor = (name: string): string => {
    if (name.includes('SMSC')) return 'bg-purple-100 text-purple-700 border-purple-200';
    if (name.includes('UDH')) return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    if (name.includes('PDU')) return 'bg-blue-100 text-blue-700 border-blue-200';
    if (name.includes('地址')) return 'bg-green-100 text-green-700 border-green-200';
    if (name.includes('编码') || name.includes('DCS')) return 'bg-amber-100 text-amber-700 border-amber-200';
    if (name.includes('用户数据') || name.includes('UD')) return 'bg-pink-100 text-pink-700 border-pink-200';
    if (name.includes('时间戳')) return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const formatHexDump = (hex: string): string[] => {
    const lines: string[] = [];
    for (let i = 0; i < hex.length; i += 32) {
      lines.push(hex.substring(i, i + 32));
    }
    return lines;
  };

  const getPartLabel = (index: number, result: EncodeResult | DecodeResult): string => {
    if (allResults.length === 1) return '单条短信';
    if ('multiPart' in result && result.multiPart) {
      return `第 ${result.multiPart.partNumber}/${result.multiPart.total} 条`;
    }
    if ('udh' in result && result.udh?.hasUdh && result.udh.concatSeq && result.udh.concatTotal) {
      return `第 ${result.udh.concatSeq}/${result.udh.concatTotal} 条`;
    }
    return `第 ${index + 1}/${allResults.length} 条`;
  };

  const isMultiPart = allResults.length > 1;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-800">PDU 详细分析</h3>
            {isMultiPart && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                <Layers className="w-3 h-3" />
                共 {allResults.length} 条
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            总长度: <span className="font-mono font-medium text-gray-700">{rawPdu.length / 2} 字节</span>
          </div>
        </div>
      </div>

      {isMultiPart && (
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {allResults.map((result, index) => (
            <button
              key={index}
              onClick={() => {
                setSelectedPartIndex(index);
                setExpandedParts(new Set());
              }}
              className={`flex-shrink-0 py-2.5 px-4 text-xs font-medium transition-colors ${
                selectedPartIndex === index
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {getPartLabel(index, result)}
              {'multiPart' in result && result.multiPart && (
                <span className="ml-1 text-blue-500">
                  (Ref={result.multiPart.reference})
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          字段解析
        </button>
        <button
          onClick={() => setActiveTab('hex')}
          className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
            activeTab === 'hex'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          十六进制视图
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="p-4 max-h-[500px] overflow-y-auto">
          {'udh' in currentResult && currentResult.udh?.hasUdh && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 mb-1">
                <Info className="w-3.5 h-3.5" />
                UDH 信息
              </div>
              <div className="text-xs text-indigo-600">
                TP_UDHL=0x{(currentResult.udh.udhLength).toString(16).padStart(2, '0').toUpperCase()}
                {currentResult.udh.concatRef !== undefined && (
                  <span className="ml-2">
                    | 拼接短信: 参考号={currentResult.udh.concatRef}, 总数={currentResult.udh.concatTotal}, 序号={currentResult.udh.concatSeq}
                  </span>
                )}
              </div>
            </div>
          )}

          {'multiPart' in currentResult && currentResult.multiPart && (
            <div className="mb-4 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 mb-1">
                <Info className="w-3.5 h-3.5" />
                UDH 信息
              </div>
              <div className="text-xs text-indigo-600">
                TP_UDHL=0x05
                <span className="ml-2">
                  | 拼接短信: 参考号={currentResult.multiPart.reference}, 总数={currentResult.multiPart.total}, 序号={currentResult.multiPart.partNumber}
                </span>
              </div>
            </div>
          )}

          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-xs font-medium text-gray-500 mb-2">完整 PDU 数据</div>
            <code className="text-xs font-mono text-gray-800 break-all leading-relaxed">
              {rawPdu}
            </code>
          </div>

          <div className="space-y-2">
            {parts.map((part, index) => {
              const partKey = `${selectedPartIndex}-${index}`;
              return (
                <div
                  key={index}
                  className={`rounded-lg border transition-all duration-200 ${getPartColor(part.name)}`}
                >
                  <button
                    onClick={() => togglePart(partKey)}
                    className="w-full p-3 flex items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-3">
                      {expandedParts.has(partKey) ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      <span className="font-medium text-sm">{part.name}</span>
                    </div>
                    <code className="text-xs font-mono bg-white/50 px-2 py-1 rounded">
                      {part.hex.length > 12 ? part.hex.substring(0, 12) + '...' : part.hex}
                    </code>
                  </button>
                  {expandedParts.has(partKey) && (
                    <div className="px-3 pb-3 pt-0 border-t border-current/10">
                      <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
                        <div>
                          <span className="block opacity-70 mb-1">十六进制值</span>
                          <code className="font-mono bg-white/50 px-2 py-1 rounded block break-all">
                            {part.hex}
                          </code>
                        </div>
                        <div>
                          <span className="block opacity-70 mb-1">偏移位置</span>
                          <code className="font-mono bg-white/50 px-2 py-1 rounded block">
                            {part.offset[0]} - {part.offset[1]}
                          </code>
                        </div>
                        <div className="col-span-2">
                          <span className="block opacity-70 mb-1">说明</span>
                          <div className="bg-white/50 px-2 py-1 rounded block">
                            {part.description}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'hex' && (
        <div className="p-4">
          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
            <div className="font-mono text-xs">
              <div className="text-gray-500 mb-2 flex gap-4">
                <span className="w-16 flex-shrink-0">偏移</span>
                <span className="flex-1">00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F</span>
                <span className="w-32 flex-shrink-0">ASCII</span>
              </div>
              {formatHexDump(rawPdu).map((line, lineIndex) => {
                const offset = (lineIndex * 16).toString(16).padStart(4, '0').toUpperCase();
                const hexPairs: string[] = [];
                for (let i = 0; i < line.length; i += 2) {
                  hexPairs.push(line.substring(i, i + 2));
                }
                while (hexPairs.length < 16) {
                  hexPairs.push('  ');
                }
                const hexDisplay = hexPairs.slice(0, 8).join(' ') + '  ' + hexPairs.slice(8).join(' ');
                const ascii = hexPairs
                  .filter(h => h.trim() !== '')
                  .map(h => {
                    const code = parseInt(h, 16);
                    if (code >= 32 && code <= 126) {
                      return String.fromCharCode(code);
                    }
                    return '.';
                  })
                  .join('');
                return (
                  <div key={lineIndex} className="flex gap-4 text-gray-300 hover:bg-gray-800 -mx-2 px-2 py-0.5 rounded">
                    <span className="w-16 flex-shrink-0 text-gray-500">{offset}</span>
                    <span className="flex-1 text-emerald-400 tracking-wider">{hexDisplay}</span>
                    <span className="w-32 flex-shrink-0 text-yellow-400">{ascii}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>左侧为字节偏移，中间为十六进制数据，右侧为可打印 ASCII 字符表示。</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultDisplay;

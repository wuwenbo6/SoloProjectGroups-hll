import React, { useState } from 'react';
import { ArrowRight, Copy, Check, Layers, Terminal, Download, Play, Pause, RotateCcw } from 'lucide-react';
import { EncodeParams, EncodeResult, MultiEncodeResult } from '../types/pdu';
import { encodeMultiPdu } from '../core/pduEncoder';
import { canUse7Bit } from '../core/encoding7bit';
import { getMaxMessageLength, generateAtCommands, downloadBinaryFile, downloadTextFile, AtCommand } from '../core/utils';

interface EncoderProps {
  onEncode: (results: EncodeResult[] | null) => void;
}

const Encoder: React.FC<EncoderProps> = ({ onEncode }) => {
  const [destinationNumber, setDestinationNumber] = useState('+8613800138000');
  const [messageText, setMessageText] = useState('这是一条测试短信，用来演示长短信自动拆分功能。当消息内容超过单条短信的最大长度时，系统会自动将其拆分为多条短信，并在每条短信中添加UDH（用户数据头），其中TP_UDHL=0x05，表示包含拼接信息。');
  const [smscNumber, setSmscNumber] = useState('');
  const [encoding, setEncoding] = useState<'7bit' | 'ucs2'>('ucs2');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<MultiEncodeResult | null>(null);
  const [showAtCommands, setShowAtCommands] = useState(false);
  const [atCommands, setAtCommands] = useState<AtCommand[]>([]);
  const [atCurrentIndex, setAtCurrentIndex] = useState(-1);
  const [atIsRunning, setAtIsRunning] = useState(false);
  const [atOutput, setAtOutput] = useState<string[]>([]);

  const handleEncode = () => {
    const params: EncodeParams = {
      smscNumber: smscNumber || undefined,
      destinationNumber,
      messageText,
      encoding,
      messageType: 'submit',
      requestStatusReport: false
    };
    const encodeResult = encodeMultiPdu(params);
    setResult(encodeResult);
    if (encodeResult.success) {
      onEncode(encodeResult.pdus);
      const commands = generateAtCommands(encodeResult.pdus);
      setAtCommands(commands);
    } else {
      onEncode(null);
      setAtCommands([]);
    }
    setShowAtCommands(false);
    resetAtSimulation();
  };

  const resetAtSimulation = () => {
    setAtCurrentIndex(-1);
    setAtIsRunning(false);
    setAtOutput([]);
  };

  const runAtSimulation = async () => {
    if (atCommands.length === 0) return;
    setAtIsRunning(true);
    setAtOutput([]);
    setAtCurrentIndex(-1);

    for (let i = 0; i < atCommands.length; i++) {
      if (!atIsRunning && i > 0) break;
      setAtCurrentIndex(i);
      const cmd = atCommands[i];
      setAtOutput(prev => [...prev, `> ${cmd.command.replace('\x1A', '<Ctrl+Z>')}`]);
      await new Promise(resolve => setTimeout(resolve, cmd.delay || 100));
      if (cmd.expectedResponse) {
        setAtOutput(prev => [...prev, `< ${cmd.expectedResponse}`]);
      }
    }

    setAtIsRunning(false);
    setAtCurrentIndex(-1);
  };

  const stopAtSimulation = () => {
    setAtIsRunning(false);
  };

  const handleDownloadBinary = (pdu: string, index: number) => {
    const filename = `sms_part_${index + 1}.bin`;
    downloadBinaryFile(pdu, filename);
  };

  const handleDownloadAllBinary = () => {
    if (!result?.pdus) return;
    const allHex = result.pdus.map(p => p.pdu).join('');
    downloadBinaryFile(allHex, 'sms_all_parts.bin');
  };

  const handleDownloadAtCommands = () => {
    const content = atCommands.map(cmd => {
      const displayCmd = cmd.command.replace('\x1A', '<Ctrl+Z>');
      return `${displayCmd}\n${cmd.expectedResponse || ''}`;
    }).join('\n\n');
    downloadTextFile(content, 'at_commands.txt');
  };

  const handleCopy = async (pdu: string, index: number) => {
    await navigator.clipboard.writeText(pdu);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = async () => {
    if (!result?.pdus) return;
    const allPdus = result.pdus.map(p => p.pdu).join('\n');
    await navigator.clipboard.writeText(allPdus);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const autoDetectEncoding = () => {
    if (canUse7Bit(messageText)) {
      setEncoding('7bit');
    } else {
      setEncoding('ucs2');
    }
  };

  const maxLenSingle = getMaxMessageLength(encoding, false);
  const maxLenMulti = getMaxMessageLength(encoding, true);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 transition-all duration-300 hover:shadow-xl">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">PDU 编码器</h2>
          <p className="text-sm text-gray-500">文本 → PDU 格式（支持长短信自动拆分）</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            SMSC 号码（可选）
          </label>
          <input
            type="text"
            value={smscNumber}
            onChange={(e) => setSmscNumber(e.target.value)}
            placeholder="+8613800138000"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            目标号码 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={destinationNumber}
            onChange={(e) => setDestinationNumber(e.target.value)}
            placeholder="+8613800138000"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            消息内容 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="输入短信内容，支持中文..."
            rows={6}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none text-sm"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">
              {messageText.length} 字符 | 单条最大: {maxLenSingle}{encoding === '7bit' ? '字符' : '字符'} | 多条最大: {maxLenMulti}{encoding === '7bit' ? '字符/条' : '字符/条'}
            </span>
            <button
              onClick={autoDetectEncoding}
              className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
            >
              自动检测编码
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            编码方式
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setEncoding('7bit')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                encoding === '7bit'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              7-bit (ASCII)
            </button>
            <button
              onClick={() => setEncoding('ucs2')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                encoding === 'ucs2'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              UCS2 (Unicode)
            </button>
          </div>
        </div>

        <button
          onClick={handleEncode}
          className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
        >
          编码 → 生成 PDU
        </button>

        {result && result.success && result.pdus.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  生成的 PDU
                </span>
                {result.totalParts > 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    <Layers className="w-3 h-3" />
                    共 {result.totalParts} 条
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {result.totalParts > 1 && (
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {copiedIndex === -1 ? (
                      <><Check className="w-3.5 h-3.5" /> 已复制全部</>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" /> 复制全部</>
                    )}
                  </button>
                )}
                <button
                  onClick={handleDownloadAllBinary}
                  className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> 导出二进制
                </button>
                <button
                  onClick={() => setShowAtCommands(!showAtCommands)}
                  className={`flex items-center gap-1 text-xs transition-colors ${
                    showAtCommands ? 'text-purple-700' : 'text-purple-600 hover:text-purple-700'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" /> AT指令模拟
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {result.pdus.map((pduResult, index) => (
                <div key={index} className="bg-white p-3 rounded border border-gray-200">
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      {result.totalParts > 1 ? `第 ${index + 1}/${result.totalParts} 条` : '单条短信'}
                      {pduResult.multiPart && (
                        <span className="ml-2 text-blue-600">
                          (UDH: TP_UDHL=0x05, Ref={pduResult.multiPart.reference})
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadBinary(pduResult.pdu, index)}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" /> 二进制
                      </button>
                      <button
                        onClick={() => handleCopy(pduResult.pdu, index)}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        {copiedIndex === index ? (
                          <><Check className="w-3.5 h-3.5" /> 已复制</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> 复制</>
                        )}
                      </button>
                    </div>
                  </div>
                  <code className="text-xs font-mono text-gray-800 break-all block">
                    {pduResult.pdu}
                  </code>
                  <div className="mt-1 text-xs text-gray-500">
                    长度: {pduResult.pduLength} 字节
                  </div>
                </div>
              ))}
            </div>

            {showAtCommands && (
              <div className="mt-4 p-4 bg-gray-900 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-medium text-gray-200">AT 指令批量发送模拟</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadAtCommands}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> 导出
                    </button>
                    <button
                      onClick={resetAtSimulation}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      disabled={atIsRunning}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> 重置
                    </button>
                    {atIsRunning ? (
                      <button
                        onClick={stopAtSimulation}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5" /> 停止
                      </button>
                    ) : (
                      <button
                        onClick={runAtSimulation}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" /> 运行
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-black rounded p-3 font-mono text-xs max-h-60 overflow-y-auto">
                  {atOutput.length === 0 ? (
                    <div className="text-gray-500">点击"运行"开始模拟AT指令发送...</div>
                  ) : (
                    atOutput.map((line, idx) => (
                      <div
                        key={idx}
                        className={`mb-1 ${
                          line.startsWith('>') ? 'text-green-400' : 'text-yellow-400'
                        }`}
                      >
                        {line}
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  <div className="text-xs text-gray-400 font-medium mb-2">AT 指令序列：</div>
                  {atCommands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded text-xs font-mono transition-colors ${
                        atCurrentIndex === idx
                          ? 'bg-green-900/50 border border-green-500'
                          : 'bg-gray-800/50'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">{idx + 1}.</span>
                        <span className="text-gray-500 text-[10px]">{cmd.description}</span>
                      </div>
                      <div className="text-green-300 mt-1 break-all">
                        {cmd.command.replace('\x1A', '<Ctrl+Z>')}
                      </div>
                      {cmd.expectedResponse && (
                        <div className="text-yellow-400 mt-1 text-[10px]">
                          期望: {cmd.expectedResponse}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && !result.success && (
          <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-600">{result.error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Encoder;

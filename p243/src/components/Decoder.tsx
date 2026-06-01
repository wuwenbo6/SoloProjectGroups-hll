import React, { useState } from 'react';
import { ArrowLeft, Copy, Check, AlertCircle } from 'lucide-react';
import { DecodeResult } from '../types/pdu';
import { decodePdu } from '../core/pduDecoder';
import { isValidHex } from '../core/utils';

interface DecoderProps {
  onDecode: (result: DecodeResult | null) => void;
}

const SAMPLE_PDUS = [
  {
    name: '英文短信 (7-bit)',
    value: '0001000B91683108308000F000000CC8329BFD06DDDF723619'
  },
  {
    name: '中文短信 (UCS2)',
    value: '0001000B91683108308000F00008124F60597DFF0C8BF7780153D10021'
  }
];

const Decoder: React.FC<DecoderProps> = ({ onDecode }) => {
  const [pduInput, setPduInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeResult | null>(null);

  const handleDecode = () => {
    setError(null);

    if (!pduInput.trim()) {
      setError('请输入 PDU 数据');
      onDecode(null);
      return;
    }

    const cleanPdu = pduInput.replace(/\s/g, '');

    if (!isValidHex(cleanPdu)) {
      setError('无效的十六进制格式，请检查输入');
      onDecode(null);
      return;
    }

    const decodeResult = decodePdu(cleanPdu);
    if (!decodeResult) {
      setError('解码失败，请检查 PDU 格式');
      onDecode(null);
      return;
    }

    setResult(decodeResult);
    onDecode(decodeResult);
  };

  const handleLoadSample = (sample: string) => {
    setPduInput(sample);
    setError(null);
  };

  const handleCopyText = async () => {
    if (result?.ud.text) {
      await navigator.clipboard.writeText(result.ud.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100 transition-all duration-300 hover:shadow-xl">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">PDU 解码器</h2>
          <p className="text-sm text-gray-500">PDU 格式 → 文本</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            PDU 数据 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={pduInput}
            onChange={(e) => setPduInput(e.target.value)}
            placeholder="输入十六进制 PDU 字符串..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 resize-none font-mono text-xs"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">
              {pduInput.replace(/\s/g, '').length / 2} 字节
            </span>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-gray-600 mb-2">示例 PDU：</span>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_PDUS.map((sample, index) => (
              <button
                key={index}
                onClick={() => handleLoadSample(sample.value)}
                className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 transition-colors"
              >
                {sample.name}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          onClick={handleDecode}
          className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
        >
          解码 → 解析内容
        </button>

        {result && (
          <div className="mt-6 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">解码结果</span>
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {copied ? (
                  <><Check className="w-3.5 h-3.5" /> 已复制</>
                ) : (
                  <><Copy className="w-3.5 h-3.5" /> 复制文本</>
                )}
              </button>
            </div>
            <div className="bg-white p-3 rounded border border-emerald-100">
              <p className="text-gray-800 whitespace-pre-wrap break-all">
                {result.ud.text || '(空消息)'}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {result.oa && (
                <div>
                  <span className="text-gray-500">发送方：</span>
                  <span className="text-gray-700 font-mono">{result.oa.number}</span>
                </div>
              )}
              {result.da && (
                <div>
                  <span className="text-gray-500">接收方：</span>
                  <span className="text-gray-700 font-mono">{result.da.number}</span>
                </div>
              )}
              {result.scts && (
                <div className="col-span-2">
                  <span className="text-gray-500">时间戳：</span>
                  <span className="text-gray-700">{result.scts}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Decoder;

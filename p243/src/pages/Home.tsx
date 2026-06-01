import { useState } from 'react';
import { Zap, Github, Info } from 'lucide-react';
import Encoder from '@/components/Encoder';
import Decoder from '@/components/Decoder';
import ResultDisplay from '@/components/ResultDisplay';
import { EncodeResult, DecodeResult } from '@/types/pdu';

export default function Home() {
  const [encodeResults, setEncodeResults] = useState<EncodeResult[] | null>(null);
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null);

  const handleEncode = (results: EncodeResult[] | null) => {
    setEncodeResults(results);
    if (results) {
      setDecodeResult(null);
    }
  };

  const handleDecode = (result: DecodeResult | null) => {
    setDecodeResult(result);
    if (result) {
      setEncodeResults(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">PDU 编解码器</h1>
                <p className="text-xs text-gray-500">SMS PDU Encoder / Decoder</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://en.wikipedia.org/wiki/Protocol_Data_Unit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="PDU 维基百科"
              >
                <Info className="w-5 h-5" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-gray-700 transition-colors"
                title="GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold mb-2">短信 PDU 格式转换工具</h2>
              <p className="text-blue-100 text-sm">
                支持中文 UCS2 编码，可将普通文本转换为 PDU 格式，或解析 PDU 数据
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="bg-white/20 rounded-lg px-4 py-2 text-center">
                <div className="font-bold text-lg">7-bit</div>
                <div className="text-blue-100 text-xs">ASCII 编码</div>
              </div>
              <div className="bg-white/20 rounded-lg px-4 py-2 text-center">
                <div className="font-bold text-lg">UCS2</div>
                <div className="text-blue-100 text-xs">Unicode 编码</div>
              </div>
            </div>
          </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Encoder onEncode={handleEncode} />
          <Decoder onDecode={handleDecode} />
        </div>

        <div className="mb-8">
          <ResultDisplay encodeResults={encodeResults} decodeResult={decodeResult} />
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">关于 PDU 格式说明</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-600">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-800 mb-2">什么是 PDU？</div>
                <p>PDU (Protocol Data Unit) 是短信在 GSM 网络中传输短信的标准格式，包含了短信内容、发送方、接收方、编码方式等信息。</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-800 mb-2">7-bit 编码</div>
                <p>GSM 标准字母表编码，每个字符占 7 位，可将 8 个字符压缩为 7 个字节，适用于英文和欧洲语言。单条最大 160 字符。</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-800 mb-2">UCS2 编码</div>
                <p>16 位 Unicode 编码，每个字符占 2 字节，支持中文、日文等多语言字符。单条最大 70 字符。</p>
              </div>
              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                <div className="font-medium text-indigo-800 mb-2">长短信拆分 (UDH)</div>
                <p>超过单条长度限制时，自动拆分为多条。每条添加 UDH (TP_UDHL=0x05)，包含拼接信息：参考号、总数、序号。</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                <div className="font-medium text-purple-800 mb-2">AT 指令模拟</div>
                <p>生成标准 GSM 模块 AT 指令序列，包括 AT+CMGF=0 (PDU模式)、AT+CMGS (发送短信)，可直接用于硬件模块调试。</p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="font-medium text-green-800 mb-2">二进制导出</div>
                <p>将 PDU 十六进制字符串转换为原始二进制文件 (.bin) 下载，可用于烧录、调试或进一步分析。</p>
              </div>
            </div>
          </div>
      </main>

      <footer className="mt-8 py-6 border-t border-gray-200 bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
          <p>PDU 编解码器 - 支持中文 UCS2 编码的短信格式转换工具</p>
        </div>
      </footer>
    </div>
  );
}

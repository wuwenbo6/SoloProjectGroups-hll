import { useState, useCallback } from 'react';
import { Video, Github, RefreshCw, Play, Zap, Download } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { StatsCards } from './components/StatsCards';
import { FrameTypeChart } from './components/FrameTypeChart';
import { GOPTimeline } from './components/GOPTimeline';
import { NALTable } from './components/NALTable';
import { CUAnalysis } from './components/CUAnalysis';
import { ParseResult } from './types';
import {
  parseFile,
  generateMockData,
  downloadCSV,
  isLargeFile,
  formatBytes,
  ParseProgressCallback,
} from './utils/h265Parser';

interface ParseProgress {
  progress: number;
  processed: number;
  total: number;
}

function App() {
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsParsing(true);
    setError(null);
    setResult(null);
    setIsStreaming(isLargeFile(file.size));
    setParseProgress(null);

    const onProgress: ParseProgressCallback = (progress, processed, total) => {
      setParseProgress({ progress, processed, total });
    };

    try {
      const parseResult = await parseFile(file, onProgress);
      setResult(parseResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析文件时发生错误');
    } finally {
      setIsParsing(false);
      setParseProgress(null);
      setIsStreaming(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-800/50 backdrop-blur-sm sticky top-0 z-50 bg-gray-900/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">H.265 裸流分析器</h1>
                <p className="text-xs text-gray-400">HEVC NAL Unit Analyzer</p>
              </div>
            </div>
            {result && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700/50"
              >
                <RefreshCw className="w-4 h-4" />
                重新上传
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!result ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-white mb-3">
                解析和可视化 H.265 码流
              </h2>
              <p className="text-gray-400">
                上传 .hevc 或 .265 裸流文件，自动解析 NAL 单元并展示帧类型分布和 GOP 结构
              </p>
            </div>

            <FileUpload
              onFileUpload={handleFileUpload}
              isParsing={isParsing}
              error={error}
              fileName={null}
              fileSize={null}
              parseProgress={parseProgress}
              isStreaming={isStreaming}
            />

            <div className="mt-6 text-center">
              <button
                onClick={() => setResult(generateMockData())}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg font-medium transition-all duration-300 shadow-lg hover:shadow-blue-500/25"
              >
                <Play className="w-5 h-5" />
                加载演示数据
              </button>
              <p className="text-xs text-gray-500 mt-2">
                没有 .hevc 文件？点击查看演示效果
              </p>
            </div>

            <div className="mt-8 grid grid-cols-4 gap-4 text-center">
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                <div className="text-2xl font-bold text-blue-400 mb-1">VPS/SPS/PPS</div>
                <div className="text-xs text-gray-500">参数集解析</div>
              </div>
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                <div className="text-2xl font-bold text-green-400 mb-1">IDR/P/B</div>
                <div className="text-xs text-gray-500">帧类型识别</div>
              </div>
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                <div className="text-2xl font-bold text-purple-400 mb-1">GOP</div>
                <div className="text-xs text-gray-500">结构分析</div>
              </div>
              <div className="p-4 bg-gray-800/30 rounded-xl border border-gray-700/30">
                <div className="text-2xl font-bold text-teal-400 mb-1">CU</div>
                <div className="text-xs text-gray-500">划分与预测模式</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-900/30 to-transparent rounded-xl border border-green-500/20 flex-1">
                <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                  <Video className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">{result.fileName}</h3>
                  <p className="text-sm text-gray-400">
                    成功解析 {result.stats.total.toLocaleString()} 个 NAL 单元
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <button
                  onClick={() => downloadCSV(result)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-sm font-medium transition-all duration-300 shadow-lg hover:shadow-emerald-500/25"
                >
                  <Download className="w-4 h-4" />
                  导出 CSV
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/50 hover:bg-gray-700/50 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700/50"
                >
                  <RefreshCw className="w-4 h-4" />
                  重新上传
                </button>
              </div>
            </div>

            <StatsCards result={result} />

            <div className="grid lg:grid-cols-2 gap-6">
              <FrameTypeChart result={result} />
              
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500" />
                  参数集信息
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-400">VPS</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">视频参数集</p>
                        <p className="text-gray-500 text-xs">Video Parameter Set</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-purple-400">{result.stats.vps}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-400">SPS</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">序列参数集</p>
                        <p className="text-gray-500 text-xs">Sequence Parameter Set</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-cyan-400">{result.stats.sps}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-green-400">PPS</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">图像参数集</p>
                        <p className="text-gray-500 text-xs">Picture Parameter Set</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-green-400">{result.stats.pps}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-pink-400">SEI</span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">补充增强信息</p>
                        <p className="text-gray-500 text-xs">Supplemental Enhancement Info</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-pink-400">{result.stats.sei}</span>
                  </div>
                </div>
              </div>
            </div>

            <GOPTimeline result={result} />

            <CUAnalysis result={result} />

            <NALTable result={result} />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-800/50 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <p>H.265 裸流分析器 - 纯前端解析，数据不上传服务器</p>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-gray-300 transition-colors"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

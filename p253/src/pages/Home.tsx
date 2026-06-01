import { useCallback } from "react";
import { BarChart3, Loader2, AlertCircle, RotateCcw } from "lucide-react";
import FileUploader from "@/components/FileUploader";
import BandwidthChart from "@/components/BandwidthChart";
import PIDTable from "@/components/PIDTable";
import StreamTree from "@/components/StreamTree";
import BitrateChart from "@/components/BitrateChart";
import { useAppStore } from "@/store/useAppStore";
import { analyzeFile } from "@/api/analyze";

export default function Home() {
  const {
    result,
    loading,
    error,
    uploading,
    uploadProgress,
    setResult,
    setLoading,
    setError,
    setUploading,
    setUploadProgress,
    reset,
  } = useAppStore();

  const handleFileSelect = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadProgress(0);
      setLoading(true);
      setError(null);

      try {
        const data = await analyzeFile(file, (progress) => {
          setUploadProgress(progress);
        });
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "分析失败");
      } finally {
        setUploading(false);
      }
    },
    [setResult, setLoading, setError, setUploading, setUploadProgress]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#1a1f2e] text-white">
      <header className="border-b border-[#3a3f55] bg-[#1a1f2e]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-[#00d4aa]" />
          <h1 className="text-sm font-semibold tracking-wide">MPEG-TS 码流分析器</h1>
          <span className="text-[10px] text-[#8b8fa3] bg-[#2a2f42] px-2 py-0.5 rounded-full">v1.0</span>
          {result && (
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 text-xs text-[#8b8fa3] hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              重新分析
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!result && !loading && (
          <div className="max-w-lg mx-auto mt-20 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-[#00d4aa] to-[#4ecdc4] bg-clip-text text-transparent">
                上传 MPEG-TS 文件
              </h2>
              <p className="text-[#8b8fa3] text-sm">
                解析 PAT/PMT/PES 结构，统计各 PID 带宽占比，支持 PID 负载提取和码率分析
              </p>
            </div>
            <FileUploader onFileSelect={handleFileSelect} disabled={uploading} />
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-[#ff6b6b]/10 border border-[#ff6b6b]/20">
                <AlertCircle className="w-4 h-4 text-[#ff6b6b] shrink-0" />
                <span className="text-[#ff6b6b] text-sm">{error}</span>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="max-w-lg mx-auto mt-20 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-[#00d4aa] animate-spin" />
              <span className="text-[#c8cad0] text-sm">
                {uploading ? `上传中... ${uploadProgress}%` : "解析码流中..."}
              </span>
            </div>
            <div className="w-full h-1.5 bg-[#2a2f42] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#00d4aa] to-[#4ecdc4] rounded-full transition-all duration-300"
                style={{ width: `${uploading ? uploadProgress : 100}%` }}
              />
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-6">
            <div className="flex items-center gap-6 text-xs text-[#8b8fa3]">
              <span>
                文件: <span className="text-white font-mono">{result.fileName}</span>
              </span>
              <span>
                大小: <span className="text-white font-mono">{formatSize(result.fileSize)}</span>
              </span>
              <span>
                总包数: <span className="text-white font-mono">{result.totalPackets.toLocaleString()}</span>
              </span>
              <span>
                PID 数: <span className="text-white font-mono">{result.pids.length}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <BandwidthChart pids={result.pids} totalBytes={result.totalBytes} />
              </div>
              <div className="lg:col-span-2">
                <StreamTree pat={result.pat} pmts={result.pmts} />
              </div>
            </div>

            <BitrateChart fileId={result.fileId} fileName={result.fileName} pids={result.pids} />

            <PIDTable
              pids={result.pids}
              pmts={result.pmts}
              fileId={result.fileId}
              fileName={result.fileName}
            />
          </div>
        )}
      </main>
    </div>
  );
}

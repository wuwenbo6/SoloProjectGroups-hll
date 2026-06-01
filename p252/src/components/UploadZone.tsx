import { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFileSelect: (file: File) => void;
  onSampleLoad: () => void;
  loading: boolean;
  error: string | null;
}

export default function UploadZone({ onFileSelect, onSampleLoad, loading, error }: Props) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#070f1d] px-4">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">
            EAPoL 报文分析器
          </h1>
          <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            上传 pcap/pcapng 文件，解析 EAPoL-over-LAN 报文，可视化 EAP 认证交互流程与 TLS 隧道建立过程
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-2xl border-2 border-dashed transition-all duration-300",
            dragOver
              ? "border-cyan-400 bg-cyan-400/5 scale-[1.02]"
              : "border-slate-700 hover:border-slate-500 bg-[#0d1b2a]",
            loading && "pointer-events-none opacity-60"
          )}
        >
          <input
            type="file"
            accept=".pcap,.pcapng,.cap"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={loading}
          />
          <div className="flex flex-col items-center justify-center py-16 px-8 space-y-4">
            {loading ? (
              <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            ) : (
              <div
                className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
                  dragOver ? "bg-cyan-400/10" : "bg-slate-800"
                )}
              >
                <Upload
                  className={cn(
                    "w-6 h-6 transition-colors",
                    dragOver ? "text-cyan-400" : "text-slate-500"
                  )}
                />
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">
                {loading ? "正在解析报文..." : "拖拽文件到此处或点击上传"}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                支持 .pcap / .pcapng 格式
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        )}

        <div className="text-center">
          <span className="text-xs text-slate-600">或者</span>
        </div>

        <button
          onClick={onSampleLoad}
          disabled={loading}
          className={cn(
            "w-full flex items-center justify-center gap-3 py-4 rounded-xl border transition-all duration-200",
            loading
              ? "border-slate-700/50 bg-slate-800/20 cursor-not-allowed"
              : "border-slate-700 bg-[#111d2e] hover:border-cyan-400/40 hover:bg-cyan-400/5 group"
          )}
        >
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
              loading ? "bg-slate-800" : "bg-slate-800 group-hover:bg-cyan-400/10"
            )}
          >
            <FileText
              className={cn(
                "w-4 h-4 transition-colors",
                loading ? "text-slate-600" : "text-slate-500 group-hover:text-cyan-400"
              )}
            />
          </div>
          <div className="text-left">
            <p
              className={cn(
                "text-sm font-medium transition-colors",
                loading ? "text-slate-600" : "text-slate-300 group-hover:text-cyan-300"
              )}
            >
              加载示例数据
            </p>
            <p className="text-[10px] text-slate-600">
              EAP-TLS 认证流程 · 14 帧
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

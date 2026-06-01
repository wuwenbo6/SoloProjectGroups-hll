import { Activity, RotateCcw } from "lucide-react";
import { useDicomStore } from "@/store/useDicomStore";
import FileUpload from "@/components/FileUpload";
import ImageCompare from "@/components/ImageCompare";
import HistogramChart from "@/components/HistogramChart";
import ParameterPanel from "@/components/ParameterPanel";
import DicomMeta from "@/components/DicomMeta";

export default function Home() {
  const { result, reset } = useDicomStore();

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="border-b border-border/50 bg-bg-primary/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-fg-primary tracking-tight">DICOM 智能调窗</h1>
              <p className="text-[11px] text-fg-muted">基于最大熵算法的窗宽窗位优化</p>
            </div>
          </div>

          {result && (
            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-fg-secondary bg-bg-tertiary hover:bg-bg-quaternary border border-border transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新上传
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!result ? (
          <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
            <div className="w-full max-w-xl">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gradient mb-3">医学影像智能调窗</h2>
                <p className="text-fg-secondary text-sm max-w-md mx-auto leading-relaxed">
                  上传 DICOM 文件，自动基于最大熵算法计算最佳窗宽窗位，即刻对比调窗效果
                </p>
              </div>
              <FileUpload />
              <div className="mt-8 grid grid-cols-3 gap-4 text-center">
                <div className="glass rounded-xl p-4">
                  <p className="text-2xl font-mono font-semibold text-accent mb-1">Max</p>
                  <p className="text-xs text-fg-muted">最大熵算法</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-2xl font-mono font-semibold text-accent mb-1">CT/MR</p>
                  <p className="text-xs text-fg-muted">多模态支持</p>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-2xl font-mono font-semibold text-accent mb-1">vs</p>
                  <p className="text-xs text-fg-muted">前后对比</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            <ImageCompare />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <HistogramChart />
              </div>
              <div>
                <ParameterPanel />
              </div>
            </div>

            <DicomMeta />
          </div>
        )}
      </main>

      <footer className="border-t border-border/30 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-[11px] text-fg-muted">
            DICOM Window Optimizer · Maximum Entropy Algorithm · Python + pydicom + React
          </p>
        </div>
      </footer>
    </div>
  );
}

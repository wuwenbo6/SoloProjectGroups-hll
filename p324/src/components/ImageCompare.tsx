import { useDicomStore } from "@/store/useDicomStore";
import { Eye, EyeOff } from "lucide-react";

export default function ImageCompare() {
  const { result, customImage, showOptimized, setShowOptimized } = useDicomStore();

  if (!result) return null;

  const originalSrc = result.original_image;
  const optimizedSrc = customImage || result.optimized_image;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="relative group">
        <div className="glass rounded-2xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-bg-primary/90 to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-fg-muted" />
              <span className="text-xs font-medium text-fg-secondary tracking-wide uppercase">原始窗</span>
            </div>
            <span className="text-xs font-mono text-fg-muted">
              WL {result.default_window.center} / WW {result.default_window.width}
            </span>
          </div>
          <div className="p-2 pt-10">
            <div className="relative rounded-xl overflow-hidden bg-black scanline">
              <img
                src={originalSrc}
                alt="原始窗图像"
                className="w-full h-auto max-h-[480px] object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="relative group">
        <div className="glass-accent rounded-2xl overflow-hidden glow-accent">
          <div className="absolute top-0 left-0 right-0 z-10 px-4 py-3 flex items-center justify-between bg-gradient-to-b from-bg-primary/90 to-transparent">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-accent tracking-wide uppercase">优化窗</span>
            </div>
            <span className="text-xs font-mono text-accent/70">
              WL {result.optimized_window.center} / WW {result.optimized_window.width}
            </span>
          </div>
          <div className="p-2 pt-10">
            <div className="relative rounded-xl overflow-hidden bg-black scanline">
              <img
                src={optimizedSrc}
                alt="优化窗图像"
                className={`w-full h-auto max-h-[480px] object-contain transition-opacity duration-300 ${showOptimized ? "opacity-100" : "opacity-30"}`}
              />
              <button
                onClick={() => setShowOptimized(!showOptimized)}
                className="absolute bottom-3 right-3 p-2 rounded-lg glass hover:bg-bg-tertiary transition-colors"
                title={showOptimized ? "隐藏优化图像" : "显示优化图像"}
              >
                {showOptimized ? (
                  <Eye className="w-4 h-4 text-accent" />
                ) : (
                  <EyeOff className="w-4 h-4 text-fg-muted" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

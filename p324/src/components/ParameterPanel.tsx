import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal, RotateCcw, Sparkles, Download, Edit3, CheckCircle2 } from "lucide-react";
import { useDicomStore } from "@/store/useDicomStore";

export default function ParameterPanel() {
  const { result, customWindow, adjustWindow } = useDicomStore();
  const [localCenter, setLocalCenter] = useState(0);
  const [localWidth, setLocalWidth] = useState(0);
  const [isModified, setIsModified] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (result && customWindow) {
      setLocalCenter(customWindow.center);
      setLocalWidth(customWindow.width);
      const isOpt = Math.abs(customWindow.center - result.optimized_window.center) < 0.1 &&
                    Math.abs(customWindow.width - result.optimized_window.width) < 0.1;
      setIsModified(!isOpt);
    }
  }, [result, customWindow]);

  const debouncedAdjust = useCallback(
    (center: number, width: number) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        adjustWindow(center, width);
      }, 200);
    },
    [adjustWindow]
  );

  const onCenterChange = useCallback(
    (val: number) => {
      setLocalCenter(val);
      setIsModified(true);
      debouncedAdjust(val, localWidth);
    },
    [localWidth, debouncedAdjust]
  );

  const onWidthChange = useCallback(
    (val: number) => {
      setLocalWidth(val);
      setIsModified(true);
      debouncedAdjust(localCenter, val);
    },
    [localCenter, debouncedAdjust]
  );

  const resetToOptimized = useCallback(() => {
    if (!result) return;
    const { center, width } = result.optimized_window;
    setLocalCenter(center);
    setLocalWidth(width);
    setIsModified(false);
    adjustWindow(center, width);
  }, [result, adjustWindow]);

  const resetToDefault = useCallback(() => {
    if (!result) return;
    const { center, width } = result.default_window;
    setLocalCenter(center);
    setLocalWidth(width);
    setIsModified(true);
    adjustWindow(center, width);
  }, [result, adjustWindow]);

  const exportParams = useCallback(() => {
    if (!result) return;
    const data = {
      metadata: {
        patient_name: result.metadata.patient_name,
        patient_id: result.metadata.patient_id,
        modality: result.metadata.modality,
        study_date: result.metadata.study_date,
        image_size: `${result.metadata.columns} x ${result.metadata.rows}`,
      },
      window_settings: {
        default: result.default_window,
        optimized: result.optimized_window,
        current: {
          center: parseFloat(localCenter.toFixed(2)),
          width: parseFloat(localWidth.toFixed(2)),
          is_modified: isModified,
        },
      },
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const pid = result.metadata.patient_id || "unknown";
    a.download = `dicom_window_${pid}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, localCenter, localWidth, isModified]);

  if (!result) return null;

  const minVal = Math.min(result.default_window.center - result.default_window.width, -1000);
  const maxVal = result.default_window.center + result.default_window.width;
  const rangeSpan = maxVal - minVal;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-medium text-fg-secondary">窗宽窗位参数</h3>
          {isModified ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
              <Edit3 className="w-3 h-3" />
              已手动调整
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/15 text-accent border border-accent/30">
              <CheckCircle2 className="w-3 h-3" />
              最优值
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportParams}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-fg-primary bg-bg-quaternary hover:bg-fg-muted/20 border border-border transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3 h-3" />
            导出
          </button>
          <button
            onClick={resetToDefault}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-fg-muted bg-bg-tertiary hover:bg-bg-quaternary border border-border transition-colors"
          >
            默认值
          </button>
          <button
            onClick={resetToOptimized}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 border border-accent/20 transition-colors flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            最优值
          </button>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-fg-muted uppercase tracking-wider">窗位 (WL)</label>
            <span className="text-sm font-mono font-medium text-fg-primary">{localCenter.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={minVal}
            max={maxVal}
            step={rangeSpan / 1000}
            value={localCenter}
            onChange={(e) => onCenterChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between mt-1 text-[10px] font-mono text-fg-muted">
            <span>{minVal.toFixed(0)}</span>
            <span>{maxVal.toFixed(0)}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-fg-muted uppercase tracking-wider">窗宽 (WW)</label>
            <span className="text-sm font-mono font-medium text-fg-primary">{localWidth.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={rangeSpan * 2}
            step={rangeSpan / 500}
            value={localWidth}
            onChange={(e) => onWidthChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between mt-1 text-[10px] font-mono text-fg-muted">
            <span>1</span>
            <span>{(rangeSpan * 2).toFixed(0)}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-bg-tertiary/50 p-3 border border-border">
          <p className="text-[10px] text-fg-muted uppercase tracking-wider mb-1">默认窗</p>
          <p className="text-xs font-mono text-fg-secondary">
            WL <span className="text-fg-primary">{result.default_window.center.toFixed(1)}</span>
            {" / "}
            WW <span className="text-fg-primary">{result.default_window.width.toFixed(1)}</span>
          </p>
        </div>
        <div className="rounded-xl bg-accent/5 p-3 border border-accent/20">
          <p className="text-[10px] text-accent/70 uppercase tracking-wider mb-1">最优窗</p>
          <p className="text-xs font-mono text-accent/80">
            WL <span className="text-accent">{result.optimized_window.center.toFixed(1)}</span>
            {" / "}
            WW <span className="text-accent">{result.optimized_window.width.toFixed(1)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

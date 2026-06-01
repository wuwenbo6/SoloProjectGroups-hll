import { useState } from "react";
import { Play, Square, ChevronDown, Loader2 } from "lucide-react";
import { useCaptureStore } from "@/hooks/useCaptureStore";

export default function CaptureControls() {
  const status = useCaptureStore((s) => s.status);
  const interfaces = useCaptureStore((s) => s.interfaces);
  const startCapture = useCaptureStore((s) => s.startCapture);
  const stopCapture = useCaptureStore((s) => s.stopCapture);
  const loadInterfaces = useCaptureStore((s) => s.loadInterfaces);
  const loading = useCaptureStore((s) => s.loading);
  const error = useCaptureStore((s) => s.error);

  const [selectedIface, setSelectedIface] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const running = status?.running ?? false;

  const handleOpenDropdown = () => {
    if (!dropdownOpen) {
      loadInterfaces();
    }
    setDropdownOpen(!dropdownOpen);
  };

  const handleStart = async () => {
    if (!selectedIface) return;
    await startCapture(selectedIface);
  };

  const handleStop = async () => {
    await stopCapture();
  };

  return (
    <div className="card-glow rounded-xl bg-atalk-surface/80 backdrop-blur-sm p-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-shrink-0">
          <button
            onClick={handleOpenDropdown}
            className="flex items-center gap-2 px-3 py-2 bg-atalk-bg border border-atalk-border rounded-lg text-sm font-mono text-atalk-text hover:border-atalk-accent/40 transition-colors min-w-[180px] justify-between"
          >
            <span className="truncate">
              {selectedIface || "选择接口..."}
            </span>
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full mt-1 left-0 z-50 w-64 max-h-48 overflow-y-auto bg-atalk-bg border border-atalk-border rounded-lg shadow-xl terminal-scroll">
              {interfaces.length === 0 ? (
                <div className="px-3 py-2 text-atalk-muted text-sm">
                  无可用接口
                </div>
              ) : (
                interfaces.map((iface) => (
                  <button
                    key={iface}
                    onClick={() => {
                      setSelectedIface(iface);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm font-mono hover:bg-atalk-accent/10 transition-colors ${
                      iface === selectedIface
                        ? "text-atalk-accent bg-atalk-accent/5"
                        : "text-atalk-text"
                    }`}
                  >
                    {iface}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {running ? (
          <button
            onClick={handleStop}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-b from-red-600 to-red-700 text-white shadow-lg shadow-red-900/30 hover:from-red-500 hover:to-red-600 transition-all disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            停止捕获
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={loading || !selectedIface}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-b from-atalk-accent to-atalk-accentDim text-white shadow-lg shadow-cyan-900/30 hover:from-cyan-400 hover:to-atalk-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            开始捕获
          </button>
        )}

        {running && (
          <div className="flex items-center gap-2 ml-2">
            <span className="w-2 h-2 rounded-full bg-atalk-good animate-pulse-glow" />
            <span className="text-xs text-atalk-muted font-mono">
              监听中 · {status?.interface}
            </span>
          </div>
        )}

        {error && (
          <span className="text-xs text-atalk-danger font-mono ml-auto">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

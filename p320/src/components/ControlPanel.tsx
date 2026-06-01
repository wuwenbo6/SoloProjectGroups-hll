import {
  Shield,
  Play,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Unlock,
  Download,
  Lock,
} from "lucide-react";
import { useZRTPStore } from "@/store/zrtpStore";
import type { AlgorithmType } from "@/types/zrtp";

const algorithms: { value: AlgorithmType; label: string }[] = [
  { value: "DH2048", label: "DH-2048" },
  { value: "ECDH_P256", label: "ECDH-P256" },
];

export default function ControlPanel() {
  const {
    status,
    algorithm,
    simulate_mitm,
    result,
    setAlgorithm,
    setSimulateMitm,
    startNegotiation,
    reset,
    setShowGoClearModal,
    setShowExportModal,
  } = useZRTPStore();

  const canGoClear =
    result?.is_encrypted &&
    status === "success" &&
    !result.pending_goclear;

  const canExport = result && status === "success";

  return (
    <div className="cyber-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <Shield className="w-5 h-5 text-cyber-accent" />
        <h2 className="font-display text-lg font-semibold text-white">
          ZRTP 协商控制台
        </h2>
        <div className="ml-auto flex items-center gap-4">
          {result && (
            <div className="flex items-center gap-2">
              {result.is_encrypted ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyber-accent/10 border border-cyber-accent/30 rounded-full">
                  <Lock className="w-3 h-3 text-cyber-accent" />
                  <span className="text-[10px] font-mono text-cyber-accent">
                    SRTP 加密中
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/30 rounded-full">
                  <Unlock className="w-3 h-3 text-yellow-500" />
                  <span className="text-[10px] font-mono text-yellow-500">
                    明文模式
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-cyber-muted font-mono">STATUS</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === "idle"
                  ? "bg-cyber-muted"
                  : status === "negotiating"
                  ? "bg-yellow-400 animate-pulse"
                  : status === "success"
                  ? "bg-cyber-accent"
                  : "bg-red-500"
              }`}
            />
            <span className="text-xs font-mono text-cyber-muted uppercase">
              {status === "idle"
                ? "就绪"
                : status === "negotiating"
                ? "协商中"
                : status === "success"
                ? "完成"
                : "错误"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-cyber-muted font-mono uppercase tracking-wider">
            DH 算法
          </label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as AlgorithmType)}
            disabled={status === "negotiating"}
            className="cyber-input min-w-[160px] appearance-none cursor-pointer"
          >
            {algorithms.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-cyber-muted font-mono uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            安全测试
          </label>
          <label className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={simulate_mitm}
              onChange={(e) => setSimulateMitm(e.target.checked)}
              disabled={status === "negotiating"}
              className="w-4 h-4 rounded border-cyber-border bg-cyber-bg text-red-500
                         focus:ring-red-500/30 focus:ring-1 cursor-pointer
                         disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span
              className={`text-sm font-mono ${
                simulate_mitm ? "text-red-400" : "text-cyber-muted"
              } group-hover:text-white transition-colors`}
            >
              模拟中间人攻击
            </span>
          </label>
        </div>

        <button
          onClick={startNegotiation}
          disabled={status === "negotiating"}
          className={`flex items-center gap-2 px-5 py-2.5 font-display font-semibold text-sm rounded-lg
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all ${
                       simulate_mitm
                         ? "bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                         : "bg-cyber-accent/10 border border-cyber-accent/40 text-cyber-accent hover:bg-cyber-accent/20 hover:border-cyber-accent/60 hover:shadow-[0_0_20px_rgba(0,255,200,0.15)]"
                     }`}
        >
          {status === "negotiating" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {simulate_mitm ? "发起攻击测试" : "开始协商"}
        </button>

        <button
          onClick={() => setShowGoClearModal(true)}
          disabled={!canGoClear}
          className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500/10 border border-yellow-500/40
                     text-yellow-500 font-display text-sm rounded-lg
                     hover:bg-yellow-500/20 hover:border-yellow-500/60
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Unlock className="w-4 h-4" />
          GoClear
        </button>

        <button
          onClick={() => setShowExportModal(true)}
          disabled={!canExport}
          className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-cyber-border
                     text-cyber-muted font-display text-sm rounded-lg
                     hover:border-cyber-accent/50 hover:text-cyber-accent
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Download className="w-4 h-4" />
          导出日志
        </button>

        <button
          onClick={reset}
          disabled={status === "negotiating"}
          className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-cyber-border
                     text-cyber-muted font-display text-sm rounded-lg
                     hover:border-cyber-muted hover:text-white
                     disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          重置
        </button>
      </div>
    </div>
  );
}

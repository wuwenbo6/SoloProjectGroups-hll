import { Activity, Zap, Wifi, WifiOff, Clock } from "lucide-react";
import { useStore } from "@/stores/appStore";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")}`;
}

export default function ReflectorStatusBar() {
  const reflectorStatus = useStore((s) => s.reflectorStatus);
  const wsConnected = useStore((s) => s.wsConnected);
  const isRunning = reflectorStatus?.status === "running";

  return (
    <div className="sticky top-0 z-30 backdrop-blur-xl bg-cyber-bg/80 border-b border-cyber-border px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isRunning ? "bg-green-500" : "bg-red-500"
                }`}
              />
            </span>
            <span
              className={`text-xs font-dm font-semibold ${
                isRunning ? "text-green-400" : "text-red-400"
              }`}
            >
              {isRunning ? "Running" : "Stopped"}
            </span>
          </div>

          {reflectorStatus && (
            <>
              <div className="flex items-center gap-2 text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span className="text-xs font-mono text-cyber-primary tabular-nums">
                  {formatUptime(reflectorStatus.uptime)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-gray-400">
                <Zap className="w-3.5 h-3.5 text-cyber-warning" />
                <span className="text-xs font-mono text-white animate-count-up tabular-nums">
                  {reflectorStatus.packetsForwarded.toLocaleString()}
                </span>
                <span className="text-[10px] text-gray-500">pkts</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-gray-500" />
                {reflectorStatus.activeInterfaces.map((iface) => (
                  <span
                    key={iface}
                    className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-cyber-primary/10 text-cyber-primary border border-cyber-primary/20"
                  >
                    {iface}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="w-4 h-4 text-green-500" />
          ) : (
            <WifiOff className="w-4 h-4 text-red-500" />
          )}
          <span className="text-[11px] font-mono text-gray-500">
            {wsConnected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </div>
  );
}

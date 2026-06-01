import { useTrapStore } from "@/store/trapStore"
import { Wifi, WifiOff, Radio, Clock, CopyX } from "lucide-react"

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function StatusBar() {
  const wsConnected = useTrapStore((s) => s.wsConnected)
  const status = useTrapStore((s) => s.status)

  return (
    <div className="flex h-12 items-center justify-between border-b border-[#1a2332] bg-[#0d1320] px-6">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="h-4 w-4 text-[#00e5a0]" />
          ) : (
            <WifiOff className="h-4 w-4 text-[#ff4d6a]" />
          )}
          <span className="text-xs font-medium text-[#6b7f99]">
            {wsConnected ? "WebSocket 已连接" : "WebSocket 断开"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-[#00e5a0]" />
          <span className="text-xs font-medium text-[#6b7f99]">
            监听端口: {status?.listen_port ?? 162}
          </span>
          <span
            className={
              status?.listening
                ? "ml-1 h-2 w-2 rounded-full bg-[#00e5a0] shadow-[0_0_6px_rgba(0,229,160,0.6)]"
                : "ml-1 h-2 w-2 rounded-full bg-[#ff4d6a]"
            }
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b7f99]">Trap 计数</span>
          <span className="rounded-md bg-[#162030] px-2 py-0.5 font-mono text-xs font-bold text-[#00e5a0]">
            {status?.trap_count ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CopyX className="h-4 w-4 text-[#ffb447]" />
          <span className="text-xs text-[#6b7f99]">重复过滤</span>
          <span className="rounded-md bg-[#162030] px-2 py-0.5 font-mono text-xs font-bold text-[#ffb447]">
            {status?.duplicate_count ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-[#4a5e78]" />
          <span className="font-mono text-xs text-[#4a5e78]">
            {status?.uptime ? formatUptime(status.uptime) : "00:00:00"}
          </span>
        </div>
      </div>
    </div>
  )
}

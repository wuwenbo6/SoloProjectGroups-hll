import { useSimulatorStore } from "@/store";
import { Wifi, WifiOff, Router } from "lucide-react";

export default function Header() {
  const connected = useSimulatorStore((s) => s.connected);
  const selectedRouter = useSimulatorStore((s) => s.selectedRouter);
  const selectedTarget = useSimulatorStore((s) => s.selectedTarget);
  const routers = useSimulatorStore((s) => s.routers);

  return (
    <header className="h-12 flex items-center justify-between px-5 border-b border-[#2A3040]" style={{ background: "#0A0E14" }}>
      <div className="flex items-center gap-3">
        <Router size={18} className="text-[#00FF88]" />
        <h1 className="text-sm font-semibold tracking-wide">
          OSPFv3 <span className="text-[#8899AA] font-normal">Simulator</span>
        </h1>
        <span className="text-[10px] font-mono text-[#556677] px-1.5 py-0.5 rounded" style={{ background: "#1A1F2E" }}>
          RFC 5340
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono">
        {selectedRouter && (
          <span className="text-[#00FF88]">
            Src: {routers.find((r) => r.id === selectedRouter)?.name || selectedRouter}
          </span>
        )}
        {selectedTarget && (
          <span className="text-[#FFB020]">
            Dst: {routers.find((r) => r.id === selectedTarget)?.name || selectedTarget}
          </span>
        )}

        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <Wifi size={12} className="text-[#00FF88]" />
              <span className="text-[#00FF88]">Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-[#FF4757]" />
              <span className="text-[#FF4757]">Disconnected</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

import { useEffect } from "react";
import { useSimulatorStore } from "@/store";
import Header from "@/components/Header";
import TopologyCanvas from "@/components/TopologyCanvas";
import StateMachinePanel from "@/components/StateMachinePanel";
import PacketLog from "@/components/PacketLog";
import EventControls from "@/components/EventControls";
import RouterDetailPanel from "@/components/RouterDetailPanel";

export default function Home() {
  const initWebSocket = useSimulatorStore((s) => s.initWebSocket);
  const routerDetail = useSimulatorStore((s) => s.routerDetail);
  const connected = useSimulatorStore((s) => s.connected);
  const routers = useSimulatorStore((s) => s.routers);

  useEffect(() => {
    initWebSocket();
  }, [initWebSocket]);

  const hasTopology = routers.length > 0;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#0F1419" }}>
      <Header />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 relative">
              <TopologyCanvas />
              {!connected && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E14]/80 z-10">
                  <div className="text-center space-y-3">
                    <div className="w-3 h-3 rounded-full bg-[#FFB020] animate-pulse-dot mx-auto" />
                    <p className="text-sm text-[#8899AA]">Connecting to backend...</p>
                    <p className="text-xs text-[#556677] font-mono">
                      Start Go backend: <span className="text-[#00FF88]">cd backend && go run main.go</span>
                    </p>
                  </div>
                </div>
              )}
              {connected && !hasTopology && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0A0E14]/80 z-10">
                  <div className="text-center space-y-3">
                    <div className="w-3 h-3 rounded-full bg-[#00FF88] animate-pulse-dot mx-auto" />
                    <p className="text-sm text-[#8899AA]">Waiting for topology data...</p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-80 border-l border-[#2A3040] flex flex-col" style={{ background: "#0F1419" }}>
              <StateMachinePanel />
              <div className="flex-1 mt-2">
                <EventControls />
              </div>
            </div>
          </div>

          <div className="h-56 border-t border-[#2A3040]">
            <PacketLog />
          </div>
        </div>

        {routerDetail && <RouterDetailPanel />}
      </div>
    </div>
  );
}

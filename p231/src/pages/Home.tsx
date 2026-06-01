import { usePolling } from "@/hooks/usePolling";
import StatsCards from "@/components/StatsCards";
import CaptureControls from "@/components/CaptureControls";
import NetworkList from "@/components/NetworkList";
import RipRouteTable from "@/components/RipRouteTable";
import AarpTable from "@/components/AarpTable";
import NbpTable from "@/components/NbpTable";
import PacketLog from "@/components/PacketLog";
import { Activity } from "lucide-react";

export default function Home() {
  usePolling(2000);

  return (
    <div className="min-h-screen bg-atalk-bg font-sans">
      <header className="sticky top-0 z-40 border-b border-atalk-border/50 bg-atalk-bg/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-atalk-accent/10">
                <Activity className="w-5 h-5 text-atalk-accent" />
              </div>
              <div>
                <h1 className="text-base font-bold text-atalk-text tracking-tight">
                  AppleTalk DDP Monitor
                </h1>
                <p className="text-[10px] text-atalk-muted -mt-0.5 font-mono">
                  DDP Capture · RIP Analysis · AARP Mapping · NBP Names
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <CaptureControls />
        <StatsCards />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <NetworkList />
          <RipRouteTable />
        </div>

        <NbpTable />
        <AarpTable />
        <PacketLog />
      </main>
    </div>
  );
}

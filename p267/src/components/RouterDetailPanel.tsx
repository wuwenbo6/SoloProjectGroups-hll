import { useSimulatorStore } from "@/store";
import { stateColor } from "@/types";
import { X, Server, HardDrive, Network, Globe, Route, Download } from "lucide-react";

export default function RouterDetailPanel() {
  const routerDetail = useSimulatorStore((s) => s.routerDetail);
  const setRouterDetail = useSimulatorStore((s) => s.setRouterDetail);

  if (!routerDetail) return null;

  const exportRoutingTable = () => {
    if (!routerDetail?.routingTable || routerDetail.routingTable.length === 0) {
      return;
    }

    const lines: string[] = [];
    lines.push(`! OSPFv3 Routing Table - Router ${routerDetail.routerId}`);
    lines.push(`! Generated: ${new Date().toISOString()}`);
    lines.push(`! Area: ${routerDetail.areaId}`);
    lines.push("");
    lines.push("IPv6 Routing Table - " + routerDetail.routingTable.length + " entries");
    lines.push("Codes: C - Connected, O - OSPF, IA - OSPF Inter Area, N1 - OSPF NSSA External Type 1,");
    lines.push("       N2 - OSPF NSSA External Type 2, E1 - OSPF External Type 1, E2 - OSPF External Type 2");
    lines.push("");

    for (const route of routerDetail.routingTable) {
      const code = route.nextHop === "::" ? "C" : "O";
      const prefix = `${route.prefix}/${route.prefixLen}`;
      const nextHop = route.nextHop === "::" ? "::" : route.nextHop;
      const intf = route.interface;
      lines.push(`${code}  ${prefix.padEnd(42)} [${route.metric}/0]`);
      lines.push(`     via ${nextHop}, ${intf}`);
      lines.push(`     Route type: ${route.routeType}, Adv Router: ${route.advRouter}, Age: ${route.age}s`);
      lines.push("");
    }

    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ospfv3_routing_table_${routerDetail.routerId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute top-0 right-0 w-80 h-full bg-[#0F1419] border-l border-[#2A3040] z-20 flex flex-col animate-fade-in">
      <div className="px-4 py-3 border-b border-[#2A3040] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={14} className="text-[#00FF88]" />
          <span className="text-sm font-semibold">{routerDetail.routerId}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={exportRoutingTable}
            className="text-[#8899AA] hover:text-[#00B4D8] transition-colors px-2 py-1 rounded hover:bg-[#1A1F2E] flex items-center gap-1 text-[10px] font-mono"
            title="Export Routing Table"
          >
            <Download size={12} />
            <span>Export</span>
          </button>
          <button
            onClick={() => setRouterDetail(null)}
            className="text-[#8899AA] hover:text-[#E8ECF1] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#556677] mb-2">
            Router Information
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[#8899AA]">Router ID</span>
              <span className="font-mono text-[#00FF88]">{routerDetail.routerId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8899AA]">Area ID</span>
              <span className="font-mono">{routerDetail.areaId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8899AA]">Hello Interval</span>
              <span className="font-mono">{routerDetail.helloInterval}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8899AA]">Dead Interval</span>
              <span className="font-mono">{routerDetail.deadInterval}s</span>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Network size={12} className="text-[#00B4D8]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#556677]">
              Neighbors ({routerDetail.neighbors.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {routerDetail.neighbors.map((n) => {
              const roleColor = n.isMaster ? "#00FF88" : "#FFB020";
              return (
                <div key={n.routerId}>
                  <div
                    className="flex items-center justify-between px-2.5 py-1.5 rounded"
                    style={{ background: `${stateColor(n.state)}08`, borderLeft: `3px solid ${stateColor(n.state)}` }}
                  >
                    <span className="font-mono text-xs">{n.routerId}</span>
                    <div className="flex items-center gap-1">
                      <span
                        className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: roleColor, background: `${roleColor}15`, border: `1px solid ${roleColor}30` }}
                      >
                        {n.isMaster ? "MASTER" : "SLAVE"}
                      </span>
                      <span
                        className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: stateColor(n.state), background: `${stateColor(n.state)}15` }}
                      >
                        {n.state}
                      </span>
                    </div>
                  </div>
                  {n.state !== "Down" && (
                    <div className="flex justify-between px-2.5 py-1 text-[10px] font-mono text-[#8899AA]">
                      <span>DD Seq:</span>
                      <span style={{ color: "#00B4D8" }}>0x{n.ddSequenceNumber.toString(16).toUpperCase().padStart(8, "0")}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <HardDrive size={12} className="text-[#FFB020]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#556677]">
              LSDB ({routerDetail.lsdb.length})
            </span>
          </div>
          <div className="space-y-1">
            {routerDetail.lsdb.map((lsa, i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono text-[#8899AA]" style={{ background: "#1A1F2E" }}>
                <span>{lsa.type}</span>
                <span>seq=0x{lsa.sequence.toString(16).toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Globe size={12} className="text-[#3B82F6]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#556677]">
              IPv6 Prefixes ({routerDetail.ipv6Prefixes?.length || 0})
            </span>
          </div>
          <div className="space-y-1.5">
            {(routerDetail.ipv6Prefixes || []).map((p, i) => (
              <div key={i} className="px-2.5 py-1.5 rounded text-[10px]" style={{ background: "#1A1F2E", borderLeft: "3px solid #3B82F6" }}>
                <div className="font-mono text-[#E8ECF1] truncate">{p.prefix}/{p.prefixLen}</div>
                <div className="flex justify-between mt-0.5 text-[9px] font-mono text-[#8899AA]">
                  <span>Metric: {p.metric}</span>
                  <span className="text-[#A855F7]">{p.routeType}</span>
                </div>
                <div className="text-[9px] font-mono text-[#556677] mt-0.5">
                  Adv: {p.advRouter}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Route size={12} className="text-[#00FF88]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#556677]">
              Routing Table ({routerDetail.routingTable?.length || 0})
            </span>
          </div>
          <div className="space-y-1.5">
            {(routerDetail.routingTable || []).map((r, i) => (
              <div key={i} className="px-2.5 py-1.5 rounded text-[10px]" style={{ background: "#1A1F2E", borderLeft: "3px solid #00FF88" }}>
                <div className="font-mono text-[#E8ECF1] truncate">{r.prefix}/{r.prefixLen}</div>
                <div className="flex justify-between mt-0.5 text-[9px] font-mono">
                  <span className="text-[#8899AA]">Nexthop: <span className="text-[#00B4D8]">{r.nextHop}</span></span>
                  <span className="text-[#FFB020]">Metric: {r.metric}</span>
                </div>
                <div className="flex justify-between mt-0.5 text-[9px] font-mono text-[#556677]">
                  <span>Intf: {r.interface}</span>
                  <span className="text-[#A855F7]">{r.routeType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#556677] mb-2">
            Interfaces
          </div>
          <div className="space-y-1.5">
            {routerDetail.interfaces.map((iface) => (
              <div key={iface.name} className="flex items-center justify-between px-2.5 py-1.5 rounded text-xs" style={{ background: "#1A1F2E" }}>
                <span className="font-mono text-[#8899AA]">{iface.name}</span>
                <span className="font-mono text-[#00FF88]">{iface.state}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

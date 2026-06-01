import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Database, HardDrive, Eye, Plus, Shield, Download } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { StoragePool, StorageVolume, MaskingView } from "@/types";
import CreateLUNDialog from "@/components/CreateLUNDialog";
import CreateMaskingViewDialog from "@/components/CreateMaskingViewDialog";

type TabType = "pools" | "volumes" | "maskingViews";

const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: "pools", label: "Storage Pools", icon: Database },
  { key: "volumes", label: "Volumes", icon: HardDrive },
  { key: "maskingViews", label: "Masking Views", icon: Eye },
];

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-[var(--border)]/50" />
        </td>
      ))}
    </tr>
  );
}

export default function DevicesPage() {
  const navigate = useNavigate();
  const { connected, pools, volumes, maskingViews, loading, fetchAll, exportXML } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>("pools");
  const [search, setSearch] = useState("");
  const [showCreateLUN, setShowCreateLUN] = useState(false);
  const [showCreateMV, setShowCreateMV] = useState(false);

  useEffect(() => {
    if (!connected) {
      navigate("/");
    }
  }, [connected, navigate]);

  useEffect(() => {
    if (connected) {
      fetchAll();
    }
  }, [connected, fetchAll]);

  const filteredPools = pools.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.system_name.toLowerCase().includes(search.toLowerCase()) ||
      p.pool_type.toLowerCase().includes(search.toLowerCase())
  );

  const filteredVolumes = volumes.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.system_name.toLowerCase().includes(search.toLowerCase()) ||
      v.volume_type.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMaskingViews = maskingViews.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.volume_name.toLowerCase().includes(search.toLowerCase()) ||
      m.system_name.toLowerCase().includes(search.toLowerCase())
  );

  const healthColor = (state: string) => {
    const s = state.toLowerCase();
    if (s === "ok" || s === "healthy" || s === "online") return "text-green-400";
    if (s === "degraded" || s === "warning") return "text-yellow-400";
    return "text-red-400";
  };

  const healthDot = (state: string) => {
    const s = state.toLowerCase();
    if (s === "ok" || s === "healthy" || s === "online")
      return "bg-green-400 shadow-[0_0_6px_#22c55e]";
    if (s === "degraded" || s === "warning")
      return "bg-yellow-400 shadow-[0_0_6px_#eab308]";
    return "bg-red-400 shadow-[0_0_6px_#ef4444]";
  };

  const renderPoolsTable = () => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Type</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Total (GB)</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Used (GB)</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Free (GB)</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Health</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">System</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
        ) : filteredPools.length === 0 ? (
          <tr><td colSpan={7} className="px-4 py-8 text-center font-outfit text-sm text-[var(--text-secondary)]">No storage pools found</td></tr>
        ) : (
          filteredPools.map((pool: StoragePool) => (
            <tr key={pool.id} className="group border-b border-[var(--border)]/50 transition-all hover:bg-[var(--accent)]/5 hover:shadow-[inset_0_0_20px_var(--accent-glow)]">
              <td className="px-4 py-3 font-mono text-sm text-[var(--text-primary)]">{pool.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{pool.pool_type}</td>
              <td className="px-4 py-3 font-mono text-sm text-[var(--text-primary)]">{pool.total_size_gb}</td>
              <td className="px-4 py-3 font-mono text-sm text-[var(--accent)]">{pool.used_size_gb}</td>
              <td className="px-4 py-3 font-mono text-sm text-green-400">{pool.free_size_gb}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${healthDot(pool.health_state)}`} />
                  <span className={`font-mono text-xs ${healthColor(pool.health_state)}`}>{pool.health_state}</span>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{pool.system_name}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  const renderVolumesTable = () => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Type</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Size (GB)</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Health</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Pool ID</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">System</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
        ) : filteredVolumes.length === 0 ? (
          <tr><td colSpan={6} className="px-4 py-8 text-center font-outfit text-sm text-[var(--text-secondary)]">No volumes found</td></tr>
        ) : (
          filteredVolumes.map((vol: StorageVolume) => (
            <tr key={vol.id} className="group border-b border-[var(--border)]/50 transition-all hover:bg-[var(--accent)]/5 hover:shadow-[inset_0_0_20px_var(--accent-glow)]">
              <td className="px-4 py-3 font-mono text-sm text-[var(--text-primary)]">{vol.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{vol.volume_type}</td>
              <td className="px-4 py-3 font-mono text-sm text-[var(--accent)]">{vol.size_gb}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${healthDot(vol.health_state)}`} />
                  <span className={`font-mono text-xs ${healthColor(vol.health_state)}`}>{vol.health_state}</span>
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{vol.pool_id}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{vol.system_name}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  const renderMaskingViewsTable = () => (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[var(--border)]">
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Name</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Volume</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Initiators</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Ports</th>
          <th className="px-4 py-3 text-left font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">System</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
        ) : filteredMaskingViews.length === 0 ? (
          <tr><td colSpan={5} className="px-4 py-8 text-center font-outfit text-sm text-[var(--text-secondary)]">No masking views found</td></tr>
        ) : (
          filteredMaskingViews.map((mv: MaskingView) => (
            <tr key={mv.id} className="group border-b border-[var(--border)]/50 transition-all hover:bg-[var(--accent)]/5 hover:shadow-[inset_0_0_20px_var(--accent-glow)]">
              <td className="px-4 py-3 font-mono text-sm text-[var(--text-primary)]">{mv.name}</td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--accent)]">{mv.volume_name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {mv.initiator_ids.slice(0, 3).map((id) => (
                    <span key={id} className="rounded bg-yellow-500/10 px-1.5 py-0.5 font-mono text-[10px] text-yellow-400">
                      {id.slice(-8)}
                    </span>
                  ))}
                  {mv.initiator_ids.length > 3 && (
                    <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                      +{mv.initiator_ids.length - 3}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {mv.port_ids.slice(0, 3).map((id) => (
                    <span key={id} className="rounded bg-pink-500/10 px-1.5 py-0.5 font-mono text-[10px] text-pink-400">
                      {id.slice(-8)}
                    </span>
                  ))}
                  {mv.port_ids.length > 3 && (
                    <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                      +{mv.port_ids.length - 3}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{mv.system_name}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/topology")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Topology
          </button>
          <h2 className="font-outfit text-sm font-semibold text-[var(--text-primary)]">
            Device Details
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search devices..."
              className="w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2 pl-9 pr-4 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            />
          </div>
          <button
            onClick={() => setShowCreateLUN(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 font-outfit text-xs text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 hover:shadow-[0_0_12px_var(--accent-glow)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create LUN
          </button>
          <button
            onClick={() => setShowCreateMV(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#ff6b35]/40 bg-[#ff6b35]/10 px-3 py-2 font-outfit text-xs text-[#ff6b35] transition-all hover:bg-[#ff6b35]/20 hover:shadow-[0_0_12px_#ff6b3560]"
          >
            <Shield className="h-3.5 w-3.5" />
            Create View
          </button>
          <button
            onClick={exportXML}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export XML
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-outfit text-xs font-medium transition-all ${
              activeTab === tab.key
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                activeTab === tab.key
                  ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                  : "bg-[var(--bg-primary)] text-[var(--text-secondary)]"
              }`}
            >
              {tab.key === "pools"
                ? pools.length
                : tab.key === "volumes"
                ? volumes.length
                : maskingViews.length}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="min-w-[800px]">
          {activeTab === "pools" && renderPoolsTable()}
          {activeTab === "volumes" && renderVolumesTable()}
          {activeTab === "maskingViews" && renderMaskingViewsTable()}
        </div>
      </div>

      {showCreateLUN && (
        <CreateLUNDialog pools={pools} onClose={() => setShowCreateLUN(false)} />
      )}
      {showCreateMV && (
        <CreateMaskingViewDialog volumes={volumes} onClose={() => setShowCreateMV(false)} />
      )}
    </div>
  );
}

import { X, Server, Database, HardDrive, Eye, Cpu, Radio } from "lucide-react";
import type { TopologyNode } from "@/types";

const typeIcons: Record<string, React.ElementType> = {
  system: Server,
  pool: Database,
  volume: HardDrive,
  masking_view: Eye,
  initiator: Cpu,
  port: Radio,
};

const typeColors: Record<string, string> = {
  system: "#00d4ff",
  pool: "#22c55e",
  volume: "#a855f7",
  masking_view: "#ff6b35",
  initiator: "#eab308",
  port: "#ec4899",
};

interface NodeDetailProps {
  node: TopologyNode | null;
  onClose: () => void;
}

export default function NodeDetail({ node, onClose }: NodeDetailProps) {
  if (!node) return null;

  const Icon = typeIcons[node.type] || Server;
  const color = typeColors[node.type] || "#00d4ff";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 h-full w-96 border-l border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl shadow-black/50 animate-slide-in-right flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}20`, boxShadow: `0 0 16px ${color}40` }}
            >
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <h3 className="font-outfit text-sm font-semibold text-[var(--text-primary)]">
                {node.label}
              </h3>
              <span
                className="font-mono text-xs uppercase"
                style={{ color }}
              >
                {node.type.replace("_", " ")}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-[var(--border)] px-6 py-3">
          <div
            className={`h-2 w-2 rounded-full ${
              node.status === "OK" || node.status === "online"
                ? "bg-green-400 shadow-[0_0_6px_#22c55e]"
                : node.status === "Degraded" || node.status === "warning"
                ? "bg-yellow-400 shadow-[0_0_6px_#eab308]"
                : "bg-red-400 shadow-[0_0_6px_#ef4444]"
            }`}
          />
          <span className="font-mono text-xs text-[var(--text-secondary)]">
            {node.status}
          </span>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <h4 className="mb-4 font-outfit text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Properties
          </h4>
          <div className="space-y-3">
            {Object.entries(node.properties).map(([key, value]) => (
              <div
                key={key}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                  {key.replace(/_/g, " ")}
                </span>
                <p className="mt-1 font-mono text-sm text-[var(--text-primary)]">
                  {String(value)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--border)] px-6 py-4">
          <p className="font-mono text-[10px] text-[var(--text-secondary)]">
            ID: {node.id}
          </p>
        </div>
      </div>
    </>
  );
}

import { useState } from "react";
import { Shield, X, Plus, Trash2 } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { StorageVolume } from "@/types";

interface Props {
  volumes: StorageVolume[];
  onClose: () => void;
}

export default function CreateMaskingViewDialog({ volumes, onClose }: Props) {
  const { createMaskingView } = useAppStore();
  const [volumeId, setVolumeId] = useState(volumes.length > 0 ? volumes[0].id : "");
  const [viewName, setViewName] = useState("");
  const [initiatorWwns, setInitiatorWwns] = useState<string[]>([""]);
  const [portWwns, setPortWwns] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedVolume = volumes.find((v) => v.id === volumeId);

  const addInitiator = () => setInitiatorWwns([...initiatorWwns, ""]);
  const removeInitiator = (idx: number) => setInitiatorWwns(initiatorWwns.filter((_, i) => i !== idx));
  const updateInitiator = (idx: number, val: string) => {
    const next = [...initiatorWwns];
    next[idx] = val;
    setInitiatorWwns(next);
  };

  const addPort = () => setPortWwns([...portWwns, ""]);
  const removePort = (idx: number) => setPortWwns(portWwns.filter((_, i) => i !== idx));
  const updatePort = (idx: number, val: string) => {
    const next = [...portWwns];
    next[idx] = val;
    setPortWwns(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!volumeId || !viewName) return;
    setSubmitting(true);
    const filteredInits = initiatorWwns.filter((w) => w.trim());
    const filteredPorts = portWwns.filter((w) => w.trim());
    const res = await createMaskingView({
      volume_id: volumeId,
      view_name: viewName,
      initiator_wwns: filteredInits,
      port_wwns: filteredPorts,
    });
    setResult({ success: res.success, message: res.message });
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#ff6b35]/10">
              <Shield className="h-4 w-4 text-[#ff6b35]" />
            </div>
            <h3 className="font-outfit text-base font-semibold text-[var(--text-primary)]">
              Create Masking View (Simulated)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--border)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
          <p className="font-mono text-[11px] text-yellow-400">
            ⚠ Simulation mode — no actual masking view will be created on the storage array
          </p>
        </div>

        {result && (
          <div
            className={`mb-4 rounded-lg border px-3 py-2 ${
              result.success
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <p className={`font-mono text-[11px] ${result.success ? "text-green-400" : "text-red-400"}`}>
              {result.message}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-outfit text-xs font-medium text-[var(--text-secondary)]">
              Target Volume
            </label>
            <select
              value={volumeId}
              onChange={(e) => setVolumeId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            >
              {volumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.size_gb} GB) {v.id.startsWith("SIMULATED") ? "[Simulated]" : ""}
                </option>
              ))}
            </select>
            {selectedVolume && (
              <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]">
                Size: {selectedVolume.size_gb} GB | Health: {selectedVolume.health_state}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block font-outfit text-xs font-medium text-[var(--text-secondary)]">
              View Name
            </label>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="e.g. MV_HostA_DB"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="font-outfit text-xs font-medium text-[var(--text-secondary)]">
                Initiator WWNs
              </label>
              <button
                type="button"
                onClick={addInitiator}
                className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {initiatorWwns.map((wwn, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={wwn}
                    onChange={(e) => updateInitiator(idx, e.target.value)}
                    placeholder="e.g. 50:01:43:80:00:00:00:01"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
                  />
                  {initiatorWwns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInitiator(idx)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:border-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="font-outfit text-xs font-medium text-[var(--text-secondary)]">
                Target Port WWNs
              </label>
              <button
                type="button"
                onClick={addPort}
                className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
              >
                <Plus className="h-3 w-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {portWwns.map((wwn, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={wwn}
                    onChange={(e) => updatePort(idx, e.target.value)}
                    placeholder="e.g. 50:01:43:80:20:00:00:01"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
                  />
                  {portWwns.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePort(idx)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:border-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-outfit text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !volumeId || !viewName}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#ff6b35] px-4 py-2.5 font-outfit text-sm font-semibold text-white transition-all hover:shadow-[0_0_20px_#ff6b3560] disabled:opacity-50"
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              Create View
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

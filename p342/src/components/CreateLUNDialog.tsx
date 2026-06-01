import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { StoragePool } from "@/types";

interface Props {
  pools: StoragePool[];
  onClose: () => void;
}

export default function CreateLUNDialog({ pools, onClose }: Props) {
  const { createLUN } = useAppStore();
  const [poolId, setPoolId] = useState(pools.length > 0 ? pools[0].id : "");
  const [name, setName] = useState("");
  const [sizeGb, setSizeGb] = useState(10);
  const [purpose, setPurpose] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedPool = pools.find((p) => p.id === poolId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolId || !name || sizeGb <= 0) return;
    setSubmitting(true);
    const res = await createLUN({ pool_id: poolId, name, size_gb: sizeGb, purpose });
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)]/10">
              <Plus className="h-4 w-4 text-[var(--accent)]" />
            </div>
            <h3 className="font-outfit text-base font-semibold text-[var(--text-primary)]">
              Create LUN (Simulated)
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
            ⚠ Simulation mode — no actual LUN will be created on the storage array
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
              Target Pool
            </label>
            <select
              value={poolId}
              onChange={(e) => setPoolId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            >
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.free_size_gb} GB free)
                </option>
              ))}
            </select>
            {selectedPool && (
              <p className="mt-1 font-mono text-[10px] text-[var(--text-secondary)]">
                Free: {selectedPool.free_size_gb} GB / Total: {selectedPool.total_size_gb} GB
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block font-outfit text-xs font-medium text-[var(--text-secondary)]">
              LUN Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. DB_Data_Vol01"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-outfit text-xs font-medium text-[var(--text-secondary)]">
              Size (GB)
            </label>
            <input
              type="number"
              min={1}
              value={sizeGb}
              onChange={(e) => setSizeGb(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-outfit text-xs font-medium text-[var(--text-secondary)]">
              Purpose (optional)
            </label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Database storage"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
            />
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
              disabled={submitting || !poolId || !name || sizeGb <= 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 font-outfit text-sm font-semibold text-[var(--bg-primary)] transition-all hover:shadow-[0_0_20px_var(--accent-glow)] disabled:opacity-50"
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg-primary)] border-t-transparent" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create LUN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Server, Link, Shield, ArrowRight } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import type { ConnectRequest } from "@/types";

export default function ConnectPage() {
  const navigate = useNavigate();
  const { connected, providerInfo, connecting, error, connect } = useAppStore();
  const [form, setForm] = useState<ConnectRequest>({
    host: "",
    port: 5988,
    username: "",
    password: "",
    namespace: "root/SMI-S",
    ssl_verify: false,
  });

  useEffect(() => {
    if (connected) {
      const timer = setTimeout(() => navigate("/topology"), 1500);
      return () => clearTimeout(timer);
    }
  }, [connected, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connect(form);
  };

  const updateField = (field: keyof ConnectRequest, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-primary)] p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 shadow-[0_0_30px_var(--accent-glow)]">
            <Server className="h-8 w-8 text-[var(--accent)]" />
          </div>
          <h1 className="font-outfit text-2xl font-bold text-[var(--text-primary)]">
            SMI-S Storage Viewer
          </h1>
          <p className="mt-2 font-outfit text-sm text-[var(--text-secondary)]">
            Connect to your SMI-S provider
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-2xl shadow-black/30">
          <div className="mb-5 flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                connected
                  ? "bg-green-400 shadow-[0_0_8px_#22c55e]"
                  : "bg-red-400 shadow-[0_0_8px_#ef4444]"
              }`}
            />
            <span className="font-mono text-xs text-[var(--text-secondary)]">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>

          {connected && providerInfo && (
            <div className="mb-5 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <p className="font-outfit text-sm font-medium text-green-400">
                Connected to {providerInfo.vendor} {providerInfo.product}
              </p>
              <p className="font-mono text-xs text-[var(--text-secondary)]">
                Version {providerInfo.version}
              </p>
              <div className="mt-2 flex items-center gap-1 text-[var(--accent)]">
                <ArrowRight className="h-3 w-3" />
                <span className="font-mono text-xs">Redirecting to topology...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 flex items-center gap-2 font-outfit text-xs font-medium text-[var(--text-secondary)]">
                <Link className="h-3.5 w-3.5" />
                Host
              </label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => updateField("host", e.target.value)}
                placeholder="192.168.1.100"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 font-outfit text-xs font-medium text-[var(--text-secondary)]">
                <Server className="h-3.5 w-3.5" />
                Port
              </label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => updateField("port", parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 font-outfit text-xs font-medium text-[var(--text-secondary)]">
                <Shield className="h-3.5 w-3.5" />
                Username
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => updateField("username", e.target.value)}
                placeholder="admin"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 font-outfit text-xs font-medium text-[var(--text-secondary)]">
                <Shield className="h-3.5 w-3.5" />
                Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-2 font-outfit text-xs font-medium text-[var(--text-secondary)]">
                Namespace (optional)
              </label>
              <input
                type="text"
                value={form.namespace || ""}
                onChange={(e) => updateField("namespace", e.target.value)}
                placeholder="root/SMI-S"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_12px_var(--accent-glow)]"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5">
              <span className="font-outfit text-sm text-[var(--text-secondary)]">SSL Verify</span>
              <button
                type="button"
                onClick={() => updateField("ssl_verify", !form.ssl_verify)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  form.ssl_verify ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                    form.ssl_verify ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <button
              type="submit"
              disabled={connecting || !form.host || !form.username}
              className="group flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-3 font-outfit text-sm font-semibold text-[var(--bg-primary)] transition-all hover:shadow-[0_0_20px_var(--accent-glow)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bg-primary)] border-t-transparent" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] text-[var(--text-secondary)]/50">
          SMI-S Storage Topology Viewer v1.0
        </p>
      </div>
    </div>
  );
}

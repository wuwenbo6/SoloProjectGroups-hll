import ControlPanel from "@/components/ControlPanel";
import SequenceDiagram from "@/components/SequenceDiagram";
import PartyPanel from "@/components/PartyPanel";
import SASDisplay from "@/components/SASDisplay";
import GoClearModal from "@/components/GoClearModal";
import ExportModal from "@/components/ExportModal";
import { useZRTPStore } from "@/store/zrtpStore";

const defaultParty = {
  name: "",
  zid: "",
  dh_public_key: "",
  dh_shared_secret: "",
  s0: "",
  srtp_master_key: "",
  srtp_master_salt: "",
  sas: "",
  sas_verified: false,
  media_connection_established: false,
  is_encrypted: false,
};

export default function Home() {
  const { result, visibleMessages, status } = useZRTPStore();

  return (
    <div className="min-h-screen">
      <div className="scanline fixed inset-0 z-50" />

      <header className="border-b border-cyber-border/50 py-6 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white tracking-tight">
              ZRTP <span className="glow-text">协商模拟器</span>
            </h1>
            <p className="text-xs text-cyber-muted font-mono mt-1">
              RFC 6189 — Media Path Key Agreement for Unicast Secure RTP
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono text-cyber-muted">
            <span className="px-2 py-0.5 bg-cyber-surface border border-cyber-border rounded">
              DH-2048
            </span>
            <span className="px-2 py-0.5 bg-cyber-surface border border-cyber-border rounded">
              ECDH-P256
            </span>
            <span className="px-2 py-0.5 bg-cyber-surface border border-cyber-border rounded">
              HMAC-SHA256 KDF
            </span>
            <span className="px-2 py-0.5 bg-cyber-surface border border-cyber-border rounded">
              SAS 4-digit
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <ControlPanel />

        {status === "error" && (
          <div className="cyber-card p-4 border-red-500/40 bg-red-500/5">
            <p className="text-sm text-red-400 font-mono">
              错误：{useZRTPStore.getState().errorMessage}
            </p>
          </div>
        )}

        <SASDisplay
          sas={result?.alice?.sas || ""}
          bobSas={result?.bob?.sas || ""}
          match={result?.sas_match ?? false}
          mediaEstablished={result?.media_connection_established ?? false}
          visible={!!result && result.sas_match !== undefined}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6">
          <PartyPanel
            party={result?.alice || { ...defaultParty, name: "Alice" }}
            colorClass="text-cyber-blue"
            borderColor="border-l-cyber-blue"
          />

          <div className="lg:w-72 xl:w-80">
            <SequenceDiagram messages={visibleMessages} />
          </div>

          <PartyPanel
            party={result?.bob || { ...defaultParty, name: "Bob" }}
            colorClass="text-cyber-orange"
            borderColor="border-l-cyber-orange"
          />
        </div>
      </main>

      <footer className="border-t border-cyber-border/30 py-4 px-6 mt-8">
        <p className="text-center text-[10px] text-cyber-muted/50 font-mono">
          ZRTP Protocol Simulator — Educational Use Only — Based on RFC 6189
        </p>
      </footer>

      <GoClearModal />
      <ExportModal />
    </div>
  );
}

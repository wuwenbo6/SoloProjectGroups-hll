import { useEffect, useState } from "react"
import { useStore, aliasDisplay } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { Activity, Users, PhoneCall, Gauge, Send, UserPlus, Phone, Radar } from "lucide-react"

const typeColors: Record<string, string> = {
  GRQ: "text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30",
  GCF: "text-cyber-green bg-cyber-green/10 border-cyber-green/30",
  GRJ: "text-cyber-red bg-cyber-red/10 border-cyber-red/30",
  RRQ: "text-cyber-yellow bg-cyber-yellow/10 border-cyber-yellow/30",
  RCF: "text-cyber-green bg-cyber-green/10 border-cyber-green/30",
  RRJ: "text-cyber-red bg-cyber-red/10 border-cyber-red/30",
  ARQ: "text-cyber-orange bg-cyber-orange/10 border-cyber-orange/30",
  ACF: "text-cyber-green bg-cyber-green/10 border-cyber-green/30",
  ARJ: "text-cyber-red bg-cyber-red/10 border-cyber-red/30",
  IRQ: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  IRR: "text-purple-300 bg-purple-300/10 border-purple-300/30",
  IRR_TIMEOUT: "text-cyber-red bg-cyber-red/10 border-cyber-red/30",
  URQ: "text-cyber-orange bg-cyber-orange/10 border-cyber-orange/30",
  UCF: "text-dark-500 bg-dark-600 border-dark-500",
  BRQ: "text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
  BCF: "text-cyber-green bg-cyber-green/10 border-cyber-green/30",
  BRJ: "text-cyber-red bg-cyber-red/10 border-cyber-red/30",
}

export default function Console() {
  const { gatekeeper, rasMessages, terminals, fetchGatekeeper, fetchRasMessages, fetchTerminals, sendGRQ, registerTerminal, requestAdmission, sendIRQ, sendIRR, connectWebSocket } = useStore()
  const [showRegister, setShowRegister] = useState(false)
  const [showAdmission, setShowAdmission] = useState(false)
  const [showIRQ, setShowIRQ] = useState(false)
  const [regForm, setRegForm] = useState({ h323_id: "", e164: "", signaling_address: "", signaling_port: 1720, ras_address: "", time_to_live: 60 })
  const [admForm, setAdmForm] = useState({ caller_alias: "", callee_alias: "", bandwidth: 128, call_type: "point_to_point" })
  const [irqTarget, setIrqTarget] = useState("")

  useEffect(() => {
    connectWebSocket()
    fetchGatekeeper()
    fetchRasMessages()
    fetchTerminals()
  }, [])

  const onlineTerminals = terminals.filter((t) => t.status === "online")
  const bandwidthPercent = gatekeeper ? Math.round((gatekeeper.used_bandwidth / gatekeeper.total_bandwidth) * 100) : 0

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-500 uppercase tracking-wider">Gatekeeper</span>
            {gatekeeper?.status === "running" ? (
              <span className="animate-pulse-glow flex h-2.5 w-2.5 rounded-full bg-cyber-green" />
            ) : (
              <span className="flex h-2.5 w-2.5 rounded-full bg-cyber-red" />
            )}
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{gatekeeper?.status === "running" ? "Running" : "Stopped"}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-dark-500">
            <Activity className="h-3 w-3" />
            <span>{gatekeeper?.name ?? "—"}</span>
          </div>
        </div>

        <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
          <span className="text-xs text-dark-500 uppercase tracking-wider">Terminals</span>
          <p className="mt-2 text-2xl font-bold text-cyber-cyan">{gatekeeper?.registered_count ?? 0}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-dark-500">
            <Users className="h-3 w-3" />
            <span>Registered</span>
          </div>
        </div>

        <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
          <span className="text-xs text-dark-500 uppercase tracking-wider">Active Calls</span>
          <p className="mt-2 text-2xl font-bold text-cyber-green">{gatekeeper?.active_calls ?? 0}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-dark-500">
            <PhoneCall className="h-3 w-3" />
            <span>In progress</span>
          </div>
        </div>

        <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-dark-500 uppercase tracking-wider">Bandwidth</span>
            <Gauge className="h-3.5 w-3.5 text-dark-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{gatekeeper?.used_bandwidth ?? 0}<span className="text-sm text-dark-500">/{gatekeeper?.total_bandwidth ?? 0}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-dark-700">
            <div
              className={cn("h-full rounded-full transition-all", bandwidthPercent > 80 ? "bg-cyber-red" : bandwidthPercent > 50 ? "bg-cyber-orange" : "bg-cyber-green")}
              style={{ width: `${bandwidthPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-dark-700 bg-dark-800">
        <div className="flex items-center justify-between border-b border-dark-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">RAS Message Log</h2>
          <span className="font-mono text-xs text-dark-500">{rasMessages.length} messages</span>
        </div>
        <div className="h-80 overflow-auto font-mono text-xs">
          {rasMessages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-dark-500">No RAS messages yet</div>
          ) : (
            rasMessages.map((msg) => (
              <div key={msg.id} className="animate-fade-in-up flex items-center gap-3 border-b border-dark-700/50 px-4 py-2 hover:bg-dark-700/30">
                <span className="text-dark-500">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", typeColors[msg.type] ?? "text-dark-500 bg-dark-700 border-dark-600")}>
                  {msg.type}
                </span>
                <span className={cn(msg.direction === "inbound" ? "text-cyber-cyan" : "text-cyber-orange")}>
                  {msg.direction === "inbound" ? "←" : "→"}
                </span>
                <span className="text-slate-300">
                  {msg.source} → {msg.destination}
                </span>
                <span className="truncate text-dark-500">{JSON.stringify(msg.payload).slice(0, 80)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
        <h2 className="mb-4 text-sm font-semibold text-white">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => sendGRQ()}
            className="flex items-center justify-center gap-2 rounded-lg border border-cyber-cyan/30 bg-cyber-cyan/5 px-4 py-3 text-sm font-medium text-cyber-cyan transition-all hover:bg-cyber-cyan/10 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          >
            <Send className="h-4 w-4" />
            Send GRQ
          </button>

          <div>
            <button
              onClick={() => { setShowRegister(!showRegister); setShowAdmission(false); setShowIRQ(false) }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyber-yellow/30 bg-cyber-yellow/5 px-4 py-3 text-sm font-medium text-cyber-yellow transition-all hover:bg-cyber-yellow/10"
            >
              <UserPlus className="h-4 w-4" />
              Register Terminal
            </button>
            {showRegister && (
              <div className="animate-fade-in-up mt-3 space-y-2 rounded-lg border border-dark-700 bg-dark-900 p-3">
                <input placeholder="H.323 ID (e.g. user@domain)" value={regForm.h323_id} onChange={(e) => setRegForm({ ...regForm, h323_id: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                <input placeholder="E.164 Number (e.g. 1001)" value={regForm.e164} onChange={(e) => setRegForm({ ...regForm, e164: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                <input placeholder="Signaling Address" value={regForm.signaling_address} onChange={(e) => setRegForm({ ...regForm, signaling_address: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                <div className="flex gap-2">
                  <input type="number" placeholder="Port" value={regForm.signaling_port} onChange={(e) => setRegForm({ ...regForm, signaling_port: Number(e.target.value) })} className="w-1/2 rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                  <input type="number" placeholder="TTL" value={regForm.time_to_live} onChange={(e) => setRegForm({ ...regForm, time_to_live: Number(e.target.value) })} className="w-1/2 rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                </div>
                <input placeholder="RAS Address" value={regForm.ras_address} onChange={(e) => setRegForm({ ...regForm, ras_address: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                <button onClick={() => { registerTerminal(regForm); setShowRegister(false); setRegForm({ h323_id: "", e164: "", signaling_address: "", signaling_port: 1720, ras_address: "", time_to_live: 60 }) }} className="w-full rounded bg-cyber-yellow/20 py-1.5 text-xs font-medium text-cyber-yellow hover:bg-cyber-yellow/30">
                  Submit RRQ
                </button>
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => { setShowAdmission(!showAdmission); setShowRegister(false); setShowIRQ(false) }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyber-green/30 bg-cyber-green/5 px-4 py-3 text-sm font-medium text-cyber-green transition-all hover:bg-cyber-green/10"
            >
              <Phone className="h-4 w-4" />
              Request Admission
            </button>
            {showAdmission && (
              <div className="animate-fade-in-up mt-3 space-y-2 rounded-lg border border-dark-700 bg-dark-900 p-3">
                <select value={admForm.caller_alias} onChange={(e) => setAdmForm({ ...admForm, caller_alias: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white outline-none focus:border-cyber-cyan/50">
                  <option value="">Select Caller (by alias)</option>
                  {onlineTerminals.map((t) => <option key={t.id} value={aliasDisplay(t.aliases)}>{aliasDisplay(t.aliases)}</option>)}
                </select>
                <select value={admForm.callee_alias} onChange={(e) => setAdmForm({ ...admForm, callee_alias: e.target.value })} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white outline-none focus:border-cyber-cyan/50">
                  <option value="">Select Callee (by alias)</option>
                  {onlineTerminals.map((t) => <option key={t.id} value={aliasDisplay(t.aliases)}>{aliasDisplay(t.aliases)}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="number" placeholder="Bandwidth" value={admForm.bandwidth} onChange={(e) => setAdmForm({ ...admForm, bandwidth: Number(e.target.value) })} className="w-1/2 rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50" />
                  <select value={admForm.call_type} onChange={(e) => setAdmForm({ ...admForm, call_type: e.target.value })} className="w-1/2 rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white outline-none focus:border-cyber-cyan/50">
                    <option value="point_to_point">Point-to-Point</option>
                    <option value="multipoint">Multipoint</option>
                  </select>
                </div>
                <button onClick={() => { requestAdmission(admForm); setShowAdmission(false); setAdmForm({ caller_alias: "", callee_alias: "", bandwidth: 128, call_type: "point_to_point" }) }} className="w-full rounded bg-cyber-green/20 py-1.5 text-xs font-medium text-cyber-green hover:bg-cyber-green/30">
                  Submit ARQ
                </button>
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => { setShowIRQ(!showIRQ); setShowRegister(false); setShowAdmission(false) }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple-400/30 bg-purple-400/5 px-4 py-3 text-sm font-medium text-purple-400 transition-all hover:bg-purple-400/10"
            >
              <Radar className="h-4 w-4" />
              Send IRQ Probe
            </button>
            {showIRQ && (
              <div className="animate-fade-in-up mt-3 space-y-2 rounded-lg border border-dark-700 bg-dark-900 p-3">
                <select value={irqTarget} onChange={(e) => setIrqTarget(e.target.value)} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-400/50">
                  <option value="">Select Terminal</option>
                  {onlineTerminals.map((t) => <option key={t.id} value={t.id}>{aliasDisplay(t.aliases)}</option>)}
                </select>
                <button onClick={() => { if (irqTarget) { sendIRQ(irqTarget); setIrqTarget("") } }} className="w-full rounded bg-purple-400/20 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-400/30">
                  Send IRQ
                </button>
                <button onClick={() => { if (irqTarget) { sendIRR(irqTarget); setIrqTarget("") } }} className="w-full rounded bg-purple-300/20 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-300/30">
                  Reply IRR (Simulate)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

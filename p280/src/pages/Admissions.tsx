import { useEffect, useState } from "react"
import { useStore, aliasDisplay } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { PhoneCall, X, ArrowRight, Radar, Settings, Gauge } from "lucide-react"

export default function Admissions() {
  const { gatekeeper, admissions, terminals, fetchGatekeeper, fetchAdmissions, fetchTerminals, requestAdmission, updateBandwidth, updateIRQConfig, sendIRQ, sendIRR, changeAdmissionBandwidth } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [showIRQConfig, setShowIRQConfig] = useState(false)
  const [bwInput, setBwInput] = useState("")
  const [irqInterval, setIrqInterval] = useState(30)
  const [irqTimeout, setIrqTimeout] = useState(10)
  const [irqTarget, setIrqTarget] = useState("")
  const [brqOpenId, setBrqOpenId] = useState<string | null>(null)
  const [brqBwInput, setBrqBwInput] = useState("")
  const [form, setForm] = useState({
    caller_alias: "",
    callee_alias: "",
    bandwidth: 128,
    call_type: "point_to_point",
  })

  useEffect(() => {
    fetchGatekeeper()
    fetchAdmissions()
    fetchTerminals()
  }, [])

  useEffect(() => {
    if (gatekeeper) {
      setIrqInterval(gatekeeper.irq_interval)
      setIrqTimeout(gatekeeper.irq_timeout)
    }
  }, [gatekeeper?.irq_interval, gatekeeper?.irq_timeout])

  const onlineTerminals = terminals.filter((t) => t.status === "online")
  const totalBw = gatekeeper?.total_bandwidth ?? 0
  const usedBw = gatekeeper?.used_bandwidth ?? 0
  const bwPercent = totalBw > 0 ? Math.round((usedBw / totalBw) * 100) : 0

  const circumference = 2 * Math.PI * 54
  const strokeDashoffset = circumference - (bwPercent / 100) * circumference

  const handleSubmit = async () => {
    await requestAdmission(form)
    setShowModal(false)
    setForm({ caller_alias: "", callee_alias: "", bandwidth: 128, call_type: "point_to_point" })
  }

  const handleBandwidthUpdate = async () => {
    const val = Number(bwInput)
    if (val > 0) {
      await updateBandwidth(val)
      setBwInput("")
    }
  }

  const handleIRQConfigUpdate = async () => {
    await updateIRQConfig(irqInterval, irqTimeout)
    setShowIRQConfig(false)
  }

  const statusStyles: Record<string, string> = {
    confirmed: "bg-cyber-green/10 text-cyber-green border-cyber-green/30",
    pending: "bg-cyber-yellow/10 text-cyber-yellow border-cyber-yellow/30",
    rejected: "bg-cyber-red/10 text-cyber-red border-cyber-red/30",
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Call Admission Control</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowIRQConfig(!showIRQConfig)}
            className="flex items-center gap-2 rounded-lg bg-purple-400/10 px-4 py-2 text-sm font-medium text-purple-400 transition-all hover:bg-purple-400/20"
          >
            <Settings className="h-4 w-4" />
            IRQ Config
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-cyber-cyan/10 px-4 py-2 text-sm font-medium text-cyber-cyan transition-all hover:bg-cyber-cyan/20 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          >
            <PhoneCall className="h-4 w-4" />
            New Call Request
          </button>
        </div>
      </div>

      <div className="mb-6 flex items-start gap-6">
        <div className="flex items-center gap-8 rounded-xl border border-dark-700 bg-dark-800 p-6 flex-1">
          <div className="relative flex shrink-0 items-center justify-center">
            <svg width="140" height="140" className="-rotate-90">
              <circle cx="70" cy="70" r="54" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle
                cx="70"
                cy="70"
                r="54"
                fill="none"
                stroke={bwPercent > 80 ? "#ff3d71" : bwPercent > 50 ? "#ff9100" : "#00ff88"}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-bold text-white">{bwPercent}%</span>
              <span className="text-[10px] text-dark-500">Bandwidth</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex gap-8 text-sm">
              <div>
                <span className="text-dark-500">Used: </span>
                <span className="font-mono text-white">{usedBw}</span>
              </div>
              <div>
                <span className="text-dark-500">Total: </span>
                <span className="font-mono text-white">{totalBw}</span>
              </div>
              <div>
                <span className="text-dark-500">Available: </span>
                <span className="font-mono text-cyber-green">{totalBw - usedBw}</span>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <input
                type="number"
                placeholder="New total bandwidth"
                value={bwInput}
                onChange={(e) => setBwInput(e.target.value)}
                className="w-48 rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50"
              />
              <button
                onClick={handleBandwidthUpdate}
                className="rounded-lg bg-cyber-cyan/10 px-4 py-1.5 text-sm text-cyber-cyan hover:bg-cyber-cyan/20"
              >
                Update
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-purple-400/20 bg-dark-800 p-5 w-72">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-400">
            <Radar className="h-4 w-4" />
            IRQ Probe
          </div>
          <div className="space-y-2">
            <select value={irqTarget} onChange={(e) => setIrqTarget(e.target.value)} className="w-full rounded border border-dark-600 bg-dark-700 px-2 py-1.5 text-xs text-white outline-none focus:border-purple-400/50">
              <option value="">Select Terminal</option>
              {onlineTerminals.map((t) => <option key={t.id} value={t.id}>{aliasDisplay(t.aliases)}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={() => { if (irqTarget) sendIRQ(irqTarget) }} className="flex-1 rounded bg-purple-400/20 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-400/30">
                Send IRQ
              </button>
              <button onClick={() => { if (irqTarget) sendIRR(irqTarget) }} className="flex-1 rounded bg-purple-300/20 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-300/30">
                Reply IRR
              </button>
            </div>
          </div>
        </div>
      </div>

      {showIRQConfig && (
        <div className="animate-fade-in-up mb-6 rounded-xl border border-purple-400/20 bg-dark-800 p-5">
          <h3 className="mb-3 text-sm font-semibold text-purple-400">IRQ Configuration</h3>
          <div className="flex items-center gap-6">
            <div>
              <label className="mb-1 block text-xs text-dark-500">Probe Interval (seconds)</label>
              <input type="number" value={irqInterval} onChange={(e) => setIrqInterval(Number(e.target.value))} className="w-32 rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-white outline-none focus:border-purple-400/50" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-dark-500">IRR Timeout (seconds)</label>
              <input type="number" value={irqTimeout} onChange={(e) => setIrqTimeout(Number(e.target.value))} className="w-32 rounded-lg border border-dark-600 bg-dark-700 px-3 py-1.5 text-sm text-white outline-none focus:border-purple-400/50" />
            </div>
            <button onClick={handleIRQConfigUpdate} className="mt-4 rounded-lg bg-purple-400/20 px-4 py-1.5 text-sm text-purple-400 hover:bg-purple-400/30">
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {admissions.length === 0 ? (
          <div className="rounded-xl border border-dark-700 bg-dark-800 py-16 text-center text-sm text-dark-500">
            No admission requests
          </div>
        ) : (
          admissions.map((adm) => (
            <div key={adm.id}>
              <div
                className="animate-fade-in-up flex items-center gap-4 rounded-xl border border-dark-700 bg-dark-800 px-5 py-4"
              >
                <div className="flex flex-1 items-center gap-2">
                  <span className="text-sm font-medium text-white">{adm.caller_alias}</span>
                  <ArrowRight className="h-4 w-4 text-dark-500" />
                  <span className="text-sm font-medium text-white">{adm.callee_alias}</span>
                  {adm.callee_routed_to && (
                    <span className="text-[10px] text-cyber-cyan/70">→ {adm.callee_routed_to}</span>
                  )}
                </div>
                <span className="font-mono text-xs text-dark-500">{adm.bandwidth} kbps</span>
                <span className={cn("rounded border px-2 py-0.5 text-[10px] font-semibold uppercase", adm.call_type === "point_to_point" ? "border-cyber-cyan/30 bg-cyber-cyan/10 text-cyber-cyan" : "border-cyber-orange/30 bg-cyber-orange/10 text-cyber-orange")}>
                  {adm.call_type === "point_to_point" ? "P2P" : "MP"}
                </span>
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", statusStyles[adm.status])}>
                  {adm.status}
                </span>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-dark-500">{new Date(adm.request_time).toLocaleTimeString()}</div>
                  {adm.response_time && (
                    <div className="font-mono text-[10px] text-dark-500">{new Date(adm.response_time).toLocaleTimeString()}</div>
                  )}
                </div>
                {adm.status === "confirmed" && (
                  <button
                    onClick={() => { setBrqOpenId(brqOpenId === adm.id ? null : adm.id); setBrqBwInput(String(adm.bandwidth)) }}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyan-400/70 transition-colors hover:bg-cyan-400/10 hover:text-cyan-400"
                    title="Change bandwidth (BRQ)"
                  >
                    <Gauge className="h-3.5 w-3.5" />
                  </button>
                )}
                {adm.reject_reason && (
                  <span className="max-w-48 truncate text-xs text-cyber-red/80" title={adm.reject_reason}>
                    {adm.reject_reason}
                  </span>
                )}
              </div>
              {brqOpenId === adm.id && (
                <div className="animate-fade-in-up mt-1 flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-dark-800 px-5 py-3">
                  <span className="text-xs text-cyan-400">BRQ — New Bandwidth (kbps):</span>
                  <input
                    type="number"
                    value={brqBwInput}
                    onChange={(e) => setBrqBwInput(e.target.value)}
                    placeholder={String(adm.bandwidth)}
                    className="w-24 rounded border border-dark-600 bg-dark-700 px-2 py-1 text-sm text-white outline-none focus:border-cyan-400/50"
                  />
                  <button
                    onClick={() => {
                      const val = Number(brqBwInput)
                      if (val > 0) {
                        changeAdmissionBandwidth(adm.id, val)
                        setBrqOpenId(null)
                      }
                    }}
                    className="rounded bg-cyan-400/20 px-3 py-1 text-xs text-cyan-400 hover:bg-cyan-400/30"
                  >
                    Submit
                  </button>
                  <button onClick={() => setBrqOpenId(null)} className="text-xs text-dark-500 hover:text-slate-300">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="animate-fade-in-up w-full max-w-md rounded-xl border border-dark-700 bg-dark-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Call Request (ARQ)</h2>
              <button onClick={() => setShowModal(false)} className="text-dark-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-dark-500">Caller Alias <span className="text-cyber-cyan">(H.323 ID or E.164)</span></label>
                <select
                  value={form.caller_alias}
                  onChange={(e) => setForm({ ...form, caller_alias: e.target.value })}
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                >
                  <option value="">Select Caller</option>
                  {onlineTerminals.map((t) => (
                    <option key={t.id} value={aliasDisplay(t.aliases)}>{aliasDisplay(t.aliases)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500">Callee Alias <span className="text-cyber-cyan">(Route by H.323 ID or E.164)</span></label>
                <select
                  value={form.callee_alias}
                  onChange={(e) => setForm({ ...form, callee_alias: e.target.value })}
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                >
                  <option value="">Select Callee</option>
                  {onlineTerminals.map((t) => (
                    <option key={t.id} value={aliasDisplay(t.aliases)}>{aliasDisplay(t.aliases)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-dark-500">Bandwidth (kbps)</label>
                  <input
                    type="number"
                    value={form.bandwidth}
                    onChange={(e) => setForm({ ...form, bandwidth: Number(e.target.value) })}
                    className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-dark-500">Call Type</label>
                  <select
                    value={form.call_type}
                    onChange={(e) => setForm({ ...form, call_type: e.target.value })}
                    className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                  >
                    <option value="point_to_point">Point-to-Point</option>
                    <option value="multipoint">Multipoint</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-lg border border-dark-600 py-2 text-sm text-dark-500 hover:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 rounded-lg bg-cyber-cyan/20 py-2 text-sm font-medium text-cyber-cyan hover:bg-cyber-cyan/30"
                >
                  Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

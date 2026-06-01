import { useEffect, useState } from "react"
import { useStore, aliasDisplay } from "@/store/useStore"
import { cn } from "@/lib/utils"
import { UserPlus, X, Trash2, Radar, Radio, Download } from "lucide-react"

export default function Terminals() {
  const { terminals, fetchTerminals, registerTerminal, unregisterTerminal, sendIRQ, sendIRR, exportTerminalsCSV } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    h323_id: "",
    e164: "",
    signaling_address: "",
    signaling_port: 1720,
    ras_address: "",
    time_to_live: 60,
  })

  useEffect(() => {
    fetchTerminals()
  }, [])

  const handleSubmit = async () => {
    await registerTerminal(form)
    setShowModal(false)
    setForm({ h323_id: "", e164: "", signaling_address: "", signaling_port: 1720, ras_address: "", time_to_live: 60 })
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Terminal Management</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportTerminalsCSV()}
            className="flex items-center gap-2 rounded-lg border border-dark-600 px-4 py-2 text-sm font-medium text-dark-400 transition-all hover:border-cyber-cyan/30 hover:text-cyber-cyan"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-lg bg-cyber-cyan/10 px-4 py-2 text-sm font-medium text-cyber-cyan transition-all hover:bg-cyber-cyan/20 hover:shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          >
            <UserPlus className="h-4 w-4" />
            Register Terminal
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700 text-left text-xs uppercase tracking-wider text-dark-500">
              <th className="px-4 py-3">Aliases (H.323 / E.164)</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Signaling Addr:Port</th>
              <th className="px-4 py-3">RAS Address</th>
              <th className="px-4 py-3">Registered</th>
              <th className="px-4 py-3">Last IRR</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {terminals.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-dark-500">
                  No terminals registered
                </td>
              </tr>
            ) : (
              terminals.map((t) => (
                <tr key={t.id} className="border-b border-dark-700/50 transition-colors hover:bg-dark-700/30">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      {t.aliases.h323_id && (
                        <span className="text-sm font-medium text-white">
                          <span className="mr-1 text-[10px] text-cyber-cyan">H.323</span>
                          {t.aliases.h323_id}
                        </span>
                      )}
                      {t.aliases.e164 && (
                        <span className="text-sm font-medium text-white">
                          <span className="mr-1 text-[10px] text-cyber-yellow">E.164</span>
                          {t.aliases.e164}
                        </span>
                      )}
                      {!t.aliases.h323_id && !t.aliases.e164 && (
                        <span className="text-sm text-dark-500">—</span>
                      )}
                    </div>
                  </td>
                  <td className="font-mono text-xs text-dark-500 px-4 py-3">{t.id.slice(0, 8)}…</td>
                  <td className="font-mono text-xs text-slate-300 px-4 py-3">
                    {t.signaling_address}:{t.signaling_port}
                  </td>
                  <td className="font-mono text-xs text-slate-300 px-4 py-3">{t.ras_address}</td>
                  <td className="font-mono text-xs text-dark-500 px-4 py-3">
                    {new Date(t.registration_time).toLocaleString()}
                  </td>
                  <td className="font-mono text-xs text-dark-500 px-4 py-3">
                    {t.last_irr_time ? new Date(t.last_irr_time).toLocaleTimeString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        t.status === "online"
                          ? "bg-cyber-green/10 text-cyber-green"
                          : "bg-dark-600 text-dark-500"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          t.status === "online" ? "bg-cyber-green" : "bg-dark-500"
                        )}
                      />
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {t.status === "online" && (
                        <>
                          <button
                            onClick={() => sendIRQ(t.id)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-400/70 transition-colors hover:bg-purple-400/10 hover:text-purple-400"
                            title="Send IRQ probe"
                          >
                            <Radar className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => sendIRR(t.id)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-300/70 transition-colors hover:bg-purple-300/10 hover:text-purple-300"
                            title="Send IRR response"
                          >
                            <Radio className="h-3 w-3" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => unregisterTerminal(t.id)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-cyber-red/70 transition-colors hover:bg-cyber-red/10 hover:text-cyber-red"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="animate-fade-in-up w-full max-w-md rounded-xl border border-dark-700 bg-dark-800 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Register Terminal (RRQ)</h2>
              <button onClick={() => setShowModal(false)} className="text-dark-500 hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-dark-500">H.323 ID <span className="text-cyber-cyan">(e.g. user@domain.com)</span></label>
                <input
                  value={form.h323_id}
                  onChange={(e) => setForm({ ...form, h323_id: e.target.value })}
                  placeholder="endpoint@example.com"
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500">E.164 Number <span className="text-cyber-yellow">(e.g. 1001)</span></label>
                <input
                  value={form.e164}
                  onChange={(e) => setForm({ ...form, e164: e.target.value })}
                  placeholder="1001"
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white placeholder-dark-500 outline-none focus:border-cyber-cyan/50"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500">Signaling Address</label>
                <input
                  value={form.signaling_address}
                  onChange={(e) => setForm({ ...form, signaling_address: e.target.value })}
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-dark-500">Signaling Port</label>
                  <input
                    type="number"
                    value={form.signaling_port}
                    onChange={(e) => setForm({ ...form, signaling_port: Number(e.target.value) })}
                    className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-dark-500">Time to Live (s)</label>
                  <input
                    type="number"
                    value={form.time_to_live}
                    onChange={(e) => setForm({ ...form, time_to_live: Number(e.target.value) })}
                    className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-dark-500">RAS Address</label>
                <input
                  value={form.ras_address}
                  onChange={(e) => setForm({ ...form, ras_address: e.target.value })}
                  className="w-full rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-sm text-white outline-none focus:border-cyber-cyan/50"
                />
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
                  Register
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

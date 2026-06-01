import { useState } from 'react'
import { Send, Trash2, Shield } from 'lucide-react'
import { useLMAStore } from '@/store'
import { ACCESS_TECH_PRIORITY, QOS_CLASS_INFO } from '@/types'
import type { PBURequest, AccessTechType, QoSTrafficClass } from '@/types'

const PRESETS: PBURequest[] = [
  { mn_id: 'MN1', mn_prefix: '2001:db8:1::/64', mag_address: '2001:db8:0:1::1', lifetime: 3600, access_tech_type: 'wifi', qos_classes: ['DATA', 'VOICE'] },
  { mn_id: 'MN2', mn_prefix: '2001:db8:2::/64', mag_address: '2001:db8:0:2::1', lifetime: 3600, access_tech_type: 'lte', qos_classes: ['VIDEO', 'SIGNAL'] },
  { mn_id: 'MN3', mn_prefix: '2001:db8:3::/64', mag_address: '2001:db8:0:3::1', lifetime: 1800, access_tech_type: '5g', qos_classes: ['VOICE', 'VIDEO', 'DATA'] },
]

const TECH_OPTIONS: AccessTechType[] = ['ethernet', 'wifi', 'lte', '5g']
const QOS_OPTIONS: QoSTrafficClass[] = ['VOICE', 'VIDEO', 'DATA', 'SIGNAL', 'AF3', 'AF2', 'BE']

export default function PBUPanel() {
  const { sendPBU, loading, lastPBA } = useLMAStore()
  const [form, setForm] = useState<PBURequest>({
    mn_id: '',
    mn_prefix: '',
    mag_address: '',
    lifetime: 3600,
    access_tech_type: 'wifi',
    qos_classes: [],
  })

  const toggleQoSClass = (cls: QoSTrafficClass) => {
    setForm((prev) => {
      const current = prev.qos_classes || []
      if (current.includes(cls)) {
        return { ...prev, qos_classes: current.filter((c) => c !== cls) }
      }
      return { ...prev, qos_classes: [...current, cls] }
    })
  }

  const handleRegister = async () => {
    if (!form.mn_id || !form.mn_prefix || !form.mag_address) return
    const req = { ...form }
    if (req.qos_classes && req.qos_classes.length === 0) {
      delete req.qos_classes
    }
    await sendPBU(req)
  }

  const handleDeregister = async () => {
    if (!form.mn_id) return
    await sendPBU({ ...form, lifetime: 0 })
  }

  const applyPreset = (preset: PBURequest) => {
    setForm({ ...preset })
  }

  const updateField = (field: keyof PBURequest, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-lma-accent animate-pulse-glow" />
        <h2 className="font-display font-bold text-lg text-lma-text">PBU Simulator</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 block">MN Identifier</label>
          <input
            className="glow-input w-full"
            placeholder="e.g. MN1"
            value={form.mn_id}
            onChange={(e) => updateField('mn_id', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 block">MN IPv6 Prefix</label>
          <input
            className="glow-input w-full"
            placeholder="e.g. 2001:db8:1::/64"
            value={form.mn_prefix}
            onChange={(e) => updateField('mn_prefix', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 block">MAG Address</label>
          <input
            className="glow-input w-full"
            placeholder="e.g. 2001:db8:0:1::1"
            value={form.mag_address}
            onChange={(e) => updateField('mag_address', e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 block">Access Technology</label>
          <div className="grid grid-cols-2 gap-2">
            {TECH_OPTIONS.map((tech) => {
              const info = ACCESS_TECH_PRIORITY[tech]
              const selected = form.access_tech_type === tech
              return (
                <button
                  key={tech}
                  className={`px-2 py-1.5 rounded-lg text-xs font-mono border transition-all ${
                    selected
                      ? `${info.color} border-current`
                      : 'bg-lma-bg border-lma-border text-lma-muted hover:border-lma-accent/50'
                  }`}
                  onClick={() => updateField('access_tech_type', tech)}
                >
                  {info.label} <span className="text-[10px]">P{info.priority}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 flex items-center gap-1">
            <Shield size={11} /> QoS Traffic Classes
          </label>
          <div className="flex flex-wrap gap-1.5">
            {QOS_OPTIONS.map((cls) => {
              const info = QOS_CLASS_INFO[cls]
              const selected = form.qos_classes?.includes(cls)
              return (
                <button
                  key={cls}
                  className={`px-1.5 py-1 rounded text-[10px] font-mono border transition-all ${
                    selected
                      ? `${info.color} border-current`
                      : 'bg-lma-bg border-lma-border/50 text-lma-muted hover:border-lma-accent/30'
                  }`}
                  onClick={() => toggleQoSClass(cls)}
                  title={`${info.description} | DSCP ${info.dscp}`}
                >
                  {info.label}
                </button>
              )
            })}
          </div>
          <p className="text-[10px] text-lma-muted mt-1 font-mono">
            Select traffic classes for QoS negotiation
          </p>
        </div>

        <div>
          <label className="text-xs text-lma-muted font-mono mb-1 block">Lifetime (seconds)</label>
          <input
            className="glow-input w-full"
            type="number"
            min={0}
            value={form.lifetime}
            onChange={(e) => updateField('lifetime', parseInt(e.target.value) || 0)}
          />
          <p className="text-[10px] text-lma-muted mt-1 font-mono">Set to 0 to deregister</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          onClick={handleRegister}
          disabled={loading || !form.mn_id}
        >
          <Send size={14} />
          Register
        </button>
        <button
          className="btn-danger flex-1 flex items-center justify-center gap-2"
          onClick={handleDeregister}
          disabled={loading || !form.mn_id}
        >
          <Trash2 size={14} />
          Deregister
        </button>
      </div>

      {lastPBA && (
        <div
          className={`text-xs font-mono p-3 rounded-lg border animate-fade-in ${
            lastPBA.status === 0
              ? 'bg-lma-accent/5 border-lma-accent/20 text-lma-accent'
              : 'bg-lma-red/5 border-lma-red/20 text-lma-red'
          }`}
        >
          <div className="font-semibold mb-1">
            PBA Response {lastPBA.handover && '⚡ Handover'}
          </div>
          <div>Status: {lastPBA.status === 0 ? '✓ Accepted' : '✗ Rejected'}</div>
          <div>Message: {lastPBA.message}</div>
          {lastPBA.mn_id && <div>MN: {lastPBA.mn_id}</div>}
          {lastPBA.tunnel_priority !== undefined && (
            <div>Tunnel Priority: P{lastPBA.tunnel_priority}</div>
          )}
          {lastPBA.handover && lastPBA.old_mag && (
            <div className="mt-1 text-lma-yellow">
              Old MAG: {lastPBA.old_mag} → New MAG: {lastPBA.mag_address}
            </div>
          )}
          {lastPBA.qos_profile && (
            <div className="mt-1 text-lma-blue">
              QoS: {lastPBA.qos_profile.flow_mappings.length} flows
              {lastPBA.qos_profile.granted ? ' ✓' : ' ⚠ negotiated'}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-xs text-lma-muted mb-2 font-display">Quick Presets</p>
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.mn_id}
              className="px-2 py-1 rounded text-[11px] font-mono bg-lma-bg border border-lma-border text-lma-muted hover:border-lma-accent hover:text-lma-accent transition-all"
              onClick={() => applyPreset(p)}
            >
              {p.mn_id} ({ACCESS_TECH_PRIORITY[p.access_tech_type].label})
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

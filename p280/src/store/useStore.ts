import { create } from "zustand"
import type { GatekeeperInfo, Terminal, AdmissionRequest, RASMessage } from "@/types"

const API_BASE = "http://localhost:8000"

export function aliasDisplay(aliases: { h323_id: string; e164: string }): string {
  const parts: string[] = []
  if (aliases.h323_id) parts.push(`h323:${aliases.h323_id}`)
  if (aliases.e164) parts.push(`e164:${aliases.e164}`)
  return parts.length === 1 ? parts[0] : parts.length > 1 ? parts.join(" | ") : "unknown"
}

interface StoreState {
  gatekeeper: GatekeeperInfo | null
  terminals: Terminal[]
  admissions: AdmissionRequest[]
  rasMessages: RASMessage[]
  wsConnected: boolean
  fetchGatekeeper: () => Promise<void>
  fetchTerminals: () => Promise<void>
  fetchAdmissions: () => Promise<void>
  fetchRasMessages: () => Promise<void>
  registerTerminal: (data: { h323_id: string; e164: string; signaling_address: string; signaling_port: number; ras_address: string; time_to_live: number }) => Promise<void>
  unregisterTerminal: (id: string) => Promise<void>
  requestAdmission: (data: { caller_alias: string; callee_alias: string; bandwidth: number; call_type: string }) => Promise<void>
  sendGRQ: () => Promise<void>
  sendIRQ: (terminalId: string) => Promise<void>
  sendIRR: (terminalId: string) => Promise<void>
  updateBandwidth: (bandwidth: number) => Promise<void>
  updateIRQConfig: (interval: number, timeout: number) => Promise<void>
  changeAdmissionBandwidth: (admissionId: string, newBandwidth: number) => Promise<void>
  exportTerminalsCSV: () => Promise<void>
  connectWebSocket: () => void
}

export const useStore = create<StoreState>((set, get) => ({
  gatekeeper: null,
  terminals: [],
  admissions: [],
  rasMessages: [],
  wsConnected: false,

  fetchGatekeeper: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gatekeeper`)
      const data = await res.json()
      set({ gatekeeper: data })
    } catch {
      console.error("Failed to fetch gatekeeper info")
    }
  },

  fetchTerminals: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/terminals`)
      const data = await res.json()
      set({ terminals: data })
    } catch {
      console.error("Failed to fetch terminals")
    }
  },

  fetchAdmissions: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admissions`)
      const data = await res.json()
      set({ admissions: data })
    } catch {
      console.error("Failed to fetch admissions")
    }
  },

  fetchRasMessages: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ras/messages`)
      const data = await res.json()
      set({ rasMessages: data })
    } catch {
      console.error("Failed to fetch RAS messages")
    }
  },

  registerTerminal: async (data) => {
    try {
      await fetch(`${API_BASE}/api/terminals/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      await get().fetchTerminals()
    } catch {
      console.error("Failed to register terminal")
    }
  },

  unregisterTerminal: async (id) => {
    try {
      await fetch(`${API_BASE}/api/terminals/${id}`, { method: "DELETE" })
      await get().fetchTerminals()
    } catch {
      console.error("Failed to unregister terminal")
    }
  },

  requestAdmission: async (data) => {
    try {
      await fetch(`${API_BASE}/api/admissions/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      await get().fetchAdmissions()
    } catch {
      console.error("Failed to request admission")
    }
  },

  sendGRQ: async () => {
    try {
      await fetch(`${API_BASE}/api/ras/grq`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terminal_alias: "discovery-terminal",
          ras_address: "192.168.1.200",
        }),
      })
      await get().fetchRasMessages()
    } catch {
      console.error("Failed to send GRQ")
    }
  },

  sendIRQ: async (terminalId) => {
    try {
      await fetch(`${API_BASE}/api/ras/irq/${terminalId}`, {
        method: "POST",
      })
      await get().fetchTerminals()
    } catch {
      console.error("Failed to send IRQ")
    }
  },

  sendIRR: async (terminalId) => {
    try {
      await fetch(`${API_BASE}/api/terminals/irr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terminal_id: terminalId }),
      })
    } catch {
      console.error("Failed to send IRR")
    }
  },

  updateBandwidth: async (bandwidth) => {
    try {
      await fetch(`${API_BASE}/api/gatekeeper/bandwidth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ total_bandwidth: bandwidth }),
      })
      await get().fetchGatekeeper()
    } catch {
      console.error("Failed to update bandwidth")
    }
  },

  updateIRQConfig: async (interval, timeout) => {
    try {
      await fetch(`${API_BASE}/api/gatekeeper/irq-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval, timeout }),
      })
      await get().fetchGatekeeper()
    } catch {
      console.error("Failed to update IRQ config")
    }
  },

  changeAdmissionBandwidth: async (admissionId, newBandwidth) => {
    try {
      await fetch(`${API_BASE}/api/admissions/bandwidth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admission_id: admissionId, new_bandwidth: newBandwidth }),
      })
      await get().fetchAdmissions()
    } catch {
      console.error("Failed to change admission bandwidth")
    }
  },

  exportTerminalsCSV: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/terminals/csv`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `h323-terminals-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      console.error("Failed to export CSV")
    }
  },

  connectWebSocket: () => {
    const ws = new WebSocket("ws://localhost:8000/ws/ras")

    ws.onopen = () => {
      set({ wsConnected: true })
    }

    ws.onclose = () => {
      set({ wsConnected: false })
      setTimeout(() => {
        get().connectWebSocket()
      }, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.event) {
          case "ras_message":
            set((state) => ({
              rasMessages: [msg.data, ...state.rasMessages],
            }))
            break
          case "terminal_registered":
            set((state) => {
              const idx = state.terminals.findIndex((t) => t.id === msg.data.id)
              if (idx >= 0) {
                const updated = [...state.terminals]
                updated[idx] = msg.data
                return { terminals: updated }
              }
              return { terminals: [...state.terminals, msg.data] }
            })
            break
          case "terminal_unregistered":
            set((state) => ({
              terminals: state.terminals.map((t) =>
                t.id === msg.data.id ? { ...t, status: "offline" as const } : t
              ),
            }))
            break
          case "admission_update":
            set((state) => {
              const idx = state.admissions.findIndex((a) => a.id === msg.data.id)
              if (idx >= 0) {
                const updated = [...state.admissions]
                updated[idx] = msg.data
                return { admissions: updated }
              }
              return { admissions: [...state.admissions, msg.data] }
            })
            break
          case "gatekeeper_status":
          case "gatekeeper_update":
            set({ gatekeeper: msg.data })
            break
        }
      } catch {
        console.error("Failed to parse WebSocket message")
      }
    }
  },
}))

import type { PBURequest, PBAResponse, BCEEntry, EventLog, TunnelState, BindingUpdateRecord } from './types'

const API_BASE = 'http://localhost:8080/api'

export async function sendPBU(req: PBURequest): Promise<PBAResponse> {
  const res = await fetch(`${API_BASE}/pbu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  return res.json()
}

export async function fetchBCE(): Promise<BCEEntry[]> {
  const res = await fetch(`${API_BASE}/bce`)
  return res.json()
}

export async function fetchEvents(): Promise<EventLog[]> {
  const res = await fetch(`${API_BASE}/events`)
  return res.json()
}

export async function fetchTunnels(): Promise<TunnelState[]> {
  const res = await fetch(`${API_BASE}/tunnels`)
  return res.json()
}

export async function fetchHistory(mnID?: string): Promise<{ total: number; records: BindingUpdateRecord[] }> {
  const url = mnID ? `${API_BASE}/history?mn_id=${encodeURIComponent(mnID)}` : `${API_BASE}/history`
  const res = await fetch(url)
  return res.json()
}

export async function exportHistory(format: 'json' | 'csv', mnID?: string): Promise<void> {
  const params = new URLSearchParams()
  params.set('format', format)
  if (mnID) params.set('mn_id', mnID)
  const url = `${API_BASE}/history/export?${params.toString()}`
  const a = document.createElement('a')
  a.href = url
  a.download = `binding-history.${format}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

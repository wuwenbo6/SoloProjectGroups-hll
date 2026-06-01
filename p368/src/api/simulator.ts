const API_BASE = '/api'

export async function disconnectPath(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/path/${id}/disconnect`, { method: 'POST' })
  return res.json()
}

export async function connectPath(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/path/${id}/connect`, { method: 'POST' })
  return res.json()
}

export async function toggleAutoFailover(enabled: boolean): Promise<{ enabled: boolean }> {
  const res = await fetch(`${API_BASE}/failover/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  return res.json()
}

export async function setIOLoad(percent: number): Promise<{ percent: number }> {
  const res = await fetch(`${API_BASE}/io/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ percent }),
  })
  return res.json()
}

content = '''import type { SimConfig, SimResult } from '../store/dpdkStore'

const API_BASE = '/api/dpdk'

export async function startTest(config: SimConfig): Promise<{ testId: string; status: string }> {
  const res = await fetch(`${API_BASE}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function startMultiSizeTest(
  config: Omit<SimConfig, 'packetSize'> & { packetSizes: number[] }
): Promise<{ status: string; count: number }> {
  const res = await fetch(`${API_BASE}/multi-size`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchMultiSizeResults(): Promise<SimResult[]> {
  const res = await fetch(`${API_BASE}/multi-size`)
  return res.json()
}

export async function stopTest(): Promise<void> {
  await fetch(`${API_BASE}/stop`, { method: 'POST' })
}

export async function fetchStatus(): Promise<{
  status: string
  testId: string | null
  progress: number
  packetsProcessed: number
  error: string | null
}> {
  const res = await fetch(`${API_BASE}/status`)
  return res.json()
}

export async function fetchLatency(): Promise<SimResult> {
  const res = await fetch(`${API_BASE}/latency`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'No data' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function exportCsv(): Promise<void> {
  const res = await fetch(`${API_BASE}/export-csv`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'No data' }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const cd = res.headers.get('Content-Disposition')
  const match = cd?.match(/filename=(.+)/)
  a.download = match?.[1] || 'dpdk_latency.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}
'''

with open('src/api/dpdkApi.ts', 'w') as f:
    f.write(content)
print('Updated src/api/dpdkApi.ts')

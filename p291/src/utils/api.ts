import type { EngineIdDiscoveryRequest, EngineIdDiscoveryResponse } from "@/types"

export async function fetchTraps(
  version?: string | null,
  limit = 50,
  offset = 0
) {
  const params = new URLSearchParams()
  if (version) params.set("version", version)
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  const res = await fetch(`/api/traps?${params}`)
  return res.json()
}

export async function fetchTrap(id: string) {
  const res = await fetch(`/api/traps/${id}`)
  return res.json()
}

export async function clearTraps() {
  const res = await fetch(`/api/traps`, { method: "DELETE" })
  return res.json()
}

export async function exportTraps() {
  window.open(`/api/traps/export`, "_blank")
}

export async function fetchStatus() {
  const res = await fetch(`/api/status`)
  return res.json()
}

export async function fetchConfig() {
  const res = await fetch(`/api/config`)
  return res.json()
}

export async function updateConfig(config: unknown) {
  const res = await fetch(`/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  })
  return res.json()
}

export async function sendDemoTrap() {
  const res = await fetch(`/api/demo-trap`, { method: "POST" })
  return res.json()
}

export async function discoverEngineId(
  req: EngineIdDiscoveryRequest
): Promise<EngineIdDiscoveryResponse> {
  const res = await fetch(`/api/v3/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  return res.json()
}

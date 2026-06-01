import type {
  Topology,
  PresetType,
  MRouteEntry,
  SimEvent,
  JoinRequest,
  PruneRequest,
  SwitchSPTRequest,
  RegisterRequest,
  RouteEntry,
  RPFCheckRequest,
  RPFCheckResult,
} from '@/types/simulator';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function fetchTopology(): Promise<Topology> {
  return request<Topology>('/api/topology');
}

export async function loadPreset(preset: PresetType): Promise<Topology> {
  return request<Topology>('/api/topology/preset', {
    method: 'POST',
    body: JSON.stringify({ preset }),
  });
}

export async function updateNodePosition(
  routerId: string,
  x: number,
  y: number
): Promise<void> {
  await request<void>(`/api/topology/nodes/${routerId}`, {
    method: 'PUT',
    body: JSON.stringify({ x, y }),
  });
}

export async function sendJoin(req: JoinRequest): Promise<{ events: SimEvent[] }> {
  return request<{ events: SimEvent[] }>('/api/pim/join', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function sendPrune(req: PruneRequest): Promise<{ events: SimEvent[] }> {
  return request<{ events: SimEvent[] }>('/api/pim/prune', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function switchSPT(req: SwitchSPTRequest): Promise<{ events: SimEvent[] }> {
  return request<{ events: SimEvent[] }>('/api/pim/switch-spt', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function registerSource(req: RegisterRequest): Promise<{ events: SimEvent[] }> {
  return request<{ events: SimEvent[] }>('/api/pim/register', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function performRPFCheck(req: RPFCheckRequest): Promise<RPFCheckResult> {
  return request<RPFCheckResult>('/api/pim/rpf-check', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function fetchMrouteTable(routerId: string): Promise<MRouteEntry[]> {
  const data = await request<{ router_id: string; entries: MRouteEntry[] }>(`/api/routers/${routerId}/mroute`);
  return data.entries;
}

export async function fetchUnicastRoutes(routerId: string): Promise<RouteEntry[]> {
  const data = await request<{ router_id: string; entries: RouteEntry[] }>(`/api/routers/${routerId}/unicast-routes`);
  return data.entries;
}

export async function fetchRouterState(routerId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/api/routers/${routerId}/state`);
}

export async function fetchGroups(): Promise<{ groups: Array<Record<string, unknown>> }> {
  return request<{ groups: Array<Record<string, unknown>> }>('/api/groups');
}

export async function fetchEvents(): Promise<SimEvent[]> {
  const data = await request<{ events: SimEvent[] }>('/api/events');
  return data.events;
}

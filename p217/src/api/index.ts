import type {
  Vnfd,
  VnfInstance,
  VirtualLink,
  Event,
  Stats,
  InstantiateRequest,
  ScaleRequest,
  CreateLinkRequest,
  BatchInstantiateRequest,
  RouteTable,
  AutoScalingConfig,
  VnfMetrics,
} from "@/types";

const API_BASE = "/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getVnfds: () => request<Vnfd[]>("/vnfds"),
  getVnfd: (id: string) => request<Vnfd>(`/vnfds/${id}`),
  createVnfd: (data: Vnfd) => request<Vnfd>("/vnfds", { method: "POST", body: JSON.stringify(data) }),
  deleteVnfd: (id: string) => request<{ message: string }>(`/vnfds/${id}`, { method: "DELETE" }),

  getVnfs: () => request<VnfInstance[]>("/vnfs"),
  getVnf: (id: string) => request<VnfInstance>(`/vnfs/${id}`),
  instantiateVnf: (data: InstantiateRequest) => request<VnfInstance>("/vnfs", { method: "POST", body: JSON.stringify(data) }),
  batchInstantiateVnfs: (data: BatchInstantiateRequest) =>
    request<{ message: string; vnfs: VnfInstance[]; count: number }>("/vnfs/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  scaleVnf: (id: string, data: ScaleRequest) => request<VnfInstance>(`/vnfs/${id}/scale`, { method: "PUT", body: JSON.stringify(data) }),
  terminateVnf: (id: string) => request<{ message: string }>(`/vnfs/${id}`, { method: "DELETE" }),
  getRouteTable: (id: string) => request<RouteTable>(`/vnfs/${id}/routes`),
  getNeighborVnfs: (id: string) => request<VnfInstance[]>(`/vnfs/${id}/neighbors`),
  getAutoScalingConfig: (id: string) => request<AutoScalingConfig>(`/vnfs/${id}/autoscaling`),
  updateAutoScalingConfig: (id: string, data: Partial<AutoScalingConfig>) =>
    request<AutoScalingConfig>(`/vnfs/${id}/autoscaling`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getMetrics: (id: string, limit?: number) =>
    request<VnfMetrics[]>(`/vnfs/${id}/metrics${limit ? `?limit=${limit}` : ""}`),
  exportToscaTemplate: (id: string) =>
    fetch(`${API_BASE}/vnfs/${id}/tosca`).then((res) => res.text()),

  getLinks: () => request<VirtualLink[]>("/links"),
  createLink: (data: CreateLinkRequest) => request<VirtualLink>("/links", { method: "POST", body: JSON.stringify(data) }),
  deleteLink: (id: string) => request<{ message: string }>(`/links/${id}`, { method: "DELETE" }),

  getEvents: () => request<Event[]>("/events"),
  getStats: () => request<Stats>("/stats"),
};

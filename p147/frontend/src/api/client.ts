import type { Route, TestRequest, TestResponse, RouteStats, ApiResponse, SystemStatus } from '../types'

const API_BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Request failed')
  }
  return json as T
}

export const api = {
  getRoutes: () => request<ApiResponse<Route[]>>('/routes'),
  createRoute: (route: Omit<Route, 'id' | 'serialError' | 'hasError' | 'activePath'>) =>
    request<ApiResponse<Route>>('/routes', {
      method: 'POST',
      body: JSON.stringify(route),
    }),
  updateRoute: (id: number, route: Omit<Route, 'id' | 'serialError' | 'hasError' | 'activePath'>) =>
    request<ApiResponse<Route>>(`/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(route),
    }),
  deleteRoute: (id: number) =>
    request<ApiResponse<null>>(`/routes/${id}`, { method: 'DELETE' }),
  toggleRoute: (id: number, enabled: boolean) =>
    request<ApiResponse<null>>(`/routes/${id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),

  getStats: () => request<ApiResponse<Record<string, RouteStats>>>('/stats'),
  getRouteStats: (routeId: number) =>
    request<ApiResponse<RouteStats>>(`/stats/${routeId}`),
  resetRouteStats: (routeId: number) =>
    request<ApiResponse<null>>(`/stats/${routeId}`, { method: 'DELETE' }),

  testRegister: (req: TestRequest) =>
    request<TestResponse>('/test', {
      method: 'POST',
      body: JSON.stringify(req),
    }),

  getSerialPorts: () => request<ApiResponse<string[]>>('/serial-ports'),

  getStatus: () => request<ApiResponse<SystemStatus>>('/status'),
}

import type { ParseResult, TrendData, HistoryResponse, CodecListResponse, P564Detail, CallListResponse, CallTrendData, CallSummary } from '@/types'

const BASE = '/api/xr'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export async function parseFromFile(file: File, codec: string = 'G.711'): Promise<ParseResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('codec', codec)
  return request<ParseResult>(`${BASE}/parse`, { method: 'POST', body: form })
}

export async function parseFromHex(hex: string, codec: string = 'G.711'): Promise<ParseResult> {
  const form = new FormData()
  form.append('hex', hex)
  form.append('codec', codec)
  return request<ParseResult>(`${BASE}/parse`, { method: 'POST', body: form })
}

export async function fetchTrend(hours: number = 24): Promise<TrendData> {
  return request<TrendData>(`${BASE}/trend?hours=${hours}`)
}

export async function fetchHistory(page: number = 1, pageSize: number = 20): Promise<HistoryResponse> {
  return request<HistoryResponse>(`${BASE}/history?page=${page}&page_size=${pageSize}`)
}

export async function fetchDetail(id: number): Promise<ParseResult> {
  return request<ParseResult>(`${BASE}/detail/${id}`)
}

export async function fetchLatest(): Promise<ParseResult> {
  return request<ParseResult>(`${BASE}/latest`)
}

export async function generateDemo(): Promise<{ message: string }> {
  return request<{ message: string }>(`${BASE}/demo`, { method: 'POST' })
}

export async function fetchP564Mos(lossRate: number, jitterDelay: number, codec: string = 'G.711'): Promise<P564Detail> {
  return request<P564Detail>(
    `/api/mos/p564?loss_rate=${lossRate}&jitter_delay=${jitterDelay}&codec=${codec}`
  )
}

export async function fetchCodecs(): Promise<CodecListResponse> {
  return request<CodecListResponse>('/api/codecs')
}

export async function fetchCallList(): Promise<CallListResponse> {
  return request<CallListResponse>('/api/calls')
}

export async function fetchCallTrend(ssrc: number, hours: number = 24): Promise<CallTrendData> {
  return request<CallTrendData>(`/api/calls/${ssrc}/trend?hours=${hours}`)
}

export async function fetchCallSummary(ssrc: number, hours: number = 24): Promise<CallSummary> {
  return request<CallSummary>(`/api/calls/${ssrc}/summary?hours=${hours}`)
}

export async function fetchOverallSummary(hours: number = 24): Promise<CallSummary> {
  return request<CallSummary>(`/api/summary?hours=${hours}`)
}

export async function fetchCompareCalls(ssrcs: number[], hours: number = 24): Promise<{ comparisons: CallSummary[] }> {
  return request<{ comparisons: CallSummary[] }>('/api/calls/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssrcs, hours }),
  })
}

export function getPdfReportUrl(hours: number = 24, ssrc?: number): string {
  const params = new URLSearchParams({ hours: String(hours) })
  if (ssrc) params.append('ssrc', String(ssrc))
  return `/api/report/pdf?${params.toString()}`
}

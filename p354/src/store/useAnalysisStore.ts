import { create } from "zustand"
import type {
  OverviewData,
  PaginatedLogs,
  PaginatedLeaks,
  TrendPoint,
  FixScript,
} from "@/types"

const API_BASE = "http://localhost:5001/api"

interface AnalysisState {
  taskId: string | null
  overview: OverviewData | null
  logs: PaginatedLogs | null
  leaks: PaginatedLeaks | null
  trend: TrendPoint[]
  loading: boolean
  error: string | null
  currentFix: FixScript | null

  uploadFile: (file: File) => Promise<void>
  uploadFiles: (files: File[]) => Promise<void>
  loadDemo: () => Promise<void>
  fetchOverview: () => Promise<void>
  fetchLogs: (page: number, perPage: number, filter?: string) => Promise<void>
  fetchLeaks: (page: number, perPage: number) => Promise<void>
  fetchTrend: () => Promise<void>
  generateFix: (scriptType?: string, leakIds?: number[]) => Promise<FixScript>
  exportReport: (format?: string) => void
  setCurrentFix: (fix: FixScript | null) => void
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json()
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  taskId: null,
  overview: null,
  logs: null,
  leaks: null,
  trend: [],
  loading: false,
  error: null,
  currentFix: null,

  uploadFile: async (file: File) => {
    set({ loading: true, error: null })
    try {
      const form = new FormData()
      form.append("files", file)
      const res = await apiFetch<{ task_id: string }>("/upload", {
        method: "POST",
        body: form,
      })
      set({ taskId: res.task_id })

      const poll = async () => {
        const s = await apiFetch<{ task_id: string; status: string }>(
          `/status/${res.task_id}`
        )
        if (s.status === "completed") {
          await Promise.all([
            get().fetchOverview(),
            get().fetchLogs(1, 20),
            get().fetchLeaks(1, 20),
            get().fetchTrend(),
          ])
          set({ loading: false })
          return
        }
        if (s.status === "error") {
          set({ error: "Analysis failed", loading: false })
          return
        }
        setTimeout(poll, 500)
      }
      poll()
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  uploadFiles: async (files: File[]) => {
    set({ loading: true, error: null })
    try {
      const form = new FormData()
      files.forEach((f) => form.append("files", f))
      const res = await apiFetch<{ task_id: string }>("/upload", {
        method: "POST",
        body: form,
      })
      set({ taskId: res.task_id })

      const poll = async () => {
        const s = await apiFetch<{ task_id: string; status: string }>(
          `/status/${res.task_id}`
        )
        if (s.status === "completed") {
          await Promise.all([
            get().fetchOverview(),
            get().fetchLogs(1, 20),
            get().fetchLeaks(1, 20),
            get().fetchTrend(),
          ])
          set({ loading: false })
          return
        }
        if (s.status === "error") {
          set({ error: "Analysis failed", loading: false })
          return
        }
        setTimeout(poll, 500)
      }
      poll()
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  loadDemo: async () => {
    set({ loading: true, error: null })
    try {
      const res = await apiFetch<{ task_id: string }>("/demo")
      set({ taskId: res.task_id })
      await Promise.all([
        get().fetchOverview(),
        get().fetchLogs(1, 20),
        get().fetchLeaks(1, 20),
        get().fetchTrend(),
      ])
      set({ loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  fetchOverview: async () => {
    try {
      const tid = get().taskId
      if (!tid) return
      const data = await apiFetch<OverviewData>(
        `/analysis/${tid}/overview`
      )
      set({ overview: data })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  fetchLogs: async (page, perPage, filter) => {
    set({ loading: true, error: null })
    try {
      const tid = get().taskId
      if (!tid) return
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      if (filter && filter !== "all") params.set("type", filter)
      const data = await apiFetch<PaginatedLogs>(
        `/analysis/${tid}/logs?${params}`
      )
      set({ logs: data, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  fetchLeaks: async (page, perPage) => {
    set({ loading: true, error: null })
    try {
      const tid = get().taskId
      if (!tid) return
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      const data = await apiFetch<PaginatedLeaks>(
        `/analysis/${tid}/leaks?${params}`
      )
      set({ leaks: data, loading: false })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  fetchTrend: async () => {
    try {
      const tid = get().taskId
      if (!tid) return
      const data = await apiFetch<TrendPoint[]>(
        `/analysis/${tid}/trend`
      )
      set({ trend: data })
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  generateFix: async (scriptType = "ceph", leakIds) => {
    set({ loading: true, error: null })
    try {
      const tid = get().taskId
      if (!tid) throw new Error("No task loaded")
      const body: any = { script_type: scriptType }
      if (leakIds) body.leak_ids = leakIds
      const data = await apiFetch<FixScript>(`/analysis/${tid}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      set({ currentFix: data, loading: false })
      return data
    } catch (e: any) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  exportReport: async (format = "json") => {
    try {
      const tid = get().taskId
      if (!tid) return
      const res = await fetch(`${API_BASE}/analysis/${tid}/export?format=${format}`)
      if (!res.ok) throw new Error(res.statusText)
      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") || ""
      const filenameMatch = disposition.match(/filename=(.+)/)
      const filename = filenameMatch ? filenameMatch[1] : `bluefs_report.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      set({ error: e.message })
    }
  },

  setCurrentFix: (fix) => set({ currentFix: fix }),
}))

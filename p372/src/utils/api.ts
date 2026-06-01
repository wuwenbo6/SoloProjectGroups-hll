import type { ODUType, MappingType, SimulatorState, ClientSignalType, MuxDiagram } from "@/types/otn";

const API_BASE = "";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getFrame: (oduType: ODUType) =>
    request<SimulatorState>(`/api/frame/${oduType}`),

  multiplex: (oduType: ODUType, odu0Id: string, timeslotIndex?: number, mappingType: MappingType = "GMP") =>
    request<SimulatorState>("/api/multiplex", {
      method: "POST",
      body: JSON.stringify({ oduType, odu0Id, timeslotIndex, mappingType }),
    }),

  demultiplex: (oduType: ODUType, timeslotIndex: number) =>
    request<SimulatorState>("/api/demultiplex", {
      method: "POST",
      body: JSON.stringify({ oduType, timeslotIndex }),
    }),

  updateOverhead: (oduType: ODUType, overhead: SimulatorState["overhead"]) =>
    request<SimulatorState>(`/api/overhead/${oduType}`, {
      method: "PUT",
      body: JSON.stringify(overhead),
    }),

  getTimeslots: (oduType: ODUType) =>
    request<SimulatorState["timeslots"]>(`/api/timeslots/${oduType}`),

  allocateTimeslot: (oduType: ODUType, odu0Id: string, timeslotIndex: number, mappingType: MappingType = "GMP") =>
    request<SimulatorState["timeslots"]>(`/api/timeslots/${oduType}/allocate`, {
      method: "POST",
      body: JSON.stringify({ odu0Id, timeslotIndex, mappingType }),
    }),

  releaseTimeslot: (oduType: ODUType, tsIndex: number) =>
    request<SimulatorState["timeslots"]>(`/api/timeslots/${oduType}/${tsIndex}`, {
      method: "DELETE",
    }),

  addODU0: (oduType: ODUType, name: string = "ODU0") =>
    request<{ signal: SimulatorState["odu0Signals"][0]; state: SimulatorState }>(`/api/odu0/${oduType}`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  addSignal: (oduType: ODUType, name: string, signalType: ClientSignalType, tsCount: number, bitrateGbps?: number) =>
    request<{ signal: SimulatorState["odu0Signals"][0]; state: SimulatorState }>(`/api/signal/${oduType}`, {
      method: "POST",
      body: JSON.stringify({ name, signalType, tsCount, bitrateGbps }),
    }),

  removeODU0: (oduType: ODUType, signalId: string) =>
    request<SimulatorState>(`/api/odu0/${oduType}/${signalId}`, {
      method: "DELETE",
    }),

  setMapping: (oduType: ODUType, mappingType: MappingType) =>
    request<SimulatorState>(`/api/mapping/${oduType}`, {
      method: "PUT",
      body: JSON.stringify({ mappingType }),
    }),

  simulateSignalLoss: (oduType: ODUType, tsIndex: number) =>
    request<SimulatorState>(`/api/signal-loss/${oduType}/${tsIndex}`, {
      method: "POST",
    }),

  clearAlarm: (oduType: ODUType, tsIndex: number) =>
    request<SimulatorState>(`/api/alarm/${oduType}/${tsIndex}/clear`, {
      method: "POST",
    }),

  getMuxDiagram: (oduType: ODUType, format: "json" | "mermaid" | "svg" = "json") =>
    request<MuxDiagram>(`/api/export/${oduType}/diagram?format=${format}`),

  exportDiagramSVG: (oduType: ODUType) =>
    `${API_BASE}/api/export/${oduType}/diagram.svg`,

  exportDiagramJSON: (oduType: ODUType) =>
    `${API_BASE}/api/export/${oduType}/diagram.json`,
};

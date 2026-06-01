import type { ParseResult, HistoryRecord, SamplePacket } from "@/types/s7comm";

const API_BASE = "/api";

export async function parsePacket(hexData: string, includeTpkt: boolean = true): Promise<ParseResult> {
  const response = await fetch(`${API_BASE}/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hex_data: hexData, include_tpkt: includeTpkt }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Parse failed" }));
    throw new Error(error.detail || "Parse failed");
  }
  return response.json();
}

export async function getHistory(): Promise<HistoryRecord[]> {
  const response = await fetch(`${API_BASE}/history`);
  return response.json();
}

export async function deleteHistory(id: number): Promise<void> {
  await fetch(`${API_BASE}/history/${id}`, { method: "DELETE" });
}

export async function clearHistory(): Promise<void> {
  await fetch(`${API_BASE}/history`, { method: "DELETE" });
}

export async function simulateConnect(ip: string, rack: number, slot: number) {
  const response = await fetch(`${API_BASE}/simulate/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip, rack, slot }),
  });
  return response.json();
}

export async function simulateRead(sessionId: string, area: string, dbNumber: number, offset: number, type: string, count: number) {
  const response = await fetch(`${API_BASE}/simulate/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, area, db_number: dbNumber, offset, type, count }),
  });
  return response.json();
}

export async function simulateWrite(sessionId: string, area: string, dbNumber: number, offset: number, type: string, data: number[]) {
  const response = await fetch(`${API_BASE}/simulate/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, area, db_number: dbNumber, offset, type, data }),
  });
  return response.json();
}

export async function getSamplePackets(): Promise<{ samples: SamplePacket[] }> {
  const response = await fetch(`${API_BASE}/sample-packets`);
  return response.json();
}

export function createSimulatorWebSocket(sessionId: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return new WebSocket(`${protocol}//${host}/ws/simulate/${sessionId}`);
}

export async function exportCsv(data: {
  parse_result?: Record<string, unknown>;
  record_id?: number;
  include_headers?: boolean;
}): Promise<string> {
  const response = await fetch(`${API_BASE}/export/csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Export failed");
  }
  return response.text();
}

export async function exportSessionCsv(sessionId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/simulate/${sessionId}/export/csv`);
  if (!response.ok) {
    throw new Error("Export failed");
  }
  return response.text();
}

export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

import { SimulateResponse, PcieVersion, NumaMode } from "@/types";

const API_BASE = "/api";

export async function fetchSimulation(
  iterations: number = 100,
  includeTraditional: boolean = true,
  pcieVersion: PcieVersion = "gen4",
  gpuCount: number = 1,
  numaMode: NumaMode = "local"
): Promise<SimulateResponse> {
  const params = new URLSearchParams({
    iterations: String(iterations),
    include_traditional: String(includeTraditional),
    pcie_version: pcieVersion,
    gpu_count: String(gpuCount),
    numa_mode: numaMode,
  });
  const res = await fetch(`${API_BASE}/simulate?${params}`);
  if (!res.ok) {
    throw new Error(`Simulation request failed: ${res.status}`);
  }
  return res.json();
}

export function getExportUrl(
  iterations: number,
  includeTraditional: boolean,
  pcieVersion: PcieVersion,
  gpuCount: number,
  numaMode: NumaMode
): string {
  const params = new URLSearchParams({
    iterations: String(iterations),
    include_traditional: String(includeTraditional),
    pcie_version: pcieVersion,
    gpu_count: String(gpuCount),
    numa_mode: numaMode,
  });
  return `${API_BASE}/export?${params}`;
}

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

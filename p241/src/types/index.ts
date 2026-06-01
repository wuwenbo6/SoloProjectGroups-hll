export interface PacketResult {
  packet_size: number;
  avg_bandwidth_gbps: number;
  avg_latency_us: number;
  p50_latency_us: number;
  p95_latency_us: number;
  p99_latency_us: number;
}

export type PcieVersion = "gen3" | "gen4";
export type NumaMode = "local" | "remote" | "auto";

export interface NumaModeInfo {
  label: string;
  latency_multiplier: number;
  bandwidth_penalty: number;
}

export interface SimulateConfig {
  iterations: number;
  pcie_version: string;
  gpu_count: number;
  numa_mode: string;
  numa_label: string;
  numa_latency_multiplier: number;
  numa_bandwidth_penalty: number;
  total_bandwidth_gbps: number;
  per_gpu_bandwidth_gbps: number;
  packet_sizes: number[];
  packet_size_labels: string[];
}

export interface SimulateResponse {
  rdma_results: PacketResult[];
  traditional_results: PacketResult[];
  config: SimulateConfig;
}

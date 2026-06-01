import numpy as np
from dataclasses import dataclass, asdict
from typing import List, Optional

PCIE_BANDWIDTHS = {
    "gen3": 15.75,
    "gen4": 32.0,
}
PCIE_LATENCY_MULTIPLIER = {
    "gen3": 1.0,
    "gen4": 0.85,
}
RDMA_MIN_OVERHEAD = 0.02
RDMA_MAX_OVERHEAD = 0.05
TRADITIONAL_MIN_OVERHEAD = 0.30
TRADITIONAL_MAX_OVERHEAD = 0.50
BASE_LATENCY_US = 0.5
PER_BYTE_LATENCY_NS = 0.1
TRADITIONAL_LATENCY_MULTIPLIER = 2.5

NUMA_MODES = {
    "local": {
        "label": "NUMA 本地（同 Socket）",
        "latency_multiplier": 1.0,
        "bandwidth_penalty": 0.0,
    },
    "remote": {
        "label": "NUMA 远程（跨 Socket）",
        "latency_multiplier": 1.6,
        "bandwidth_penalty": 0.15,
    },
    "auto": {
        "label": "自动（混合访问）",
        "latency_multiplier": 1.25,
        "bandwidth_penalty": 0.07,
    },
}

PACKET_SIZES = [64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216]
PACKET_SIZE_LABELS = ["64B", "256B", "1KB", "4KB", "16KB", "64KB", "256KB", "1MB", "4MB", "16MB"]


@dataclass
class PacketResult:
    packet_size: int
    avg_bandwidth_gbps: float
    avg_latency_us: float
    p50_latency_us: float
    p95_latency_us: float
    p99_latency_us: float


def _calculate_rdma_overhead(packet_size: int) -> float:
    log_min = np.log2(PACKET_SIZES[0])
    log_max = np.log2(PACKET_SIZES[-1])
    log_size = np.log2(max(packet_size, 1))
    t = (log_size - log_min) / (log_max - log_min)
    t = np.clip(t, 0.0, 1.0)
    overhead = RDMA_MAX_OVERHEAD - t * (RDMA_MAX_OVERHEAD - RDMA_MIN_OVERHEAD)
    return float(overhead)


def _calculate_traditional_overhead(packet_size: int) -> float:
    log_min = np.log2(PACKET_SIZES[0])
    log_max = np.log2(PACKET_SIZES[-1])
    log_size = np.log2(max(packet_size, 1))
    t = (log_size - log_min) / (log_max - log_min)
    t = np.clip(t, 0.0, 1.0)
    overhead = TRADITIONAL_MAX_OVERHEAD - t * (TRADITIONAL_MAX_OVERHEAD - TRADITIONAL_MIN_OVERHEAD)
    return float(overhead)


def _calculate_bandwidth_samples(
    packet_size: int, iterations: int, is_rdma: bool,
    pcie_version: str, gpu_count: int, numa_mode: str
) -> np.ndarray:
    if is_rdma:
        overhead = _calculate_rdma_overhead(packet_size)
    else:
        overhead = _calculate_traditional_overhead(packet_size)

    base_bandwidth = PCIE_BANDWIDTHS[pcie_version] * (1 - overhead)

    per_gpu_bandwidth = base_bandwidth / max(gpu_count, 1)

    contention_factor = 1.0
    if gpu_count > 1:
        contention_factor = 1.0 - (gpu_count - 1) * 0.02
        contention_factor = max(contention_factor, 0.85)
    per_gpu_bandwidth *= contention_factor

    numa_penalty = NUMA_MODES[numa_mode]["bandwidth_penalty"]
    per_gpu_bandwidth *= (1 - numa_penalty)

    noise_std = per_gpu_bandwidth * 0.03 if is_rdma else per_gpu_bandwidth * 0.06
    noise = np.random.normal(0, noise_std, iterations)

    small_packet_penalty = max(0.0, 1.0 - 0.3 * np.exp(-packet_size / 4096))
    per_gpu_bandwidth *= small_packet_penalty

    samples = per_gpu_bandwidth + noise
    samples = np.maximum(samples, 0.01)
    return samples


def _calculate_latency_samples(
    packet_size: int, iterations: int, is_rdma: bool,
    pcie_version: str, gpu_count: int, numa_mode: str
) -> np.ndarray:
    base_latency = BASE_LATENCY_US * PCIE_LATENCY_MULTIPLIER[pcie_version]
    per_byte = PER_BYTE_LATENCY_NS / 1000.0
    transfer_latency = per_byte * packet_size / PCIE_LATENCY_MULTIPLIER[pcie_version]

    if not is_rdma:
        base_latency *= TRADITIONAL_LATENCY_MULTIPLIER
        transfer_latency *= TRADITIONAL_LATENCY_MULTIPLIER

    if gpu_count > 1:
        switch_latency = (gpu_count - 1) * 0.05
        base_latency += switch_latency

    numa_multiplier = NUMA_MODES[numa_mode]["latency_multiplier"]
    base_latency *= numa_multiplier
    if numa_multiplier > 1.0:
        cross_socket_per_byte = 0.02 * (numa_multiplier - 1.0)
        transfer_latency += cross_socket_per_byte * packet_size / 1000.0

    total_latency = base_latency + transfer_latency

    noise_std = total_latency * 0.05 if is_rdma else total_latency * 0.10
    noise = np.random.normal(0, noise_std, iterations)

    samples = total_latency + noise
    samples = np.maximum(samples, 0.001)
    return samples


def simulate_packet_size(
    packet_size: int, iterations: int, is_rdma: bool,
    pcie_version: str, gpu_count: int, numa_mode: str
) -> PacketResult:
    bw_samples = _calculate_bandwidth_samples(packet_size, iterations, is_rdma, pcie_version, gpu_count, numa_mode)
    lat_samples = _calculate_latency_samples(packet_size, iterations, is_rdma, pcie_version, gpu_count, numa_mode)

    return PacketResult(
        packet_size=packet_size,
        avg_bandwidth_gbps=round(float(np.mean(bw_samples)), 3),
        avg_latency_us=round(float(np.mean(lat_samples)), 3),
        p50_latency_us=round(float(np.percentile(lat_samples, 50)), 3),
        p95_latency_us=round(float(np.percentile(lat_samples, 95)), 3),
        p99_latency_us=round(float(np.percentile(lat_samples, 99)), 3),
    )


def run_simulation(
    iterations: int = 100, include_traditional: bool = True,
    pcie_version: str = "gen4", gpu_count: int = 1, numa_mode: str = "local"
) -> dict:
    rdma_results: List[PacketResult] = []
    traditional_results: List[PacketResult] = []

    for size in PACKET_SIZES:
        rdma_results.append(simulate_packet_size(size, iterations, True, pcie_version, gpu_count, numa_mode))
        if include_traditional:
            traditional_results.append(
                simulate_packet_size(size, iterations, False, pcie_version, gpu_count, numa_mode)
            )

    return {
        "rdma_results": [asdict(r) for r in rdma_results],
        "traditional_results": [asdict(r) for r in traditional_results],
        "config": {
            "iterations": iterations,
            "pcie_version": pcie_version,
            "gpu_count": gpu_count,
            "numa_mode": numa_mode,
            "numa_label": NUMA_MODES[numa_mode]["label"],
            "numa_latency_multiplier": NUMA_MODES[numa_mode]["latency_multiplier"],
            "numa_bandwidth_penalty": NUMA_MODES[numa_mode]["bandwidth_penalty"],
            "total_bandwidth_gbps": PCIE_BANDWIDTHS[pcie_version],
            "per_gpu_bandwidth_gbps": PCIE_BANDWIDTHS[pcie_version] / max(gpu_count, 1),
            "packet_sizes": PACKET_SIZES,
            "packet_size_labels": PACKET_SIZE_LABELS,
        },
    }

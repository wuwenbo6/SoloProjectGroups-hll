"""
ITU-T P.564 MOS 映射表实现

P.564 定义了主观测试方法，但在 VoIP 质量评估实践中，P.564 映射表指根据网络损伤参数
（丢包率、抖动、编解码器类型）到 MOS 评分的映射关系。

本实现基于行业标准数据集，提供：
1. 基于丢包率 + 抖动 + 编解码器 → MOS 映射
2. 支持多种主流编解码器：G.711, G.729A, G.729, G.723.1, G.726, G.728, G.722, AMR, EVS
"""

from typing import Tuple


_CODEC_PARAMS = {
    "G.711": {
        "description": "PCM 64kbps",
        "packetization_ms": 20,
        "base_mos": 4.4,
    },
    "G.729A": {
        "description": "CS-ACELP 8kbps",
        "packetization_ms": 20,
        "base_mos": 4.1,
    },
    "G.729": {
        "description": "CS-ACELP 8kbps",
        "packetization_ms": 20,
        "base_mos": 4.0,
    },
    "G.723.1": {
        "description": "ACELP/MP-MLQ 6.3/5.3kbps",
        "packetization_ms": 30,
        "base_mos": 3.9,
    },
    "G.726": {
        "description": "ADPCM 16-40kbps",
        "packetization_ms": 20,
        "base_mos": 4.2,
    },
    "G.728": {
        "description": "LD-CELP 16kbps",
        "packetization_ms": 5,
        "base_mos": 4.0,
    },
    "G.722": {
        "description": "SB-ADPCM 64kbps",
        "packetization_ms": 20,
        "base_mos": 4.3,
    },
    "AMR": {
        "description": "ACELP 4.75-12.2kbps",
        "packetization_ms": 20,
        "base_mos": 4.0,
    },
    "EVS": {
        "description": "Enhanced Voice Services",
        "packetization_ms": 20,
        "base_mos": 4.5,
    },
}


_P564_LOSS_MAPPING = {
    "G.711": [
        (0.0, 4.45), (0.5, 4.40), (1.0, 4.30), (1.5, 4.15), (2.0, 3.95),
        (2.5, 3.70), (3.0, 3.45), (3.5, 3.20), (4.0, 2.95), (4.5, 2.75),
        (5.0, 2.60), (6.0, 2.40), (7.0, 2.25), (8.0, 2.10), (9.0, 2.00),
        (10.0, 1.90), (12.0, 1.75), (15.0, 1.60), (20.0, 1.40), (25.0, 1.20), (30.0, 1.10),
    ],
    "G.729A": [
        (0.0, 4.15), (0.5, 4.10), (1.0, 4.00), (1.5, 3.85), (2.0, 3.65),
        (2.5, 3.40), (3.0, 3.15), (3.5, 2.95), (4.0, 2.75), (4.5, 2.60),
        (5.0, 2.45), (6.0, 2.30), (7.0, 2.15), (8.0, 2.05), (9.0, 1.95),
        (10.0, 1.85), (12.0, 1.70), (15.0, 1.55), (20.0, 1.35), (25.0, 1.20), (30.0, 1.10),
    ],
    "G.729": [
        (0.0, 4.05), (0.5, 4.00), (1.0, 3.90), (1.5, 3.75), (2.0, 3.55),
        (2.5, 3.30), (3.0, 3.05), (3.5, 2.85), (4.0, 2.65), (4.5, 2.50),
        (5.0, 2.35), (6.0, 2.20), (7.0, 2.05), (8.0, 1.95), (9.0, 1.85),
        (10.0, 1.75), (12.0, 1.60), (15.0, 1.45), (20.0, 1.30), (25.0, 1.15), (30.0, 1.10),
    ],
    "G.723.1": [
        (0.0, 3.95), (0.5, 3.90), (1.0, 3.80), (1.5, 3.65), (2.0, 3.45),
        (2.5, 3.20), (3.0, 2.95), (3.5, 2.75), (4.0, 2.55), (4.5, 2.40),
        (5.0, 2.25), (6.0, 2.10), (7.0, 2.00), (8.0, 1.90), (9.0, 1.80),
        (10.0, 1.70), (12.0, 1.55), (15.0, 1.40), (20.0, 1.25), (25.0, 1.15), (30.0, 1.10),
    ],
    "G.726": [
        (0.0, 4.25), (0.5, 4.20), (1.0, 4.10), (1.5, 3.95), (2.0, 3.75),
        (2.5, 3.50), (3.0, 3.25), (3.5, 3.05), (4.0, 2.85), (4.5, 2.65),
        (5.0, 2.50), (6.0, 2.30), (7.0, 2.15), (8.0, 2.05), (9.0, 1.95),
        (10.0, 1.85), (12.0, 1.70), (15.0, 1.55), (20.0, 1.35), (25.0, 1.20), (30.0, 1.10),
    ],
    "G.728": [
        (0.0, 4.05), (0.5, 4.00), (1.0, 3.90), (1.5, 3.75), (2.0, 3.55),
        (2.5, 3.30), (3.0, 3.05), (3.5, 2.85), (4.0, 2.65), (4.5, 2.50),
        (5.0, 2.35), (6.0, 2.20), (7.0, 2.05), (8.0, 1.95), (9.0, 1.85),
        (10.0, 1.75), (12.0, 1.60), (15.0, 1.45), (20.0, 1.30), (25.0, 1.15), (30.0, 1.10),
    ],
    "G.722": [
        (0.0, 4.35), (0.5, 4.30), (1.0, 4.20), (1.5, 4.05), (2.0, 3.85),
        (2.5, 3.60), (3.0, 3.35), (3.5, 3.15), (4.0, 2.90), (4.5, 2.70),
        (5.0, 2.55), (6.0, 2.35), (7.0, 2.20), (8.0, 2.05), (9.0, 1.95),
        (10.0, 1.85), (12.0, 1.70), (15.0, 1.55), (20.0, 1.35), (25.0, 1.20), (30.0, 1.10),
    ],
    "AMR": [
        (0.0, 4.05), (0.5, 4.00), (1.0, 3.90), (1.5, 3.75), (2.0, 3.55),
        (2.5, 3.30), (3.0, 3.05), (3.5, 2.85), (4.0, 2.65), (4.5, 2.50),
        (5.0, 2.35), (6.0, 2.20), (7.0, 2.05), (8.0, 1.95), (9.0, 1.85),
        (10.0, 1.75), (12.0, 1.60), (15.0, 1.45), (20.0, 1.30), (25.0, 1.15), (30.0, 1.10),
    ],
    "EVS": [
        (0.0, 4.50), (0.5, 4.45), (1.0, 4.35), (1.5, 4.25), (2.0, 4.10),
        (2.5, 3.85), (3.0, 3.65), (3.5, 3.45), (4.0, 3.25), (4.5, 3.05),
        (5.0, 2.90), (6.0, 2.65), (7.0, 2.50), (8.0, 2.35), (9.0, 2.20),
        (10.0, 2.05), (12.0, 1.85), (15.0, 1.65), (20.0, 1.40), (25.0, 1.20), (30.0, 1.10),
    ],
}


_JITTER_PENALTY = [
    (0, 0.00), (10, 0.00), (20, 0.05), (30, 0.10), (40, 0.15), (50, 0.20),
    (60, 0.25), (70, 0.30), (80, 0.35), (90, 0.40), (100, 0.45),
    (120, 0.50), (150, 0.55), (180, 0.60), (200, 0.65), (250, 0.70),
    (300, 0.75), (400, 0.80), (500, 0.85), (600, 0.90), (800, 0.95), (1000, 1.00),
]


def _interpolate(x: float, points) -> float:
    if x <= points[0][0]:
        return points[0][1]
    if x >= points[-1][0]:
        return points[-1][1]
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        if x0 <= x <= x1:
            t = (x - x0) / (x1 - x0)
            return y0 + t * (y1 - y0)
    return points[-1][1]


def get_codec_list() -> list:
    return sorted(_CODEC_PARAMS.keys())


def get_codec_params(codec: str) -> dict:
    return _CODEC_PARAMS.get(codec, _CODEC_PARAMS["G.711"])


def estimate_mos_p564(
    loss_rate: float,
    jitter_delay: float,
    codec: str = "G.711",
) -> dict:
    """
    基于 P.564 映射表估算 MOS 评分
    
    Args:
        loss_rate: 丢包率 (0-100%)
        jitter_delay: 抖动缓冲延迟 (ms)
        codec: 编解码器类型
    
    Returns:
        dict: 包含各项指标的字典
            - mos: 综合 MOS 评分 (1.0-4.5)
            - loss_component: 丢包分量
            - jitter_component: 抖动分量
            - codec: 使用的编解码器
            - base_mos: 编解码器基础 MOS
    """
    codec = codec if codec in _P564_LOSS_MAPPING else "G.711"
    
    loss_map = _P564_LOSS_MAPPING[codec]
    base_mos = _CODEC_PARAMS[codec]["base_mos"]
    
    loss_rate_clamped = max(0.0, min(100.0, float(loss_rate)))
    jitter_clamped = max(0.0, min(1000.0, float(jitter_delay)))
    
    loss_mos = _interpolate(loss_rate_clamped, loss_map)
    
    jitter_penalty = _interpolate(jitter_clamped, _JITTER_PENALTY)
    
    final_mos = max(1.0, min(4.5, round(loss_mos - jitter_penalty, 2)))
    
    return {
        "mos": final_mos,
        "loss_component": round(loss_mos, 2),
        "jitter_penalty": round(jitter_penalty, 2),
        "codec": codec,
        "base_mos": base_mos,
        "loss_rate": round(loss_rate_clamped, 2),
        "jitter_delay": round(jitter_clamped, 2),
    }


def estimate_mos_p564_detailed(
    loss_rate: float,
    jitter_delay: float,
    codec: str = "G.711",
) -> dict:
    """
    详细版 P.564 MOS 估算，返回所有编解码器对比
    """
    primary = estimate_mos_p564(loss_rate, jitter_delay, codec)
    
    comparisons = {}
    for c in ["G.711", "G.729A", "G.723.1", "EVS"]:
        if c != codec:
            comparisons[c] = estimate_mos_p564(loss_rate, jitter_delay, c)["mos"]
    
    primary["comparisons"] = comparisons
    return primary


EQUIPMENT_IMPAIRMENT = {
    "G.711": 0,
    "G.729A": 11,
    "G.729": 8,
    "G.726": 7,
    "G.728": 7,
    "G.722": 4,
    "default": 10,
}


def estimate_mos_from_r(r_factor: float) -> float:
    if r_factor <= 0:
        return 1.0
    mos = 1 + 0.035 * r_factor + 7e-6 * r_factor * (r_factor - 60) * (100 - r_factor)
    return max(1.0, min(4.5, round(mos, 2)))


def estimate_r_factor(loss_rate: float, jitter_delay: float, codec: str = "default") -> float:
    ie = EQUIPMENT_IMPAIRMENT.get(codec, EQUIPMENT_IMPAIRMENT["default"])
    ie_eff = ie + (95 - ie) * (loss_rate / 100.0)

    id_value = 0.024 * jitter_delay + 0.11 * jitter_delay * (loss_rate - 0.024 * jitter_delay)
    if id_value < 0:
        id_value = 0.0

    r = 93.2 - ie_eff - id_value
    return max(0, min(100, round(r, 2)))

import numpy as np
from typing import Optional, Tuple, Dict


def downsample_large_image(pixel_array: np.ndarray, max_size: int = 512) -> np.ndarray:
    rows, cols = pixel_array.shape
    if rows <= max_size and cols <= max_size:
        return pixel_array
    row_factor = max(1, rows // max_size)
    col_factor = max(1, cols // max_size)
    return pixel_array[::row_factor, ::col_factor]


def compute_histogram(
    pixel_array: np.ndarray,
    num_bins: int = 256,
    value_range: Optional[Tuple[float, float]] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    if value_range is None:
        min_val = float(pixel_array.min())
        max_val = float(pixel_array.max())
    else:
        min_val, max_val = value_range

    if min_val == max_val:
        bins = np.linspace(min_val, min_val + 1, num_bins + 1)
        counts = np.zeros(num_bins, dtype=np.int64)
        counts[0] = pixel_array.size
        return bins, counts

    bins = np.linspace(min_val, max_val, num_bins + 1)
    counts, _ = np.histogram(pixel_array.ravel(), bins=bins)
    return bins, counts


def otsu_threshold(pixel_array: np.ndarray, num_bins: int = 256) -> float:
    bins, counts = compute_histogram(pixel_array, num_bins=num_bins)
    total = counts.sum()
    if total == 0:
        return float(pixel_array.mean())

    probs = counts.astype(np.float64) / total
    cum_probs = np.cumsum(probs)
    bin_centers = (bins[:-1] + bins[1:]) / 2.0
    cum_means = np.cumsum(probs * bin_centers)
    global_mean = cum_means[-1]

    var_between = np.zeros(len(probs))
    for t in range(len(probs) - 1):
        p0 = cum_probs[t]
        p1 = 1.0 - p0
        if p0 <= 0 or p1 <= 0:
            continue
        mean0 = cum_means[t] / p0
        mean1 = (global_mean - cum_means[t]) / p1
        var_between[t] = p0 * p1 * (mean0 - mean1) ** 2

    best_t = int(np.argmax(var_between))
    threshold = float(bin_centers[best_t])
    return threshold


def max_entropy_threshold_in_range(
    pixel_array: np.ndarray,
    value_range: Tuple[float, float],
    num_bins: int = 256,
) -> float:
    bins, counts = compute_histogram(pixel_array, num_bins=num_bins, value_range=value_range)
    total = counts.sum()
    if total == 0:
        return (value_range[0] + value_range[1]) / 2.0

    probs = counts.astype(np.float64) / total
    cum_probs = np.cumsum(probs)
    cum_probs_rev = np.cumsum(probs[::-1])[::-1]

    best_t = 0
    best_entropy = -1.0

    for t in range(len(probs)):
        p0 = cum_probs[t]
        p1 = cum_probs_rev[t + 1] if t + 1 < len(probs) else 0.0

        if p0 <= 1e-6 or p1 <= 1e-6:
            continue

        h0 = 0.0
        for i in range(t + 1):
            if probs[i] > 0:
                pi = probs[i] / p0
                h0 -= pi * np.log(pi + 1e-12)

        h1 = 0.0
        for i in range(t + 1, len(probs)):
            if probs[i] > 0:
                pi = probs[i] / p1
                h1 -= pi * np.log(pi + 1e-12)

        total_entropy = h0 + h1
        if total_entropy > best_entropy:
            best_entropy = total_entropy
            best_t = t

    bin_centers = (bins[:-1] + bins[1:]) / 2.0
    threshold = float(bin_centers[best_t])
    return threshold


def compute_optimized_window(pixel_array: np.ndarray) -> Dict[str, float]:
    downsampled = downsample_large_image(pixel_array, max_size=512)

    otsu_thresh = otsu_threshold(downsampled, num_bins=256)

    foreground_mask = downsampled >= otsu_thresh
    fg_count = foreground_mask.sum()

    if fg_count > downsampled.size * 0.05:
        foreground_pixels = downsampled[foreground_mask]
        fg_min = float(np.percentile(foreground_pixels, 1))
        fg_max = float(np.percentile(foreground_pixels, 99))

        entropy_thresh = max_entropy_threshold_in_range(
            downsampled,
            value_range=(fg_min, fg_max),
            num_bins=256,
        )

        soft_mask = downsampled >= entropy_thresh
        if soft_mask.sum() > 1:
            soft_fg = downsampled[soft_mask]
            center = float(np.mean(soft_fg))
            std_fg = float(np.std(soft_fg))
            width = max(std_fg * 4.0, 1.0)
        else:
            center = entropy_thresh
            width = max(float(downsampled.std()) * 2.0, 1.0)
    else:
        center = float(downsampled.mean())
        width = max(float(downsampled.std()) * 2.0, 1.0)

    return {
        "center": round(center, 2),
        "width": round(width, 2),
    }

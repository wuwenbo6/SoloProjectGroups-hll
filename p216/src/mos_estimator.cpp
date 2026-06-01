#include "common.h"
#include <cmath>
#include <algorithm>
#include <numeric>

double MosEstimator::compute_segmental_snr(const std::vector<int16_t>& original,
                                            const std::vector<int16_t>& degraded,
                                            int segment_samples) {
    int len = std::min(static_cast<int>(original.size()), static_cast<int>(degraded.size()));
    int num_segments = len / segment_samples;
    
    if (num_segments <= 0) return 0.0;
    
    double total_snr = 0.0;
    int valid_segments = 0;
    
    for (int seg = 0; seg < num_segments; seg++) {
        int start = seg * segment_samples;
        
        double signal_energy = 0.0;
        double noise_energy = 0.0;
        
        for (int i = 0; i < segment_samples; i++) {
            double s = static_cast<double>(original[start + i]);
            double d = static_cast<double>(degraded[start + i]);
            double noise = s - d;
            
            signal_energy += s * s;
            noise_energy += noise * noise;
        }
        
        if (noise_energy > 0.0 && signal_energy > 0.0) {
            double seg_snr = 10.0 * std::log10(signal_energy / noise_energy);
            seg_snr = std::max(-10.0, std::min(50.0, seg_snr));
            total_snr += seg_snr;
            valid_segments++;
        }
    }
    
    return valid_segments > 0 ? total_snr / valid_segments : 0.0;
}

double MosEstimator::compute_pesq_like(const std::vector<int16_t>& original,
                                        const std::vector<int16_t>& degraded) {
    int len = std::min(static_cast<int>(original.size()), static_cast<int>(degraded.size()));
    if (len == 0) return 1.0;
    
    double seg_snr = compute_segmental_snr(original, degraded, 160);
    
    int bark_len = len / 2;
    double spectral_dist = 0.0;
    int bark_bands = 0;
    
    const int band_sizes[] = {2, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 12, 14, 16, 20};
    const int num_bands = 20;
    
    int pos = 0;
    for (int band = 0; band < num_bands && pos < bark_len; band++) {
        int band_size = band_sizes[band];
        int end = std::min(pos + band_size, bark_len);
        
        double orig_energy = 0.0;
        double deg_energy = 0.0;
        
        for (int i = pos; i < end; i++) {
            double o = static_cast<double>(original[i * 2]);
            double d = static_cast<double>(degraded[i * 2]);
            orig_energy += o * o;
            deg_energy += d * d;
        }
        
        if (orig_energy > 0.0) {
            double ratio = deg_energy / orig_energy;
            double db_diff = 10.0 * std::log10(std::max(ratio, 1e-10));
            spectral_dist += db_diff * db_diff;
            bark_bands++;
        }
        
        pos = end;
    }
    
    if (bark_bands > 0) {
        spectral_dist = std::sqrt(spectral_dist / bark_bands);
    }
    
    int64_t loss_count = 0;
    for (int i = 0; i < len; i += FRAME_SIZE) {
        double seg_energy = 0.0;
        for (int j = i; j < std::min(i + FRAME_SIZE, len); j++) {
            seg_energy += static_cast<double>(degraded[j]) * degraded[j];
        }
        if (seg_energy < 1.0) loss_count++;
    }
    
    double loss_ratio = static_cast<double>(loss_count * FRAME_SIZE) / len;
    
    double pesq = 4.5;
    pesq -= 0.08 * std::max(0.0, -seg_snr);
    pesq -= 0.015 * spectral_dist;
    pesq -= 3.0 * loss_ratio;
    
    double seg_snr_clamped = std::max(-5.0, std::min(30.0, seg_snr));
    pesq = pesq * 0.5 + (1.0 + seg_snr_clamped / 10.0) * 0.5;
    
    pesq = std::max(1.0, std::min(4.5, pesq));
    
    return pesq;
}

double MosEstimator::snr_to_mos(double seg_snr) {
    double mos = 1.0 + 0.035 * seg_snr;
    mos = std::max(1.0, std::min(5.0, mos));
    return mos;
}

double MosEstimator::pesq_to_mos(double pesq) {
    double mos = 1.0 + 0.335 * pesq + 0.117 * pesq * pesq - 0.013 * pesq * pesq * pesq;
    mos = std::max(1.0, std::min(4.5, mos));
    return mos;
}

MosResult MosEstimator::estimate(const std::vector<int16_t>& original,
                                  const std::vector<int16_t>& no_plc,
                                  const std::vector<int16_t>& with_plc) {
    MosResult result;
    
    result.seg_snr_no_plc = compute_segmental_snr(original, no_plc);
    result.seg_snr_with_plc = compute_segmental_snr(original, with_plc);
    
    result.pesq_like_no_plc = compute_pesq_like(original, no_plc);
    result.pesq_like_with_plc = compute_pesq_like(original, with_plc);
    
    double mos_snr_no_plc = snr_to_mos(result.seg_snr_no_plc);
    double mos_snr_with_plc = snr_to_mos(result.seg_snr_with_plc);
    double mos_pesq_no_plc = pesq_to_mos(result.pesq_like_no_plc);
    double mos_pesq_with_plc = pesq_to_mos(result.pesq_like_with_plc);
    
    result.mos_no_plc = 0.4 * mos_snr_no_plc + 0.6 * mos_pesq_no_plc;
    result.mos_with_plc = 0.4 * mos_snr_with_plc + 0.6 * mos_pesq_with_plc;
    
    result.mos_no_plc = std::max(1.0, std::min(4.5, result.mos_no_plc));
    result.mos_with_plc = std::max(1.0, std::min(4.5, result.mos_with_plc));
    
    return result;
}

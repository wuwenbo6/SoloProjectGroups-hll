#include "common.h"
#include <cmath>
#include <cstring>
#include <algorithm>

G729Decoder::G729Decoder()
    : prev_frame_(FRAME_SIZE, 0)
    , excitation_history_(MAX_PITCH_LAG + FRAME_SIZE, 0)
    , has_prev_frame_(false)
    , synth_history_ptr_(0)
    , rng_(54321) {
    prev_lpc_.fill(0.0);
    prev_prev_lpc_.fill(0.0);
    synth_history_.fill(0);
}

void G729Decoder::reset() {
    std::fill(prev_frame_.begin(), prev_frame_.end(), 0);
    std::fill(excitation_history_.begin(), excitation_history_.end(), 0);
    prev_lpc_.fill(0.0);
    prev_prev_lpc_.fill(0.0);
    synth_history_.fill(0);
    synth_history_ptr_ = 0;
    has_prev_frame_ = false;
    plc_state_ = PlcState();
}

static int16_t dequantize_lsp(uint8_t quant_idx, int lsp_index) {
    return LSP_QUANT_TABLE[lsp_index][quant_idx];
}

static void lsp_to_lpc(const int16_t lsp[10], double lpc[11]) {
    double f[10];
    for (int i = 0; i < 10; i++) {
        f[i] = static_cast<double>(lsp[i]) * 1000.0 * M_PI / (4000.0 * 256.0);
    }

    double p[6] = {1, 0, 0, 0, 0, 0};
    double q[6] = {1, 0, 0, 0, 0, 0};

    for (int i = 0; i < 5; i++) {
        double cos_2w = 2.0 * std::cos(2.0 * f[2*i]);
        p[i+1] = -cos_2w;
        for (int j = i; j >= 1; j--) {
            p[j] = p[j] - cos_2w * p[j-1] + p[j-1] * (j > 1 ? p[j-2] : 0);
        }
    }

    for (int i = 0; i < 5; i++) {
        double cos_2w = 2.0 * std::cos(2.0 * f[2*i+1]);
        q[i+1] = -cos_2w;
        for (int j = i; j >= 1; j--) {
            q[j] = q[j] - cos_2w * q[j-1] + q[j-1] * (j > 1 ? q[j-2] : 0);
        }
    }

    double a1[11], a2[11];
    for (int i = 0; i <= 5; i++) {
        a1[i] = p[i];
        a1[10-i] = p[i];
    }
    for (int i = 0; i <= 5; i++) {
        a2[i] = q[i];
        a2[10-i] = -q[i];
    }

    for (int i = 1; i <= 10; i++) {
        lpc[i] = 0.5 * (a1[i] + a2[i]);
    }
    lpc[0] = 1.0;
}

int G729Decoder::estimate_pitch_lag(const std::vector<int16_t>& signal) {
    int best_lag = 40;
    int64_t max_corr = 0;
    int64_t max_energy = 0;
    
    int start = std::max(0, (int)signal.size() - FRAME_SIZE * 2);
    
    for (int lag = MIN_PITCH_LAG; lag <= MAX_PITCH_LAG; lag++) {
        int64_t corr = 0;
        int64_t energy = 0;
        
        for (int i = start + lag; i < (int)signal.size(); i++) {
            corr += (int32_t)signal[i] * signal[i - lag];
            energy += (int32_t)signal[i - lag] * signal[i - lag];
        }
        
        if (corr > max_corr && energy > 0) {
            int64_t normalized = (corr * corr) / energy;
            if (normalized > max_energy) {
                max_energy = normalized;
                best_lag = lag;
            }
        }
    }
    
    return best_lag;
}

double G729Decoder::calculate_energy(const std::vector<int16_t>& signal) {
    double energy = 0.0;
    int start = std::max(0, (int)signal.size() - FRAME_SIZE);
    
    for (int i = start; i < (int)signal.size(); i++) {
        energy += (double)signal[i] * signal[i];
    }
    
    return std::sqrt(energy / FRAME_SIZE);
}

void G729Decoder::update_synth_history(const std::vector<int16_t>& frame) {
    for (int16_t sample : frame) {
        synth_history_[synth_history_ptr_] = sample;
        synth_history_ptr_ = (synth_history_ptr_ + 1) % MAX_PITCH_LAG;
    }
}

std::vector<int16_t> G729Decoder::do_plc_periodic() {
    std::vector<int16_t> plc_frame(FRAME_SIZE, 0);
    
    if (!has_prev_frame_) {
        return plc_frame;
    }
    
    if (plc_state_.consecutive_lost_frames == 0) {
        plc_state_.last_pitch_lag = estimate_pitch_lag(prev_frame_);
        plc_state_.last_energy = calculate_energy(prev_frame_);
        plc_state_.attenuation = 1.0;
        
        int lag = plc_state_.last_pitch_lag;
        plc_state_.pitch_cycle.resize(lag);
        
        int start = (int)prev_frame_.size() - lag;
        if (start < 0) start = 0;
        
        for (int i = 0; i < lag; i++) {
            if (start + i < (int)prev_frame_.size()) {
                plc_state_.pitch_cycle[i] = prev_frame_[start + i];
            }
        }
    }
    
    plc_state_.consecutive_lost_frames++;
    
    double per_frame_attenuation = std::pow(0.85, plc_state_.consecutive_lost_frames);
    plc_state_.attenuation = std::min(1.0, per_frame_attenuation);
    
    int pitch_lag = plc_state_.last_pitch_lag;
    const auto& pitch_cycle = plc_state_.pitch_cycle;
    
    if (pitch_cycle.empty()) {
        return plc_frame;
    }
    
    for (int i = 0; i < FRAME_SIZE; i++) {
        int cycle_idx = i % pitch_lag;
        
        double sample = 0.0;
        if (cycle_idx < (int)pitch_cycle.size()) {
            sample = pitch_cycle[cycle_idx];
        }
        
        double fade = 1.0;
        if (i < 10) {
            fade = (double)i / 10.0;
        }
        
        if (i > FRAME_SIZE - 10) {
            fade = (double)(FRAME_SIZE - i) / 10.0;
        }
        
        double total_attenuation = plc_state_.attenuation * (0.7 + 0.3 * fade);
        
        plc_frame[i] = static_cast<int16_t>(std::clamp(
            sample * total_attenuation, -32768.0, 32767.0
        ));
    }
    
    double current_energy = calculate_energy(plc_frame);
    if (current_energy > 0 && plc_state_.last_energy > 0) {
        double scale = plc_state_.last_energy * plc_state_.attenuation / current_energy;
        scale = std::max(0.5, std::min(1.5, scale));
        
        for (int i = 0; i < FRAME_SIZE; i++) {
            plc_frame[i] = static_cast<int16_t>(std::clamp(
                (double)plc_frame[i] * scale, -32768.0, 32767.0
            ));
        }
    }
    
    return plc_frame;
}

std::vector<int16_t> G729Decoder::decode(const G729Frame& frame, bool use_plc) {
    std::vector<int16_t> output(FRAME_SIZE, 0);

    if (frame.lost) {
        if (use_plc && has_prev_frame_) {
            output = do_plc_periodic();
        } else {
            std::fill(output.begin(), output.end(), 0);
            plc_state_.consecutive_lost_frames++;
        }
    } else {
        plc_state_.consecutive_lost_frames = 0;
        
        int16_t lsp[10];
        for (int i = 0; i < 10; i++) {
            lsp[i] = dequantize_lsp(frame.lsp[i], i);
        }

        double lpc[11];
        lsp_to_lpc(lsp, lpc);
        
        for (int i = 0; i < LPC_ORDER; i++) {
            prev_prev_lpc_[i] = prev_lpc_[i];
            prev_lpc_[i] = lpc[i + 1];
        }

        int16_t excitation[FRAME_SIZE];
        std::memset(excitation, 0, sizeof(excitation));

        int pitch_lag = frame.adaptive_codebook_lag + 20;
        double ac_gain = static_cast<double>(frame.adaptive_codebook_gain) / 256.0;

        for (int i = 0; i < FRAME_SIZE; i++) {
            if (i < pitch_lag && has_prev_frame_) {
                int prev_idx = prev_frame_.size() - pitch_lag + i;
                if (prev_idx >= 0 && prev_idx < (int)prev_frame_.size()) {
                    excitation[i] = static_cast<int16_t>(prev_frame_[prev_idx] * ac_gain);
                }
            } else if (i >= pitch_lag) {
                excitation[i] = static_cast<int16_t>(excitation[i - pitch_lag] * ac_gain);
            }
        }

        int cb_index = frame.fixed_codebook_index;
        double fc_gain = static_cast<double>(frame.fixed_codebook_gain) / 256.0;
        for (int subframe = 0; subframe < 2; subframe++) {
            for (int i = 0; i < 40; i++) {
                int idx = subframe * 40 + i;
                excitation[idx] += static_cast<int16_t>(FIXED_CODEBOOK[cb_index][i] * fc_gain);
            }
        }

        int16_t synth[FRAME_SIZE];
        std::memset(synth, 0, sizeof(synth));

        for (int i = 0; i < FRAME_SIZE; i++) {
            double sum = excitation[i];
            
            for (int j = 1; j <= LPC_ORDER && i - j >= 0; j++) {
                sum -= lpc[j] * synth[i - j];
            }
            
            for (int j = 1; j <= LPC_ORDER && i - j < 0 && has_prev_frame_; j++) {
                int prev_idx = prev_frame_.size() + (i - j);
                if (prev_idx >= 0 && prev_idx < (int)prev_frame_.size()) {
                    sum -= lpc[j] * prev_frame_[prev_idx];
                }
            }
            
            synth[i] = static_cast<int16_t>(std::clamp(sum, -32768.0, 32767.0));
        }

        if (has_prev_frame_) {
            for (int i = 0; i < FRAME_SIZE; i++) {
                double fade_in = (double)i / FRAME_SIZE;
                double fade_out = 1.0 - fade_in;
                int prev_idx = prev_frame_.size() - FRAME_SIZE + i;
                if (prev_idx >= 0 && prev_idx < (int)prev_frame_.size()) {
                    int16_t prev_sample = prev_frame_[prev_idx];
                    synth[i] = static_cast<int16_t>(
                        prev_sample * fade_out * 0.1 + synth[i] * (1.0 - fade_out * 0.1)
                    );
                }
            }
        }

        std::copy(synth, synth + FRAME_SIZE, output.begin());
    }

    prev_frame_ = output;
    has_prev_frame_ = true;
    update_synth_history(output);

    return output;
}

std::vector<int16_t> G729Decoder::decode_buffer(const std::vector<G729Frame>& frames, bool use_plc) {
    std::vector<int16_t> output;
    output.reserve(frames.size() * FRAME_SIZE);

    reset();

    for (const auto& frame : frames) {
        auto decoded = decode(frame, use_plc);
        output.insert(output.end(), decoded.begin(), decoded.end());
    }

    return output;
}

#pragma once

#include <cstdint>
#include <vector>
#include <random>
#include <array>
#include <string>

constexpr int FRAME_SIZE = 80;
constexpr int SAMPLE_RATE = 8000;
constexpr int FRAME_DURATION_MS = 10;
constexpr int LPC_ORDER = 10;
constexpr int MAX_PITCH_LAG = 147;
constexpr int MIN_PITCH_LAG = 20;

extern int16_t FIXED_CODEBOOK[128][40];
extern const int16_t LSP_QUANT_TABLE[10][32];

enum class LossPattern {
    RANDOM = 0,
    BURST_GILBERT = 1,
    PERIODIC = 2,
    GRADUAL = 3
};

struct G729Frame {
    uint8_t lsp[10];
    uint8_t fixed_codebook_index;
    uint8_t fixed_codebook_gain;
    uint8_t adaptive_codebook_lag;
    uint8_t adaptive_codebook_gain;
    bool lost;
};

struct PlcState {
    int consecutive_lost_frames;
    int last_pitch_lag;
    double last_energy;
    double attenuation;
    std::vector<int16_t> pitch_cycle;
    
    PlcState() : consecutive_lost_frames(0), last_pitch_lag(40), 
                 last_energy(0.0), attenuation(1.0) {}
};

struct MosResult {
    double mos_no_plc;
    double mos_with_plc;
    double seg_snr_no_plc;
    double seg_snr_with_plc;
    double pesq_like_no_plc;
    double pesq_like_with_plc;
};

class G729Encoder {
public:
    G729Encoder();
    G729Frame encode(const std::vector<int16_t>& frame);
    std::vector<G729Frame> encode_buffer(const std::vector<int16_t>& buffer);
    void reset();

private:
    std::mt19937 rng_;
    std::vector<int16_t> input_history_;
    std::array<double, LPC_ORDER> prev_lpc_;
    int16_t prev_lsp_[10];
};

class G729Decoder {
public:
    G729Decoder();
    std::vector<int16_t> decode(const G729Frame& frame, bool use_plc = false);
    std::vector<int16_t> decode_buffer(const std::vector<G729Frame>& frames, bool use_plc = false);
    void reset();

private:
    std::vector<int16_t> prev_frame_;
    std::vector<int16_t> excitation_history_;
    std::array<double, LPC_ORDER> prev_lpc_;
    std::array<double, LPC_ORDER> prev_prev_lpc_;
    std::array<int16_t, MAX_PITCH_LAG> synth_history_;
    int synth_history_ptr_;
    bool has_prev_frame_;
    PlcState plc_state_;
    std::mt19937 rng_;
    
    std::vector<int16_t> do_plc_periodic();
    int estimate_pitch_lag(const std::vector<int16_t>& signal);
    double calculate_energy(const std::vector<int16_t>& signal);
    void update_synth_history(const std::vector<int16_t>& frame);
};

class PacketLossSimulator {
public:
    explicit PacketLossSimulator(double loss_rate = 0.05, uint32_t seed = 42);
    void set_loss_rate(double rate);
    void set_loss_pattern(LossPattern pattern);
    double get_loss_rate() const { return loss_rate_; }
    LossPattern get_loss_pattern() const { return pattern_; }
    std::vector<G729Frame> simulate(const std::vector<G729Frame>& frames);
    bool should_drop();
    void reset_state();

private:
    double loss_rate_;
    LossPattern pattern_;
    std::mt19937 rng_;
    std::uniform_real_distribution<double> dist_;
    
    bool gilbert_in_burst_;
    int periodic_counter_;
    int frame_counter_;
    int burst_length_;
    
    bool should_drop_random();
    bool should_drop_gilbert();
    bool should_drop_periodic();
    bool should_drop_gradual();
};

class MosEstimator {
public:
    static MosResult estimate(const std::vector<int16_t>& original,
                              const std::vector<int16_t>& no_plc,
                              const std::vector<int16_t>& with_plc);
    
    static double compute_segmental_snr(const std::vector<int16_t>& original,
                                        const std::vector<int16_t>& degraded,
                                        int segment_samples = 160);
    
    static double compute_pesq_like(const std::vector<int16_t>& original,
                                    const std::vector<int16_t>& degraded);
    
    static double snr_to_mos(double seg_snr);
    static double pesq_to_mos(double pesq);
};

std::vector<int16_t> generate_test_signal(int duration_ms, int sample_rate = SAMPLE_RATE);

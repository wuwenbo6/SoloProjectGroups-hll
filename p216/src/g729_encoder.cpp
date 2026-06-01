#include "common.h"
#include <cmath>
#include <cstring>
#include <algorithm>

int16_t FIXED_CODEBOOK[128][40];
static bool codebook_initialized = false;

static void init_fixed_codebook() {
    if (codebook_initialized) return;
    codebook_initialized = true;

    std::mt19937 rng(42);
    std::uniform_int_distribution<int16_t> dist(-1000, 1000);

    for (int j = 0; j < 128; j++) {
        double freq = (j + 1) * 50.0;
        for (int i = 0; i < 40; i++) {
            double t = static_cast<double>(i) / 8000.0;
            double val = 500.0 * std::sin(2.0 * M_PI * freq * t)
                        + 200.0 * std::sin(2.0 * M_PI * freq * 3.0 * t)
                        + 100.0 * (static_cast<double>(dist(rng)) / 1000.0);
            FIXED_CODEBOOK[j][i] = static_cast<int16_t>(std::clamp(val, -1000.0, 1000.0));
        }
    }
}

const int16_t LSP_QUANT_TABLE[10][32] = {
    {100,150,200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650},
    {200,250,300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750},
    {300,350,400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850},
    {400,450,500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950},
    {500,550,600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050},
    {600,650,700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150},
    {700,750,800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250},
    {800,850,900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350},
    {900,950,1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350,2400,2450},
    {1000,1050,1100,1150,1200,1250,1300,1350,1400,1450,1500,1550,1600,1650,1700,1750,1800,1850,1900,1950,2000,2050,2100,2150,2200,2250,2300,2350,2400,2450,2500,2550}
};

G729Encoder::G729Encoder() : rng_(12345) {
    init_fixed_codebook();
    reset();
}

void G729Encoder::reset() {
    std::fill(prev_lsp_, prev_lsp_ + 10, 0);
    input_history_.clear();
    input_history_.reserve(FRAME_SIZE * 2);
    prev_lpc_.fill(0.0);
}

static int find_best_match(const int16_t* target, int* best_gain) {
    int best_index = 0;
    int64_t best_correlation = 0;
    int64_t cb_energy[128] = {0};

    for (int j = 0; j < 128; j++) {
        int64_t correlation = 0;
        for (int i = 0; i < 40; i++) {
            correlation += (int32_t)target[i] * FIXED_CODEBOOK[j][i];
            cb_energy[j] += (int32_t)FIXED_CODEBOOK[j][i] * FIXED_CODEBOOK[j][i];
        }
        if (j == 0 || correlation > best_correlation) {
            best_correlation = correlation;
            best_index = j;
        }
    }

    if (cb_energy[best_index] > 0) {
        *best_gain = static_cast<int>((best_correlation * 256) / cb_energy[best_index]);
        *best_gain = std::clamp(*best_gain, 0, 255);
    } else {
        *best_gain = 0;
    }

    return best_index;
}

static uint8_t quantize_lsp(int16_t lsp_value, int lsp_index) {
    int best_idx = 0;
    int32_t min_dist = INT32_MAX;
    for (int i = 0; i < 32; i++) {
        int32_t dist = std::abs(lsp_value - LSP_QUANT_TABLE[lsp_index][i]);
        if (dist < min_dist) {
            min_dist = dist;
            best_idx = i;
        }
    }
    return static_cast<uint8_t>(best_idx);
}

G729Frame G729Encoder::encode(const std::vector<int16_t>& frame) {
    G729Frame output;
    std::memset(&output, 0, sizeof(output));

    if (frame.size() != FRAME_SIZE) {
        return output;
    }

    int16_t windowed[FRAME_SIZE];
    for (int i = 0; i < FRAME_SIZE; i++) {
        double w = 0.54 - 0.46 * std::cos(2.0 * M_PI * i / (FRAME_SIZE - 1));
        windowed[i] = static_cast<int16_t>(frame[i] * w);
    }

    int16_t autocorr[11] = {0};
    for (int i = 0; i < 11; i++) {
        for (int j = 0; j < FRAME_SIZE - i; j++) {
            autocorr[i] += (int32_t)windowed[j] * windowed[j + i];
        }
    }

    double lpc[11] = {1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    double k_coeff[11] = {0};
    double a_coeff[11][11] = {0};
    double e[11] = {0};

    e[0] = autocorr[0];
    for (int i = 1; i <= 10; i++) {
        double sum = 0;
        for (int j = 1; j < i; j++) {
            sum += a_coeff[i-1][j] * autocorr[i - j];
        }
        if (e[i-1] != 0) {
            k_coeff[i] = (autocorr[i] - sum) / e[i-1];
        } else {
            k_coeff[i] = 0;
        }
        if (std::abs(k_coeff[i]) > 0.9999) {
            k_coeff[i] = (k_coeff[i] > 0) ? 0.9999 : -0.9999;
        }
        a_coeff[i][i] = k_coeff[i];
        for (int j = 1; j < i; j++) {
            a_coeff[i][j] = a_coeff[i-1][j] - k_coeff[i] * a_coeff[i-1][i-j];
        }
        e[i] = (1 - k_coeff[i] * k_coeff[i]) * e[i-1];
    }

    for (int i = 1; i <= 10; i++) {
        lpc[i] = a_coeff[10][i];
    }

    int16_t lsp[10];
    for (int i = 0; i < 10; i++) {
        double freq = (i + 1) * M_PI / 11.0;
        lsp[i] = static_cast<int16_t>(freq * 4000 / M_PI * 256 / 1000);
    }

    for (int i = 0; i < 10; i++) {
        output.lsp[i] = quantize_lsp(lsp[i], i);
    }

    int16_t residual[FRAME_SIZE];
    for (int i = 0; i < FRAME_SIZE; i++) {
        int32_t sum = frame[i];
        for (int j = 1; j <= 10 && i - j >= 0; j++) {
            sum -= static_cast<int32_t>(lpc[j] * frame[i - j] * 1024);
        }
        residual[i] = static_cast<int16_t>(sum / 1024);
    }

    int best_gain;
    output.fixed_codebook_index = static_cast<uint8_t>(find_best_match(residual, &best_gain));
    output.fixed_codebook_gain = static_cast<uint8_t>(best_gain);

    int pitch_lag = 40;
    int64_t max_corr = 0;
    for (int lag = 20; lag <= 147; lag++) {
        int64_t corr = 0;
        for (int i = lag; i < FRAME_SIZE; i++) {
            corr += (int32_t)residual[i] * residual[i - lag];
        }
        if (corr > max_corr) {
            max_corr = corr;
            pitch_lag = lag;
        }
    }
    output.adaptive_codebook_lag = static_cast<uint8_t>(pitch_lag - 20);

    int64_t num = 0, den = 0;
    for (int i = pitch_lag; i < FRAME_SIZE; i++) {
        num += (int32_t)residual[i] * residual[i - pitch_lag];
        den += (int32_t)residual[i - pitch_lag] * residual[i - pitch_lag];
    }
    int ac_gain = 0;
    if (den > 0) {
        ac_gain = static_cast<int>((num * 256) / den);
        ac_gain = std::clamp(ac_gain, 0, 255);
    }
    output.adaptive_codebook_gain = static_cast<uint8_t>(ac_gain);

    output.lost = false;
    return output;
}

std::vector<G729Frame> G729Encoder::encode_buffer(const std::vector<int16_t>& buffer) {
    std::vector<G729Frame> frames;
    size_t num_frames = buffer.size() / FRAME_SIZE;
    frames.reserve(num_frames);

    for (size_t i = 0; i < num_frames; i++) {
        std::vector<int16_t> frame(buffer.begin() + i * FRAME_SIZE,
                                   buffer.begin() + (i + 1) * FRAME_SIZE);
        frames.push_back(encode(frame));
    }

    return frames;
}

std::vector<int16_t> generate_test_signal(int duration_ms, int sample_rate) {
    int num_samples = (duration_ms * sample_rate) / 1000;
    std::vector<int16_t> signal(num_samples);

    std::mt19937 rng(999);
    std::uniform_int_distribution<int16_t> dist(-32768, 32767);

    for (int i = 0; i < num_samples; i++) {
        double t = static_cast<double>(i) / sample_rate;
        double sample = 0;
        sample += 0.3 * std::sin(2.0 * M_PI * 440 * t);
        sample += 0.2 * std::sin(2.0 * M_PI * 880 * t);
        sample += 0.15 * std::sin(2.0 * M_PI * 1320 * t);
        sample += 0.05 * (static_cast<double>(dist(rng)) / 32768.0);
        signal[i] = static_cast<int16_t>(sample * 20000);
    }

    return signal;
}

#include "common.h"
#include <cmath>
#include <algorithm>

PacketLossSimulator::PacketLossSimulator(double loss_rate, uint32_t seed)
    : loss_rate_(loss_rate)
    , pattern_(LossPattern::RANDOM)
    , rng_(seed)
    , dist_(0.0, 1.0)
    , gilbert_in_burst_(false)
    , periodic_counter_(0)
    , frame_counter_(0)
    , burst_length_(0) {
}

void PacketLossSimulator::set_loss_rate(double rate) {
    loss_rate_ = rate;
}

void PacketLossSimulator::set_loss_pattern(LossPattern pattern) {
    pattern_ = pattern;
    reset_state();
}

void PacketLossSimulator::reset_state() {
    gilbert_in_burst_ = false;
    periodic_counter_ = 0;
    frame_counter_ = 0;
    burst_length_ = 0;
}

bool PacketLossSimulator::should_drop_random() {
    return dist_(rng_) < loss_rate_;
}

bool PacketLossSimulator::should_drop_gilbert() {
    double p_g2b = loss_rate_ * 3.0;
    double p_b2g = 0.3;
    p_g2b = std::min(p_g2b, 0.8);
    
    if (gilbert_in_burst_) {
        if (dist_(rng_) < p_b2g) {
            gilbert_in_burst_ = false;
            return false;
        }
        return true;
    } else {
        if (dist_(rng_) < p_g2b) {
            gilbert_in_burst_ = true;
            return true;
        }
        return false;
    }
}

bool PacketLossSimulator::should_drop_periodic() {
    int interval = std::max(1, static_cast<int>(1.0 / loss_rate_));
    periodic_counter_++;
    if (periodic_counter_ >= interval) {
        periodic_counter_ = 0;
        return true;
    }
    return false;
}

bool PacketLossSimulator::should_drop_gradual() {
    double max_frames = 300.0;
    double progress = std::min(1.0, static_cast<double>(frame_counter_) / max_frames);
    double current_rate = loss_rate_ * progress * 2.0;
    current_rate = std::min(current_rate, 0.5);
    frame_counter_++;
    return dist_(rng_) < current_rate;
}

bool PacketLossSimulator::should_drop() {
    switch (pattern_) {
        case LossPattern::RANDOM:        return should_drop_random();
        case LossPattern::BURST_GILBERT: return should_drop_gilbert();
        case LossPattern::PERIODIC:      return should_drop_periodic();
        case LossPattern::GRADUAL:       return should_drop_gradual();
        default:                         return should_drop_random();
    }
}

std::vector<G729Frame> PacketLossSimulator::simulate(const std::vector<G729Frame>& frames) {
    std::vector<G729Frame> result = frames;
    reset_state();

    for (auto& frame : result) {
        if (should_drop()) {
            frame.lost = true;
        }
    }

    return result;
}

#include "ptp_clock.h"
#include <algorithm>
#include <sstream>
#include <cmath>

namespace ptp {

PTPClock::PTPClock(const DefaultDS& ds)
    : defaultDS_(ds)
    , stateMachine_(PortState::LISTENING)
{
    portDS_.portIdentity.clockIdentity = ds.clockIdentity;
    portDS_.portIdentity.portNumber = 1;
    portDS_.portState = PortState::LISTENING;

    stateMachine_.on_transition = [this](PortState from, PortState to, const std::string& reason) {
        (void)from;
        (void)reason;
        portDS_.portState = to;
        if (on_state_changed) {
            on_state_changed();
        }
    };
}

PTPClock::~PTPClock() {
    stop();
}

void PTPClock::start() {
    if (running_.exchange(true)) return;
    bmcaThread_ = std::thread([this]() {
        while (running_) {
            {
                std::lock_guard<std::mutex> lock(mutex_);
                check_announce_timeout();
                run_bmca();
            }
            std::this_thread::sleep_for(bmcaInterval_);
        }
    });
    syncThread_ = std::thread([this]() {
        while (running_) {
            {
                std::lock_guard<std::mutex> lock(mutex_);
                run_sync_cycle();
            }
            std::this_thread::sleep_for(syncInterval_);
        }
    });
}

void PTPClock::stop() {
    running_ = false;
    if (bmcaThread_.joinable()) {
        bmcaThread_.join();
    }
    if (syncThread_.joinable()) {
        syncThread_.join();
    }
}

void PTPClock::receive_announce(const AnnounceMessage& msg) {
    std::lock_guard<std::mutex> lock(mutex_);

    if (msg.domainNumber != defaultDS_.domainNumber) return;

    if (msg.sourcePortIdentity.clockIdentity == defaultDS_.clockIdentity) return;

    const uint16_t STEPS_REMOVED_MAX = 255;
    if (msg.stepsRemoved >= STEPS_REMOVED_MAX) {
        return;
    }

    AnnounceMessage forwardedMsg = msg;
    forwardedMsg.stepsRemoved = msg.stepsRemoved + 1;

    lastAnnounceTime_ = std::chrono::steady_clock::now();

    auto it = std::find_if(foreignMasters_.begin(), foreignMasters_.end(),
        [&](const ForeignMasterRecord& r) {
            return r.announce.sourcePortIdentity == forwardedMsg.sourcePortIdentity;
        });

    if (it != foreignMasters_.end()) {
        it->announce = forwardedMsg;
        it->receiveCount++;
        it->qualified = (it->receiveCount >= 1);
    } else {
        ForeignMasterRecord record;
        record.announce = forwardedMsg;
        record.receiveCount = 1;
        record.qualified = true;
        foreignMasters_.push_back(record);
    }
}

void PTPClock::inject_announce(
    const std::string& gmId,
    uint8_t priority1,
    uint8_t priority2,
    uint8_t clockClass,
    uint8_t clockAccuracy,
    uint16_t stepsRemoved,
    uint16_t sequenceId
) {
    AnnounceMessage msg;
    msg.sourcePortIdentity.clockIdentity = ClockIdentity::from_string(gmId);
    msg.sourcePortIdentity.portNumber = 1;
    msg.grandmasterPriority1 = priority1;
    msg.grandmasterPriority2 = priority2;
    msg.grandmasterClockQuality.clockClass = clockClass;
    msg.grandmasterClockQuality.clockAccuracy = clockAccuracy;
    msg.grandmasterClockQuality.offsetScaledLogVariance = 0xFFFF;
    msg.grandmasterIdentity = ClockIdentity::from_string(gmId);
    msg.stepsRemoved = stepsRemoved;
    msg.timeSource = 0xA0;
    msg.domainNumber = defaultDS_.domainNumber;
    msg.sequenceId = sequenceId;
    msg.receiveTime = std::chrono::steady_clock::now();
    receive_announce(msg);
}

void PTPClock::run_bmca() {
    prune_foreign_masters();
    BMCAResult result = BMCA::compute_best_master(defaultDS_, foreignMasters_);
    lastBMCADescription_ = result.description;
    update_state_from_bmca(result);
}

void PTPClock::run_sync_cycle() {
    if (stateMachine_.current_state() == PortState::SLAVE ||
        stateMachine_.current_state() == PortState::UNCALIBRATED) {
        perform_delay_measurement();
    }
}

void PTPClock::perform_delay_measurement() {
    syncSequenceId_++;

    std::normal_distribution<double> dist(0.0, static_cast<double>(simulatedJitter_ns_));

    int64_t jitter = static_cast<int64_t>(dist(rng_));
    int64_t true_path_delay = 5000 + static_cast<int64_t>(dist(rng_) * 0.1);

    Timestamp t1 = Timestamp::now();
    int64_t t2_ns = t1.to_nanoseconds() + true_path_delay / 2 + simulatedOffset_ns_ + jitter;
    Timestamp t2 = Timestamp::from_nanoseconds(t2_ns);

    int64_t t3_ns = t2_ns + 1000 + static_cast<int64_t>(dist(rng_) * 0.05);
    Timestamp t3 = Timestamp::from_nanoseconds(t3_ns);

    int64_t t4_ns = t3_ns + true_path_delay / 2 - simulatedOffset_ns_ + jitter;
    Timestamp t4 = Timestamp::from_nanoseconds(t4_ns);

    DelayMeasurement m;
    m.t1 = t1;
    m.t2 = t2;
    m.t3 = t3;
    m.t4 = t4;
    m.sequenceId = syncSequenceId_;
    m.measurementTime = std::chrono::steady_clock::now();

    int64_t t1_ns = t1.to_nanoseconds();
    int64_t t2_nsv = t2.to_nanoseconds();
    int64_t t3_nsv = t3.to_nanoseconds();
    int64_t t4_nsv = t4.to_nanoseconds();

    m.offset_ns = ((t2_nsv - t1_ns) - (t4_nsv - t3_nsv)) / 2;
    m.delay_ns = ((t2_nsv - t1_ns) + (t4_nsv - t3_nsv)) / 2;

    if (m.delay_ns < 0) m.delay_ns = 0;

    m.offset_us = static_cast<double>(m.offset_ns) / 1000.0;
    m.delay_us = static_cast<double>(m.delay_ns) / 1000.0;

    measurementHistory_.push_back(m);
    if (measurementHistory_.size() > MAX_MEASUREMENT_HISTORY) {
        measurementHistory_.erase(measurementHistory_.begin(),
            measurementHistory_.begin() + (measurementHistory_.size() - MAX_MEASUREMENT_HISTORY));
    }
}

void PTPClock::check_announce_timeout() {
    if (foreignMasters_.empty() && stateMachine_.current_state() == PortState::LISTENING) {
        if (!defaultDS_.slaveOnly) {
            if (std::chrono::steady_clock::now() - lastAnnounceTime_ > announceTimeout_) {
                if (stateMachine_.can_transition_to(PortState::MASTER)) {
                    stateMachine_.transition_to(PortState::MASTER, "Announce timeout, no foreign master, claiming grandmaster");
                    hasGrandmaster_ = false;
                }
            }
        }
        return;
    }

    auto now = std::chrono::steady_clock::now();
    bool allTimedOut = true;
    for (auto& fm : foreignMasters_) {
        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
            now - fm.announce.receiveTime);
        if (elapsed > announceTimeout_ * portDS_.announceReceiptTimeout) {
            fm.qualified = false;
        } else {
            allTimedOut = false;
        }
    }

    if (allTimedOut && !foreignMasters_.empty()) {
        if (stateMachine_.current_state() == PortState::SLAVE ||
            stateMachine_.current_state() == PortState::UNCALIBRATED) {
            if (!defaultDS_.slaveOnly) {
                stateMachine_.transition_to(PortState::MASTER, "All foreign masters timed out");
                hasGrandmaster_ = false;
            } else {
                stateMachine_.transition_to(PortState::LISTENING, "All foreign masters timed out (slave-only)");
                hasGrandmaster_ = false;
            }
        }
    }
}

void PTPClock::prune_foreign_masters() {
    auto now = std::chrono::steady_clock::now();
    foreignMasters_.erase(
        std::remove_if(foreignMasters_.begin(), foreignMasters_.end(),
            [&](const ForeignMasterRecord& r) {
                auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
                    now - r.announce.receiveTime);
                return elapsed > announceTimeout_ * (portDS_.announceReceiptTimeout + 2);
            }),
        foreignMasters_.end());
}

void PTPClock::update_state_from_bmca(const BMCAResult& result) {
    if (result.isGrandmaster) {
        if (stateMachine_.current_state() != PortState::MASTER) {
            if (stateMachine_.current_state() == PortState::LISTENING) {
                stateMachine_.transition_to(PortState::MASTER, "BMCA: local clock is best, becoming grandmaster");
            } else if (stateMachine_.current_state() == PortState::SLAVE ||
                       stateMachine_.current_state() == PortState::UNCALIBRATED) {
                stateMachine_.transition_to(PortState::MASTER, "BMCA: local clock is now best, taking over as grandmaster");
            }
        }
        hasGrandmaster_ = false;
    } else {
        if (result.bestMaster) {
            currentGrandmaster_.grandmasterIdentity = result.bestMaster->grandmasterIdentity;
            currentGrandmaster_.grandmasterPriority1 = result.bestMaster->grandmasterPriority1;
            currentGrandmaster_.grandmasterPriority2 = result.bestMaster->grandmasterPriority2;
            currentGrandmaster_.grandmasterClockQuality = result.bestMaster->grandmasterClockQuality;
            currentGrandmaster_.stepsRemoved = result.bestMaster->stepsRemoved;
            currentGrandmaster_.timeSource = result.bestMaster->timeSource;
            currentGrandmaster_.sourcePortIdentity = result.bestMaster->source_identity_str();
            hasGrandmaster_ = true;
        }

        if (stateMachine_.current_state() == PortState::MASTER) {
            stateMachine_.transition_to(PortState::UNCALIBRATED, "BMCA: better master found, switching from MASTER");
        } else if (stateMachine_.current_state() == PortState::LISTENING) {
            stateMachine_.transition_to(PortState::UNCALIBRATED, "BMCA: foreign master detected, starting calibration");
        } else if (stateMachine_.current_state() == PortState::UNCALIBRATED) {
            if (currentGrandmaster_.stepsRemoved < 255) {
                stateMachine_.transition_to(PortState::SLAVE, "BMCA: calibration complete, synchronizing to grandmaster");
            }
        } else if (stateMachine_.current_state() == PortState::SLAVE) {
        }
    }
}

PTPStatus PTPClock::get_status() {
    std::lock_guard<std::mutex> lock(mutex_);
    PTPStatus status;
    status.currentState = stateMachine_.current_state();
    status.stateString = port_state_to_string(stateMachine_.current_state());
    status.grandmaster = currentGrandmaster_;
    status.hasGrandmaster = hasGrandmaster_;
    status.localDS = defaultDS_;
    status.bmcaDescription = lastBMCADescription_;

    if (!measurementHistory_.empty()) {
        status.latestMeasurement = measurementHistory_.back();
        status.hasMeasurement = true;
    }

    for (const auto& fm : foreignMasters_) {
        status.foreignMasterIds.push_back(fm.announce.source_identity_str() +
            " (GM: " + fm.announce.grandmaster_identity_str() +
            ", P1=" + std::to_string(fm.announce.grandmasterPriority1) +
            ", Class=" + std::to_string(fm.announce.grandmasterClockQuality.clockClass) +
            ", qualified=" + (fm.qualified ? "yes" : "no") + ")");
    }

    for (const auto& t : stateMachine_.history()) {
        auto time_since_epoch = t.timestamp.time_since_epoch();
        auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            time_since_epoch).count();
        status.stateHistory.push_back({
            std::to_string(ms),
            port_state_to_string(t.from) + " -> " + port_state_to_string(t.to) + ": " + t.reason
        });
    }

    return status;
}

std::vector<DelayMeasurement> PTPClock::get_measurement_history_copy() {
    std::lock_guard<std::mutex> lock(mutex_);
    return measurementHistory_;
}

std::string PTPClock::export_csv() const {
    std::ostringstream ss;
    ss << "seq,t1_s,t1_ns,t2_s,t2_ns,t3_s,t3_ns,t4_s,t4_ns,offset_ns,delay_ns,offset_us,delay_us\n";
    for (const auto& m : measurementHistory_) {
        ss << m.sequenceId << ","
           << m.t1.seconds << "," << m.t1.nanoseconds << ","
           << m.t2.seconds << "," << m.t2.nanoseconds << ","
           << m.t3.seconds << "," << m.t3.nanoseconds << ","
           << m.t4.seconds << "," << m.t4.nanoseconds << ","
           << m.offset_ns << ","
           << m.delay_ns << ","
           << std::fixed << std::setprecision(3) << m.offset_us << ","
           << std::fixed << std::setprecision(3) << m.delay_us << "\n";
    }
    return ss.str();
}

void PTPClock::set_local_priority1(uint8_t p1) {
    std::lock_guard<std::mutex> lock(mutex_);
    defaultDS_.priority1 = p1;
}

void PTPClock::set_local_priority2(uint8_t p2) {
    std::lock_guard<std::mutex> lock(mutex_);
    defaultDS_.priority2 = p2;
}

void PTPClock::set_local_clock_class(uint8_t cc) {
    std::lock_guard<std::mutex> lock(mutex_);
    defaultDS_.clockQuality.clockClass = cc;
}

void PTPClock::set_local_clock_accuracy(uint8_t ca) {
    std::lock_guard<std::mutex> lock(mutex_);
    defaultDS_.clockQuality.clockAccuracy = ca;
}

void PTPClock::set_simulated_offset(int64_t offset_ns) {
    std::lock_guard<std::mutex> lock(mutex_);
    simulatedOffset_ns_ = offset_ns;
}

void PTPClock::set_simulated_jitter(int64_t jitter_ns) {
    std::lock_guard<std::mutex> lock(mutex_);
    simulatedJitter_ns_ = jitter_ns;
}

}

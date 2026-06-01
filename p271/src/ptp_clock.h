#pragma once

#include "ptp_types.h"
#include "bmca.h"
#include "state_machine.h"
#include <mutex>
#include <thread>
#include <atomic>
#include <vector>
#include <functional>
#include <chrono>
#include <map>
#include <random>

namespace ptp {

struct GrandmasterInfo {
    ClockIdentity grandmasterIdentity;
    uint8_t grandmasterPriority1 = 0;
    uint8_t grandmasterPriority2 = 0;
    ClockQuality grandmasterClockQuality;
    uint16_t stepsRemoved = 0;
    uint8_t timeSource = 0;
    std::string sourcePortIdentity;
};

struct PTPStatus {
    PortState currentState;
    std::string stateString;
    GrandmasterInfo grandmaster;
    bool hasGrandmaster;
    DefaultDS localDS;
    std::vector<std::string> foreignMasterIds;
    std::vector<std::pair<std::string, std::string>> stateHistory;
    std::string bmcaDescription;
    DelayMeasurement latestMeasurement;
    bool hasMeasurement = false;
};

class PTPClock {
public:
    explicit PTPClock(const DefaultDS& ds);
    ~PTPClock();

    void start();
    void stop();

    void receive_announce(const AnnounceMessage& msg);

    PTPStatus get_status();

    void set_local_priority1(uint8_t p1);
    void set_local_priority2(uint8_t p2);
    void set_local_clock_class(uint8_t cc);
    void set_local_clock_accuracy(uint8_t ca);
    void set_simulated_offset(int64_t offset_ns);
    void set_simulated_jitter(int64_t jitter_ns);

    void inject_announce(
        const std::string& gmId,
        uint8_t priority1,
        uint8_t priority2,
        uint8_t clockClass,
        uint8_t clockAccuracy,
        uint16_t stepsRemoved,
        uint16_t sequenceId
    );

    const std::vector<DelayMeasurement>& get_measurement_history() const { return measurementHistory_; }
    std::vector<DelayMeasurement> get_measurement_history_copy();

    std::string export_csv() const;

    std::function<void()> on_state_changed;

private:
    void run_bmca();
    void run_sync_cycle();
    void check_announce_timeout();
    void prune_foreign_masters();
    void update_state_from_bmca(const BMCAResult& result);
    void perform_delay_measurement();

    DefaultDS defaultDS_;
    PortDS portDS_;
    StateMachine stateMachine_;
    std::vector<ForeignMasterRecord> foreignMasters_;
    GrandmasterInfo currentGrandmaster_;
    bool hasGrandmaster_ = false;
    std::string lastBMCADescription_;

    std::mutex mutex_;
    std::thread bmcaThread_;
    std::thread syncThread_;
    std::atomic<bool> running_{false};

    std::chrono::steady_clock::time_point lastAnnounceTime_;
    std::chrono::milliseconds announceTimeout_{3000};
    std::chrono::milliseconds bmcaInterval_{500};
    std::chrono::milliseconds syncInterval_{1000};

    std::vector<DelayMeasurement> measurementHistory_;
    static constexpr size_t MAX_MEASUREMENT_HISTORY = 3600;
    uint16_t syncSequenceId_ = 0;

    int64_t simulatedOffset_ns_ = 0;
    int64_t simulatedJitter_ns_ = 50;
    std::mt19937 rng_{std::random_device{}()};
};

}

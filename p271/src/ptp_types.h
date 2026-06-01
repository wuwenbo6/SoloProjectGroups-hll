#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>
#include <chrono>
#include <sstream>
#include <iomanip>

namespace ptp {

enum class PortState {
    LISTENING,
    UNCALIBRATED,
    SLAVE,
    MASTER,
    PASSIVE,
    DISABLED
};

inline std::string port_state_to_string(PortState s) {
    switch (s) {
        case PortState::LISTENING:    return "LISTENING";
        case PortState::UNCALIBRATED: return "UNCALIBRATED";
        case PortState::SLAVE:        return "SLAVE";
        case PortState::MASTER:       return "MASTER";
        case PortState::PASSIVE:      return "PASSIVE";
        case PortState::DISABLED:     return "DISABLED";
    }
    return "UNKNOWN";
}

struct ClockIdentity {
    std::array<uint8_t, 8> id{};

    static ClockIdentity from_string(const std::string& str) {
        ClockIdentity cid;
        for (size_t i = 0; i < 8 && i * 2 < str.size(); ++i) {
            unsigned int val = 0;
            std::stringstream ss;
            ss << std::hex << str.substr(i * 2, 2);
            ss >> val;
            cid.id[i] = static_cast<uint8_t>(val);
        }
        return cid;
    }

    std::string to_string() const {
        std::stringstream ss;
        ss << std::hex << std::uppercase << std::setfill('0');
        for (size_t i = 0; i < 8; ++i) {
            if (i > 0) ss << ":";
            ss << std::setw(2) << static_cast<int>(id[i]);
        }
        return ss.str();
    }

    bool operator==(const ClockIdentity& o) const { return id == o.id; }
    bool operator!=(const ClockIdentity& o) const { return id != o.id; }
    bool operator<(const ClockIdentity& o) const { return id < o.id; }
    bool operator>(const ClockIdentity& o) const { return id > o.id; }
};

struct ClockQuality {
    uint8_t clockClass = 248;
    uint8_t clockAccuracy = 0xFE;
    uint16_t offsetScaledLogVariance = 0xFFFF;

    bool operator==(const ClockQuality& o) const {
        return clockClass == o.clockClass &&
               clockAccuracy == o.clockAccuracy &&
               offsetScaledLogVariance == o.offsetScaledLogVariance;
    }
    bool operator!=(const ClockQuality& o) const { return !(*this == o); }
    bool operator<(const ClockQuality& o) const {
        if (clockClass != o.clockClass) return clockClass < o.clockClass;
        if (clockAccuracy != o.clockAccuracy) return clockAccuracy < o.clockAccuracy;
        return offsetScaledLogVariance < o.offsetScaledLogVariance;
    }
};

struct PortIdentity {
    ClockIdentity clockIdentity;
    uint16_t portNumber = 1;

    bool operator==(const PortIdentity& o) const {
        return clockIdentity == o.clockIdentity && portNumber == o.portNumber;
    }
    bool operator!=(const PortIdentity& o) const { return !(*this == o); }
    bool operator<(const PortIdentity& o) const {
        if (clockIdentity != o.clockIdentity) return clockIdentity < o.clockIdentity;
        return portNumber < o.portNumber;
    }
};

struct AnnounceMessage {
    PortIdentity sourcePortIdentity;
    uint8_t grandmasterPriority1 = 128;
    ClockQuality grandmasterClockQuality;
    uint8_t grandmasterPriority2 = 128;
    ClockIdentity grandmasterIdentity;
    uint16_t stepsRemoved = 0;
    uint8_t timeSource = 0xA0;
    uint16_t currentUtcOffset = 0;
    uint8_t domainNumber = 0;
    uint16_t sequenceId = 0;

    std::chrono::steady_clock::time_point receiveTime;

    std::string grandmaster_identity_str() const {
        return grandmasterIdentity.to_string();
    }

    std::string source_identity_str() const {
        return sourcePortIdentity.clockIdentity.to_string();
    }
};

struct DefaultDS {
    ClockIdentity clockIdentity;
    uint8_t domainNumber = 0;
    uint8_t priority1 = 128;
    ClockQuality clockQuality;
    uint8_t priority2 = 128;
    uint16_t numberPorts = 1;
    bool slaveOnly = false;
};

struct PortDS {
    PortIdentity portIdentity;
    PortState portState = PortState::LISTENING;
    uint8_t logAnnounceInterval = 1;
    uint8_t announceReceiptTimeout = 3;
    uint8_t logSyncInterval = 0;
    uint8_t delayMechanism = 1;
    uint8_t logMinDelayReqInterval = 0;
    uint16_t versionNumber = 2;
};

struct ForeignMasterRecord {
    AnnounceMessage announce;
    int receiveCount = 0;
    bool qualified = false;
};

struct Timestamp {
    int64_t seconds = 0;
    int32_t nanoseconds = 0;

    static Timestamp now() {
        auto tp = std::chrono::steady_clock::now();
        auto dur = tp.time_since_epoch();
        auto sec = std::chrono::duration_cast<std::chrono::seconds>(dur);
        auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(dur) -
                  std::chrono::duration_cast<std::chrono::nanoseconds>(sec);
        Timestamp ts;
        ts.seconds = sec.count();
        ts.nanoseconds = static_cast<int32_t>(ns.count());
        return ts;
    }

    int64_t to_nanoseconds() const {
        return seconds * 1000000000LL + nanoseconds;
    }

    static Timestamp from_nanoseconds(int64_t ns) {
        Timestamp ts;
        ts.seconds = ns / 1000000000LL;
        ts.nanoseconds = static_cast<int32_t>(ns % 1000000000LL);
        return ts;
    }

    double to_seconds_double() const {
        return static_cast<double>(seconds) + static_cast<double>(nanoseconds) / 1e9;
    }
};

struct SyncMessage {
    PortIdentity sourcePortIdentity;
    uint16_t sequenceId = 0;
    Timestamp originTimestamp;
    uint8_t domainNumber = 0;
};

struct DelayReqMessage {
    PortIdentity sourcePortIdentity;
    uint16_t sequenceId = 0;
    Timestamp originTimestamp;
    uint8_t domainNumber = 0;
};

struct DelayRespMessage {
    PortIdentity sourcePortIdentity;
    PortIdentity requestingPortIdentity;
    uint16_t sequenceId = 0;
    Timestamp receiveTimestamp;
    uint8_t domainNumber = 0;
};

struct DelayMeasurement {
    Timestamp t1;
    Timestamp t2;
    Timestamp t3;
    Timestamp t4;
    int64_t offset_ns = 0;
    int64_t delay_ns = 0;
    double offset_us = 0.0;
    double delay_us = 0.0;
    std::chrono::steady_clock::time_point measurementTime;
    uint16_t sequenceId = 0;
};

}

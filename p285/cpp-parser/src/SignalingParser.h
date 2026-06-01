#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct SackInfo {
    bool present;
    std::string ackBitmap;
    std::vector<int> acknowledgedSegments;
};

struct CCoInfo {
    bool present;
    uint8_t ccoTEI;
    std::string networkId;
    std::string nidFormatted;
    std::string ccoMacAddress;
    std::string stationRole;
    uint16_t beaconPeriod;
    uint32_t beaconTimeStamp;
};

struct BeaconInfo {
    bool present;
    std::string nidHex;
    uint8_t nidVersion;
    std::string ccoMacAddress;
    uint8_t ccoTEI;
    std::string stationRole;
    uint16_t beaconPeriod;
    uint32_t beaconTimeStamp;
};

struct SignalingInfo {
    SackInfo sack;
    CCoInfo ccoInfo;
    BeaconInfo beacon;
};

class SignalingParser {
public:
    static SignalingInfo parse(const uint8_t* data, size_t len, size_t& offset, const struct MacHeader& macHdr);
};

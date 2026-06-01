#pragma once

#include <cstdint>
#include <string>

struct MacHeader {
    uint8_t frameControl;
    uint8_t frameControlExt;
    uint8_t destinationTEI;
    uint8_t sourceTEI;
    uint8_t segmentInfo;
    uint8_t delimiterType;
    std::string delimiterTypeName;
    bool lastSegment;
    uint8_t totalSegments;
    uint8_t segmentNumber;
};

class MacHeaderParser {
public:
    static MacHeader parse(const uint8_t* data, size_t len, size_t& offset);
    static std::string delimiterTypeName(uint8_t type);
    static bool isBeaconFrame(const MacHeader& hdr);
    static bool isSackFrame(const MacHeader& hdr);
};

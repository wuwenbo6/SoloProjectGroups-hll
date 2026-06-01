#pragma once

#include <cstdint>
#include <string>

struct SofInfo {
    uint8_t toneMapIndex;
    std::string modulationScheme;
    uint16_t payloadLength;
    uint8_t preambleQuality;
    std::string frameControlBits;
};

class SofParser {
public:
    static SofInfo parse(const uint8_t* data, size_t len, size_t& offset);
};

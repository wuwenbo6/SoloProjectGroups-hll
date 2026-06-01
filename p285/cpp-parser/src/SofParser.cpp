#include "SofParser.h"

SofInfo SofParser::parse(const uint8_t* data, size_t len, size_t& offset) {
    SofInfo sof = {0, "UNKNOWN", 0, 0, ""};

    if (offset + 1 < len) {
        uint8_t sofByte1 = data[offset++];
        uint8_t sofByte2 = data[offset++];

        sof.toneMapIndex = sofByte1 & 0x3F;

        uint8_t modBits = (sofByte2 >> 5) & 0x07;
        switch (modBits) {
            case 0: sof.modulationScheme = "BPSK"; break;
            case 1: sof.modulationScheme = "QPSK"; break;
            case 2: sof.modulationScheme = "16-QAM"; break;
            case 3: sof.modulationScheme = "64-QAM"; break;
            case 4: sof.modulationScheme = "256-QAM"; break;
            case 5: sof.modulationScheme = "1024-QAM"; break;
            default: sof.modulationScheme = "RESERVED"; break;
        }

        if (offset + 1 < len) {
            sof.payloadLength = data[offset] | (data[offset + 1] << 8);
            offset += 2;
        }

        if (offset < len) {
            sof.preambleQuality = data[offset++];
        }

        std::string bits;
        bits += std::to_string((sofByte1 >> 7) & 1);
        bits += std::to_string((sofByte1 >> 6) & 1);
        bits += std::to_string((sofByte1 >> 5) & 1);
        bits += std::to_string((sofByte1 >> 4) & 1);
        bits += std::to_string((sofByte1 >> 3) & 1);
        bits += std::to_string((sofByte1 >> 2) & 1);
        bits += std::to_string((sofByte1 >> 1) & 1);
        bits += std::to_string(sofByte1 & 1);
        bits += std::to_string((sofByte2 >> 7) & 1);
        bits += std::to_string((sofByte2 >> 6) & 1);
        bits += std::to_string((sofByte2 >> 5) & 1);
        bits += std::to_string((sofByte2 >> 4) & 1);
        bits += std::to_string((sofByte2 >> 3) & 1);
        bits += std::to_string((sofByte2 >> 2) & 1);
        bits += std::to_string((sofByte2 >> 1) & 1);
        bits += std::to_string(sofByte2 & 1);
        sof.frameControlBits = bits;
    }

    return sof;
}

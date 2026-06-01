#include "MacHeaderParser.h"

MacHeader MacHeaderParser::parse(const uint8_t* data, size_t len, size_t& offset) {
    MacHeader hdr = {0, 0, 0, 0, 0, 0, "UNKNOWN", false, 0, 0};

    if (offset < len) {
        hdr.frameControl = data[offset++];
    }
    if (offset < len) {
        hdr.frameControlExt = data[offset++];
    }

    uint8_t frameTypeBits = (hdr.frameControl >> 4) & 0x0F;
    uint8_t direction = (hdr.frameControl >> 2) & 0x03;

    if (direction == 0x03 || frameTypeBits == 0x01) {
        hdr.delimiterType = 1;
        hdr.delimiterTypeName = delimiterTypeName(1);
    } else if (frameTypeBits == 0x00) {
        hdr.delimiterType = 0;
        hdr.delimiterTypeName = delimiterTypeName(0);
    } else if (frameTypeBits == 0x02) {
        hdr.delimiterType = 2;
        hdr.delimiterTypeName = delimiterTypeName(2);
    } else {
        hdr.delimiterType = frameTypeBits;
        hdr.delimiterTypeName = delimiterTypeName(frameTypeBits);
    }

    if (offset < len) {
        hdr.destinationTEI = data[offset++];
    }
    if (offset < len) {
        hdr.sourceTEI = data[offset++];
    }
    if (offset < len) {
        hdr.segmentInfo = data[offset++];
    }

    hdr.lastSegment = (hdr.segmentInfo & 0x80) != 0;
    hdr.totalSegments = (hdr.segmentInfo >> 4) & 0x07;
    if (hdr.totalSegments == 0) hdr.totalSegments = 1;
    hdr.segmentNumber = hdr.segmentInfo & 0x0F;

    return hdr;
}

std::string MacHeaderParser::delimiterTypeName(uint8_t type) {
    switch (type) {
        case 0: return "DATA";
        case 1: return "MAC_COMMAND";
        case 2: return "BEACON";
        case 3: return "SACK";
        default: return "UNKNOWN";
    }
}

bool MacHeaderParser::isBeaconFrame(const MacHeader& hdr) {
    return hdr.delimiterType == 2 ||
           hdr.delimiterTypeName == "BEACON" ||
           ((hdr.frameControl >> 4) & 0x0F) == 0x02;
}

bool MacHeaderParser::isSackFrame(const MacHeader& hdr) {
    return hdr.delimiterType == 3 ||
           hdr.delimiterTypeName == "SACK" ||
           ((hdr.frameControl >> 4) & 0x0F) == 0x03;
}

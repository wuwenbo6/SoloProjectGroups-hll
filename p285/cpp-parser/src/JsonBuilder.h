#pragma once

#include <string>
#include <vector>
#include "MacHeaderParser.h"
#include "SofParser.h"
#include "SignalingParser.h"

struct ReassemblyInfo {
    bool isSegmented;
    bool reassemblyComplete;
    uint8_t totalSegments;
    uint8_t receivedSegments;
    uint8_t segmentNumber;
    std::string reassemblyGroupKey;
    std::vector<uint8_t> reassembledPayload;
};

struct ParsedFrame {
    int frameIndex;
    std::string frameType;
    MacHeader macHeader;
    SofInfo sof;
    SignalingInfo signaling;
    ReassemblyInfo reassembly;
    std::string rawHex;
};

class JsonBuilder {
public:
    static std::string build(const std::vector<ParsedFrame>& frames, const std::string& error = "");
    static std::string toHex(const uint8_t* data, size_t len);
private:
    static std::string escapeJson(const std::string& s);
    static std::string macHeaderToJson(const MacHeader& hdr);
    static std::string sofToJson(const SofInfo& sof);
    static std::string signalingToJson(const SignalingInfo& sig);
    static std::string reassemblyToJson(const ReassemblyInfo& ri);
};

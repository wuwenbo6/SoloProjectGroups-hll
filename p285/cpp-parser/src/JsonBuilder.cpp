#include "JsonBuilder.h"
#include <sstream>
#include <iomanip>

std::string JsonBuilder::escapeJson(const std::string& s) {
    std::string result;
    for (char c : s) {
        switch (c) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default: result += c; break;
        }
    }
    return result;
}

std::string JsonBuilder::toHex(const uint8_t* data, size_t len) {
    std::ostringstream oss;
    for (size_t i = 0; i < len; i++) {
        oss << std::hex << std::uppercase << std::setw(2) << std::setfill('0')
            << static_cast<int>(data[i]);
    }
    return oss.str();
}

std::string JsonBuilder::macHeaderToJson(const MacHeader& hdr) {
    std::ostringstream oss;
    oss << "{";
    oss << "\"frameControl\":" << static_cast<int>(hdr.frameControl) << ",";
    oss << "\"frameControlExt\":" << static_cast<int>(hdr.frameControlExt) << ",";
    oss << "\"destinationTEI\":" << static_cast<int>(hdr.destinationTEI) << ",";
    oss << "\"sourceTEI\":" << static_cast<int>(hdr.sourceTEI) << ",";
    oss << "\"segmentInfo\":" << static_cast<int>(hdr.segmentInfo) << ",";
    oss << "\"delimiterType\":" << static_cast<int>(hdr.delimiterType) << ",";
    oss << "\"delimiterTypeName\":\"" << escapeJson(hdr.delimiterTypeName) << "\",";
    oss << "\"lastSegment\":" << (hdr.lastSegment ? "true" : "false") << ",";
    oss << "\"totalSegments\":" << static_cast<int>(hdr.totalSegments) << ",";
    oss << "\"segmentNumber\":" << static_cast<int>(hdr.segmentNumber);
    oss << "}";
    return oss.str();
}

std::string JsonBuilder::sofToJson(const SofInfo& sof) {
    std::ostringstream oss;
    oss << "{";
    oss << "\"toneMapIndex\":" << static_cast<int>(sof.toneMapIndex) << ",";
    oss << "\"modulationScheme\":\"" << escapeJson(sof.modulationScheme) << "\",";
    oss << "\"payloadLength\":" << static_cast<int>(sof.payloadLength) << ",";
    oss << "\"preambleQuality\":" << static_cast<int>(sof.preambleQuality) << ",";
    oss << "\"frameControlBits\":\"" << escapeJson(sof.frameControlBits) << "\"";
    oss << "}";
    return oss.str();
}

std::string JsonBuilder::signalingToJson(const SignalingInfo& sig) {
    std::ostringstream oss;
    oss << "{";

    oss << "\"sack\":{";
    oss << "\"present\":" << (sig.sack.present ? "true" : "false") << ",";
    oss << "\"ackBitmap\":\"" << escapeJson(sig.sack.ackBitmap) << "\",";
    oss << "\"acknowledgedSegments\":[";
    for (size_t i = 0; i < sig.sack.acknowledgedSegments.size(); i++) {
        if (i > 0) oss << ",";
        oss << sig.sack.acknowledgedSegments[i];
    }
    oss << "]";
    oss << "},";

    oss << "\"ccoInfo\":{";
    oss << "\"present\":" << (sig.ccoInfo.present ? "true" : "false") << ",";
    oss << "\"ccoTEI\":" << static_cast<int>(sig.ccoInfo.ccoTEI) << ",";
    oss << "\"networkId\":\"" << escapeJson(sig.ccoInfo.networkId) << "\",";
    oss << "\"nidFormatted\":\"" << escapeJson(sig.ccoInfo.nidFormatted) << "\",";
    oss << "\"ccoMacAddress\":\"" << escapeJson(sig.ccoInfo.ccoMacAddress) << "\",";
    oss << "\"stationRole\":\"" << escapeJson(sig.ccoInfo.stationRole) << "\",";
    oss << "\"beaconPeriod\":" << static_cast<int>(sig.ccoInfo.beaconPeriod) << ",";
    oss << "\"beaconTimeStamp\":" << static_cast<uint32_t>(sig.ccoInfo.beaconTimeStamp);
    oss << "},";

    oss << "\"beacon\":{";
    oss << "\"present\":" << (sig.beacon.present ? "true" : "false") << ",";
    oss << "\"nid\":\"" << escapeJson(sig.beacon.nidHex) << "\",";
    oss << "\"nidVersion\":" << static_cast<int>(sig.beacon.nidVersion) << ",";
    oss << "\"ccoMacAddress\":\"" << escapeJson(sig.beacon.ccoMacAddress) << "\",";
    oss << "\"ccoTEI\":" << static_cast<int>(sig.beacon.ccoTEI) << ",";
    oss << "\"stationRole\":\"" << escapeJson(sig.beacon.stationRole) << "\",";
    oss << "\"beaconPeriod\":" << static_cast<int>(sig.beacon.beaconPeriod) << ",";
    oss << "\"beaconTimeStamp\":" << static_cast<uint32_t>(sig.beacon.beaconTimeStamp);
    oss << "}";

    oss << "}";
    return oss.str();
}

std::string JsonBuilder::reassemblyToJson(const ReassemblyInfo& ri) {
    std::ostringstream oss;
    oss << "{";
    oss << "\"isSegmented\":" << (ri.isSegmented ? "true" : "false") << ",";
    oss << "\"reassemblyComplete\":" << (ri.reassemblyComplete ? "true" : "false") << ",";
    oss << "\"totalSegments\":" << static_cast<int>(ri.totalSegments) << ",";
    oss << "\"receivedSegments\":" << static_cast<int>(ri.receivedSegments) << ",";
    oss << "\"segmentNumber\":" << static_cast<int>(ri.segmentNumber) << ",";
    oss << "\"reassemblyGroupKey\":\"" << escapeJson(ri.reassemblyGroupKey) << "\",";

    if (ri.reassemblyComplete && !ri.reassembledPayload.empty()) {
        oss << "\"reassembledHex\":\"" << escapeJson(toHex(ri.reassembledPayload.data(), ri.reassembledPayload.size())) << "\"";
    } else {
        oss << "\"reassembledHex\":null";
    }

    oss << "}";
    return oss.str();
}

std::string JsonBuilder::build(const std::vector<ParsedFrame>& frames, const std::string& error) {
    std::ostringstream oss;
    oss << "{";
    oss << "\"success\":" << (error.empty() ? "true" : "false") << ",";

    if (!error.empty()) {
        oss << "\"error\":\"" << escapeJson(error) << "\",";
    }

    oss << "\"frames\":[";
    for (size_t i = 0; i < frames.size(); i++) {
        if (i > 0) oss << ",";
        const auto& f = frames[i];
        oss << "{";
        oss << "\"frameIndex\":" << f.frameIndex << ",";
        oss << "\"frameType\":\"" << escapeJson(f.frameType) << "\",";
        oss << "\"macHeader\":" << macHeaderToJson(f.macHeader) << ",";
        oss << "\"sof\":" << sofToJson(f.sof) << ",";
        oss << "\"signaling\":" << signalingToJson(f.signaling) << ",";
        oss << "\"reassembly\":" << reassemblyToJson(f.reassembly) << ",";
        oss << "\"rawHex\":\"" << escapeJson(f.rawHex) << "\"";
        oss << "}";
    }
    oss << "]";

    if (error.empty()) {
        oss << ",\"error\":null";
    }

    oss << "}";
    return oss.str();
}

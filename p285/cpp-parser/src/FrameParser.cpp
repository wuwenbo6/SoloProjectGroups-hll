#include "FrameParser.h"

static const uint8_t HPAV_PREAMBLE_PATTERN[] = {
    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55,
    0x33, 0x33, 0x33, 0x33
};
static const size_t PREAMBLE_LEN = sizeof(HPAV_PREAMBLE_PATTERN);

FrameParser::FrameParser(const std::vector<uint8_t>& data)
    : m_data(data), m_offset(0) {}

bool FrameParser::matchPreamble(size_t pos) {
    if (pos + PREAMBLE_LEN > m_data.size()) return false;
    for (size_t i = 0; i < PREAMBLE_LEN; i++) {
        if (m_data[pos + i] != HPAV_PREAMBLE_PATTERN[i]) return false;
    }
    return true;
}

bool FrameParser::findFrameBoundary(size_t& start, size_t& end) {
    while (m_offset + PREAMBLE_LEN < m_data.size()) {
        if (matchPreamble(m_offset)) {
            start = m_offset;
            size_t searchPos = m_offset + PREAMBLE_LEN;
            while (searchPos + PREAMBLE_LEN < m_data.size()) {
                if (matchPreamble(searchPos)) {
                    end = searchPos;
                    m_offset = searchPos;
                    return true;
                }
                searchPos++;
            }
            end = m_data.size();
            m_offset = m_data.size();
            return true;
        }
        m_offset++;
    }
    return false;
}

static std::string makeGroupKey(const MacHeader& hdr) {
    return std::to_string(hdr.sourceTEI) + "->" + std::to_string(hdr.destinationTEI) + ":" + hdr.delimiterTypeName;
}

static ReassemblyInfo makeDefaultReassembly() {
    return {false, false, 1, 0, 0, "", {}};
}

std::vector<ParsedFrame> FrameParser::parse() {
    std::vector<ParsedFrame> frames;
    int frameIndex = 0;

    if (m_data.size() < PREAMBLE_LEN + 16) {
        ParsedFrame frame;
        frame.frameIndex = frameIndex++;
        frame.frameType = "UNKNOWN";
        frame.rawHex = "";
        frame.macHeader = {0, 0, 0, 0, 0, 0, "UNKNOWN", false, 0, 0};
        frame.sof = {0, "UNKNOWN", 0, 0, ""};
        frame.signaling = {
            {false, "", {}},
            {false, 0, "", "", "", "", 0, 0},
            {false, "", 0, "", 0, "", 0, 0}
        };
        frame.reassembly = makeDefaultReassembly();

        if (m_data.size() >= 8) {
            size_t off = 0;
            frame.macHeader = MacHeaderParser::parse(m_data.data(), m_data.size(), off);
            if (MacHeaderParser::isBeaconFrame(frame.macHeader)) {
                frame.frameType = "BEACON";
            } else if (MacHeaderParser::isSackFrame(frame.macHeader)) {
                frame.frameType = "SACK";
            } else {
                frame.frameType = "MAC";
            }

            if (MacHeaderParser::isSackFrame(frame.macHeader)) {
                frame.signaling = SignalingParser::parse(m_data.data(), m_data.size(), off, frame.macHeader);
            } else if (MacHeaderParser::isBeaconFrame(frame.macHeader)) {
                frame.signaling = SignalingParser::parse(m_data.data(), m_data.size(), off, frame.macHeader);
            } else {
                if (off < m_data.size()) {
                    frame.sof = SofParser::parse(m_data.data(), m_data.size(), off);
                }
                if (off < m_data.size()) {
                    frame.signaling = SignalingParser::parse(m_data.data(), m_data.size(), off, frame.macHeader);
                }
            }

            bool isSegmented = frame.macHeader.totalSegments > 1;
            frame.reassembly.isSegmented = isSegmented;
            frame.reassembly.segmentNumber = frame.macHeader.segmentNumber;
            frame.reassembly.totalSegments = frame.macHeader.totalSegments;
            frame.reassembly.receivedSegments = 1;
            frame.reassembly.reassemblyComplete = !isSegmented;
            frame.reassembly.reassemblyGroupKey = isSegmented ? makeGroupKey(frame.macHeader) : "";

            frame.rawHex = JsonBuilder::toHex(m_data.data(), m_data.size());
        }
        frames.push_back(frame);
        return frames;
    }

    while (m_offset < m_data.size()) {
        size_t frameStart, frameEnd;
        if (!findFrameBoundary(frameStart, frameEnd)) break;

        const uint8_t* frameData = m_data.data() + frameStart;
        size_t frameLen = frameEnd - frameStart;

        ParsedFrame frame;
        frame.frameIndex = frameIndex++;
        frame.rawHex = JsonBuilder::toHex(frameData, frameLen > 512 ? 512 : frameLen);
        frame.reassembly = makeDefaultReassembly();

        size_t offset = PREAMBLE_LEN;

        if (offset + 2 <= frameLen) {
            uint16_t fcLen = (frameData[offset] | (frameData[offset + 1] << 8)) & 0x7F;
            if (fcLen == 0) fcLen = 25;
            offset += 2;
            if (offset + fcLen <= frameLen) {
                offset += fcLen;
            }
        }

        if (offset < frameLen) {
            frame.macHeader = MacHeaderParser::parse(frameData, frameLen, offset);
        } else {
            frame.macHeader = {0, 0, 0, 0, 0, 0, "UNKNOWN", false, 0, 0};
        }

        if (MacHeaderParser::isBeaconFrame(frame.macHeader)) {
            frame.frameType = "BEACON";
        } else if (MacHeaderParser::isSackFrame(frame.macHeader)) {
            frame.frameType = "SACK";
        } else {
            frame.frameType = "MAC";
        }

        if (MacHeaderParser::isSackFrame(frame.macHeader)) {
            frame.sof = {0, "N/A", 0, 0, ""};
            if (offset < frameLen) {
                frame.signaling = SignalingParser::parse(frameData, frameLen, offset, frame.macHeader);
            } else {
                frame.signaling = {{false, "", {}}, {false, 0, "", "", "", "", 0, 0}, {false, "", 0, "", 0, "", 0, 0}};
            }
        } else if (MacHeaderParser::isBeaconFrame(frame.macHeader)) {
            frame.sof = {0, "N/A", 0, 0, ""};
            if (offset < frameLen) {
                frame.signaling = SignalingParser::parse(frameData, frameLen, offset, frame.macHeader);
            } else {
                frame.signaling = {{false, "", {}}, {false, 0, "", "", "", "", 0, 0}, {false, "", 0, "", 0, "", 0, 0}};
            }
        } else {
            if (offset < frameLen) {
                frame.sof = SofParser::parse(frameData, frameLen, offset);
            } else {
                frame.sof = {0, "UNKNOWN", 0, 0, ""};
            }

            if (offset < frameLen) {
                frame.signaling = SignalingParser::parse(frameData, frameLen, offset, frame.macHeader);
            } else {
                frame.signaling = {{false, "", {}}, {false, 0, "", "", "", "", 0, 0}, {false, "", 0, "", 0, "", 0, 0}};
            }
        }

        bool isSegmented = frame.macHeader.totalSegments > 1;
        frame.reassembly.isSegmented = isSegmented;
        frame.reassembly.segmentNumber = frame.macHeader.segmentNumber;
        frame.reassembly.totalSegments = frame.macHeader.totalSegments;

        if (isSegmented && !MacHeaderParser::isBeaconFrame(frame.macHeader) && !MacHeaderParser::isSackFrame(frame.macHeader)) {
            std::string groupKey = makeGroupKey(frame.macHeader);
            frame.reassembly.reassemblyGroupKey = groupKey;

            size_t payloadStart = offset;
            size_t payloadLen = frameLen > payloadStart ? frameLen - payloadStart : 0;
            if (frame.sof.payloadLength > 0 && payloadLen > (size_t)frame.sof.payloadLength) {
                payloadLen = frame.sof.payloadLength;
            }

            auto& group = m_segmentGroups[groupKey];
            group.totalExpected = frame.macHeader.totalSegments;
            std::vector<uint8_t> payload(frameData + payloadStart, frameData + payloadStart + payloadLen);
            group.segments[frame.macHeader.segmentNumber] = payload;

            frame.reassembly.receivedSegments = static_cast<uint8_t>(group.segments.size());
            frame.reassembly.reassemblyComplete = (group.segments.size() >= group.totalExpected);

            if (frame.reassembly.reassemblyComplete) {
                std::vector<uint8_t> reassembled;
                for (uint8_t seg = 0; seg < group.totalExpected; seg++) {
                    auto it = group.segments.find(seg);
                    if (it != group.segments.end()) {
                        reassembled.insert(reassembled.end(), it->second.begin(), it->second.end());
                    }
                }
                frame.reassembly.reassembledPayload = reassembled;
            }
        } else {
            frame.reassembly.receivedSegments = 1;
            frame.reassembly.reassemblyComplete = true;
            frame.reassembly.reassemblyGroupKey = "";
        }

        frames.push_back(frame);
    }

    if (frames.empty()) {
        ParsedFrame frame;
        frame.frameIndex = 0;
        frame.frameType = "UNKNOWN";
        frame.macHeader = {0, 0, 0, 0, 0, 0, "UNKNOWN", false, 0, 0};
        frame.sof = {0, "UNKNOWN", 0, 0, ""};
        frame.signaling = {
            {false, "", {}},
            {false, 0, "", "", "", "", 0, 0},
            {false, "", 0, "", 0, "", 0, 0}
        };
        frame.reassembly = makeDefaultReassembly();
        frame.rawHex = JsonBuilder::toHex(m_data.data(), m_data.size() > 512 ? 512 : m_data.size());
        frames.push_back(frame);
    }

    return frames;
}

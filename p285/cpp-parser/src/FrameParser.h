#pragma once

#include <cstdint>
#include <vector>
#include <string>
#include <map>
#include "JsonBuilder.h"

class FrameParser {
public:
    explicit FrameParser(const std::vector<uint8_t>& data);

    std::vector<ParsedFrame> parse();

private:
    const std::vector<uint8_t>& m_data;
    size_t m_offset;

    bool findFrameBoundary(size_t& start, size_t& end);
    bool matchPreamble(size_t pos);

    struct SegmentGroup {
        uint8_t totalExpected;
        std::map<uint8_t, std::vector<uint8_t>> segments;
    };
    std::map<std::string, SegmentGroup> m_segmentGroups;
};

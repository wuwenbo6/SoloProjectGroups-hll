#include "FrameParser.h"
#include "MacHeaderParser.h"
#include "SofParser.h"
#include "SignalingParser.h"
#include "JsonBuilder.h"
#include <fstream>
#include <iostream>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: hpav-parser <input_file>" << std::endl;
        return 1;
    }

    std::ifstream file(argv[1], std::ios::binary);
    if (!file.is_open()) {
        std::cout << JsonBuilder::build({}, "Cannot open file: " + std::string(argv[1])) << std::endl;
        return 0;
    }

    std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),
                               std::istreambuf_iterator<char>());
    file.close();

    if (data.empty()) {
        std::cout << JsonBuilder::build({}, "File is empty") << std::endl;
        return 0;
    }

    FrameParser parser(data);
    auto frames = parser.parse();

    std::cout << JsonBuilder::build(frames) << std::endl;
    return 0;
}

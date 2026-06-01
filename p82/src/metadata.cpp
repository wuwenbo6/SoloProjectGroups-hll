#include "metadata.h"
#include <fstream>
#include <sstream>
#include <iomanip>

MetadataManager::MetadataManager() {
}

MetadataManager::~MetadataManager() {
}

bool MetadataManager::serialize(const FileMetadata& meta, const std::string& filePath) {
    std::ofstream ofs(filePath, std::ios::binary);
    if (!ofs) {
        return false;
    }
    ofs.write(reinterpret_cast<const char*>(&meta), sizeof(FileMetadata));
    return true;
}

bool MetadataManager::deserialize(FileMetadata& meta, const std::string& filePath) {
    std::ifstream ifs(filePath, std::ios::binary);
    if (!ifs) {
        return false;
    }
    ifs.read(reinterpret_cast<char*>(&meta), sizeof(FileMetadata));
    return true;
}

std::string MetadataManager::hashToString(const uint8_t hash[SM3_DIGEST_LENGTH]) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < SM3_DIGEST_LENGTH; ++i) {
        ss << std::setw(2) << static_cast<int>(hash[i]);
    }
    return ss.str();
}

std::string MetadataManager::signatureToString(const uint8_t sig[SM2_SIGNATURE_LENGTH]) {
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (size_t i = 0; i < SM2_SIGNATURE_LENGTH; ++i) {
        ss << std::setw(2) << static_cast<int>(sig[i]);
    }
    return ss.str();
}

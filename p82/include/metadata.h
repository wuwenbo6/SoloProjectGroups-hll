#ifndef METADATA_H
#define METADATA_H

#include "common.h"
#include <string>

class MetadataManager {
public:
    MetadataManager();
    ~MetadataManager();

    bool serialize(const FileMetadata& meta, const std::string& filePath);
    bool deserialize(FileMetadata& meta, const std::string& filePath);

    std::string hashToString(const uint8_t hash[SM3_DIGEST_LENGTH]);
    std::string signatureToString(const uint8_t sig[SM2_SIGNATURE_LENGTH]);

private:
};

#endif

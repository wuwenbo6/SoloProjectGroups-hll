#ifndef COMMON_H
#define COMMON_H

#include <string>
#include <vector>
#include <cstdint>
#include <stdexcept>
#include <memory>
#include <cstring>

using ByteArray = std::vector<uint8_t>;

constexpr size_t SM3_DIGEST_LENGTH = 32;
constexpr size_t SM4_KEY_LENGTH = 16;
constexpr size_t SM4_IV_LENGTH = 16;
constexpr size_t SM4_BLOCK_SIZE = 16;
constexpr size_t SM2_SIGNATURE_LENGTH = 64;

struct FileMetadata {
    uint64_t file_size;
    uint64_t create_time;
    uint64_t modify_time;
    uint64_t access_time;
    uint32_t mode;
    uint32_t uid;
    uint32_t gid;
    uint8_t sm3_hash[SM3_DIGEST_LENGTH];
    uint8_t signature[SM2_SIGNATURE_LENGTH];
};

#endif

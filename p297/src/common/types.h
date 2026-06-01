#pragma once
#include <cstdint>
#include <cstddef>
#include <vector>
#include <array>
#include <string>
#include <memory>

using u8 = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using u64 = uint64_t;
using i8 = int8_t;
using i16 = int16_t;
using i32 = int32_t;
using i64 = int64_t;

constexpr size_t ETH_FRAME_MAX = 1518;
constexpr size_t ETH_HEADER_LEN = 14;
constexpr size_t IP_HEADER_MIN = 20;
constexpr size_t TCP_HEADER_MIN = 20;
constexpr size_t VIRTQUEUE_SIZE = 256;

#pragma once
#include "common/types.h"
#include "common/byte_order.h"

namespace net {

inline u16 checksum(const void* data, size_t len) {
    const u16* buf = static_cast<const u16*>(data);
    u32 sum = 0;

    while (len > 1) {
        sum += *buf++;
        len -= 2;
    }

    if (len == 1) {
        sum += *reinterpret_cast<const u8*>(buf);
    }

    while (sum >> 16) {
        sum = (sum & 0xFFFF) + (sum >> 16);
    }

    return static_cast<u16>(~sum);
}

struct PseudoHeader {
    u32 src_ip;
    u32 dst_ip;
    u8  zero = 0;
    u8  protocol;
    u16 length;
};

inline u16 transport_checksum(const void* data, size_t len,
                              u32 src_ip, u32 dst_ip, u8 protocol) {
    PseudoHeader ph;
    ph.src_ip = htonl(src_ip);
    ph.dst_ip = htonl(dst_ip);
    ph.protocol = protocol;
    ph.length = htons(static_cast<u16>(len));

    std::vector<u8> combined(sizeof(ph) + len);
    std::memcpy(combined.data(), &ph, sizeof(ph));
    std::memcpy(combined.data() + sizeof(ph), data, len);

    return checksum(combined.data(), combined.size());
}

}

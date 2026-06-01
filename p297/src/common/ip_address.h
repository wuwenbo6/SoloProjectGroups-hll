#pragma once
#include "common/types.h"
#include <string>
#include <cstdio>

namespace net {

struct IpAddress {
    u32 addr = 0;

    IpAddress() = default;
    explicit IpAddress(u32 a) : addr(a) {}
    IpAddress(u8 a, u8 b, u8 c, u8 d) {
        addr = (static_cast<u32>(a) << 24) |
               (static_cast<u32>(b) << 16) |
               (static_cast<u32>(c) << 8) |
               static_cast<u32>(d);
    }

    static IpAddress from_bytes(const u8* data) {
        IpAddress ip;
        ip.addr = (static_cast<u32>(data[0]) << 24) |
                  (static_cast<u32>(data[1]) << 16) |
                  (static_cast<u32>(data[2]) << 8) |
                  static_cast<u32>(data[3]);
        return ip;
    }

    void to_bytes(u8* out) const {
        out[0] = (addr >> 24) & 0xFF;
        out[1] = (addr >> 16) & 0xFF;
        out[2] = (addr >> 8) & 0xFF;
        out[3] = addr & 0xFF;
    }

    std::string to_string() const {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%u.%u.%u.%u",
                      (addr >> 24) & 0xFF,
                      (addr >> 16) & 0xFF,
                      (addr >> 8) & 0xFF,
                      addr & 0xFF);
        return std::string(buf);
    }

    bool is_broadcast() const { return addr == 0xFFFFFFFF; }

    bool operator==(const IpAddress& other) const {
        return addr == other.addr;
    }

    bool operator!=(const IpAddress& other) const {
        return !(*this == other);
    }

    bool operator<(const IpAddress& other) const {
        return addr < other.addr;
    }
};

}

namespace std {
template<> struct hash<net::IpAddress> {
    size_t operator()(const net::IpAddress& ip) const {
        return hash<u32>()(ip.addr);
    }
};
}

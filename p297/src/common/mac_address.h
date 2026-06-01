#pragma once
#include "common/types.h"
#include <array>
#include <string>
#include <cstdio>

namespace net {

struct MacAddress {
    std::array<u8, 6> addr;

    MacAddress() { addr.fill(0); }
    MacAddress(u8 a, u8 b, u8 c, u8 d, u8 e, u8 f) {
        addr[0] = a; addr[1] = b; addr[2] = c;
        addr[3] = d; addr[4] = e; addr[5] = f;
    }
    explicit MacAddress(const u8* data) {
        std::memcpy(addr.data(), data, 6);
    }

    bool is_broadcast() const {
        for (auto b : addr) if (b != 0xFF) return false;
        return true;
    }

    bool is_zero() const {
        for (auto b : addr) if (b != 0) return false;
        return true;
    }

    std::string to_string() const {
        char buf[32];
        std::snprintf(buf, sizeof(buf), "%02x:%02x:%02x:%02x:%02x:%02x",
                      addr[0], addr[1], addr[2], addr[3], addr[4], addr[5]);
        return std::string(buf);
    }

    bool operator==(const MacAddress& other) const {
        return addr == other.addr;
    }

    bool operator!=(const MacAddress& other) const {
        return !(*this == other);
    }
};

}

namespace std {
template<> struct hash<net::MacAddress> {
    size_t operator()(const net::MacAddress& m) const {
        size_t h = 0;
        for (size_t i = 0; i < 6; i++) {
            h = (h << 8) | m.addr[i];
        }
        return h;
    }
};
}

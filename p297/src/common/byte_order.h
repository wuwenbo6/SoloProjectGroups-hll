#pragma once
#include "common/types.h"

namespace net {

inline u16 (htons)(u16 host) {
    return (host >> 8) | (host << 8);
}

inline u16 (ntohs)(u16 net) {
    return (htons)(net);
}

inline u32 (htonl)(u32 host) {
    return ((host & 0xFF) << 24) |
           ((host & 0xFF00) << 8) |
           ((host & 0xFF0000) >> 8) |
           ((host & 0xFF000000) >> 24);
}

inline u32 (ntohl)(u32 net) {
    return (htonl)(net);
}

}

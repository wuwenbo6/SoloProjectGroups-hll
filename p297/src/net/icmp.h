#pragma once
#include "common/types.h"
#include "common/buffer.h"
#include "common/ip_address.h"

namespace net {

constexpr u8 ICMP_ECHO_REQUEST = 8;
constexpr u8 ICMP_ECHO_REPLY = 0;

struct IcmpHeader {
    u8 type;
    u8 code;
    u16 checksum;
    union { u16 id; u16 echo_id; };
    union { u16 seq; u16 echo_seq; };
};

class IcmpLayer {
public:
    void handle_rx(Buffer& buf, IpAddress src_ip);
    void send_echo_reply(IpAddress dst, u16 id, u16 seq, const u8* data, size_t len);
    void send_echo_request(IpAddress dst, u16 id, u16 seq);
};

extern IcmpLayer g_icmp_layer;

}

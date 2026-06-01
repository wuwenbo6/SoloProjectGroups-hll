#pragma once
#include "common/types.h"
#include "common/buffer.h"
#include "common/ip_address.h"

namespace net {

constexpr u8 IP_PROTO_ICMP = 1;
constexpr u8 IP_PROTO_TCP = 6;

struct IpHeader {
    u8 ver_ihl;
    u8 tos;
    u16 total_len;
    u16 id;
    u16 frag_off;
    u8 ttl;
    u8 protocol;
    u16 checksum;
    u32 src;
    u32 dst;
};

class IpLayer {
public:
    IpAddress local_ip_;

    bool parse(Buffer& buf, IpHeader& out_hdr);
    void encapsulate(Buffer& buf, u8 protocol, IpAddress src, IpAddress dst, u16 payload_len);
    void handle_rx(Buffer& buf);
    void send(IpAddress dst, u8 protocol, Buffer& payload);

private:
    u16 next_id_ = 0;
};

extern IpLayer g_ip_layer;

}

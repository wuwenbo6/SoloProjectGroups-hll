#pragma once
#include "common/types.h"
#include "common/buffer.h"
#include "common/mac_address.h"
#include "common/ip_address.h"
#include "common/byte_order.h"
#include <unordered_map>

namespace net {

constexpr u16 ARP_HW_ETHERNET = 0x0001;
constexpr u16 ARP_PROTO_IPV4 = 0x0800;
constexpr u8 ARP_HW_LEN = 6;
constexpr u8 ARP_PROTO_LEN = 4;
constexpr u16 ARP_OP_REQUEST = 0x0001;
constexpr u16 ARP_OP_REPLY = 0x0002;
constexpr size_t ARP_PACKET_LEN = 28;

struct ArpPacket {
    u16 hw_type;
    u16 proto_type;
    u8 hw_len;
    u8 proto_len;
    u16 operation;
    MacAddress sender_mac;
    u32 sender_ip;
    MacAddress target_mac;
    u32 target_ip;
};

class EthernetLayer;

class ArpLayer {
public:
    ArpLayer();

    void handle_request(Buffer& buf);
    void handle_reply(Buffer& buf);
    MacAddress lookup(IpAddress ip);
    void send_request(IpAddress ip);
    void learn(IpAddress ip, MacAddress mac);

    void set_ethernet_layer(EthernetLayer* eth) { eth_layer_ = eth; }
    void set_ip_address(IpAddress ip) { ip_ = ip; }
    const IpAddress& ip_address() const { return ip_; }

private:
    bool parse(Buffer& buf, ArpPacket& out_pkt);
    void send_reply(const ArpPacket& request);

    std::unordered_map<IpAddress, MacAddress> arp_cache_;
    EthernetLayer* eth_layer_;
    IpAddress ip_;
};

}

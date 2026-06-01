#pragma once
#include "common/types.h"
#include "common/buffer.h"
#include "common/mac_address.h"
#include "common/byte_order.h"

namespace net {

constexpr u16 ETH_TYPE_IPV4 = 0x0800;
constexpr u16 ETH_TYPE_ARP = 0x0806;

struct EthernetHeader {
    MacAddress dst;
    MacAddress src;
    u16 type;
};

class ArpLayer;
class IpLayer;

class EthernetLayer {
public:
    EthernetLayer();

    bool parse(Buffer& buf, EthernetHeader& out_hdr);
    void encapsulate(Buffer& buf, const MacAddress& dst, const MacAddress& src, u16 type);
    void handle_rx(Buffer& buf);

    void set_arp_layer(ArpLayer* arp) { arp_layer_ = arp; }
    void set_ip_layer(IpLayer* ip) { ip_layer_ = ip; }
    void set_mac_address(const MacAddress& mac) { mac_ = mac; }
    const MacAddress& mac_address() const { return mac_; }

private:
    MacAddress mac_;
    ArpLayer* arp_layer_;
    IpLayer* ip_layer_;
};

}

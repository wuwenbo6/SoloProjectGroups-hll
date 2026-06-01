#pragma once
#include "driver/virtio_net.h"
#include "net/ethernet.h"
#include "net/arp.h"
#include "net/ipv4.h"
#include "net/icmp.h"
#include "net/tcp.h"
#include "web/packet_bus.h"
#include "common/mac_address.h"
#include "common/ip_address.h"
#include "common/pcap.h"
#include <string>

namespace net {

class TcpIpStack {
public:
    TcpIpStack();

    void init(const MacAddress& mac, const IpAddress& ip);

    void tick();

    void send_to_driver(const std::vector<u8>& packet);

    void handle_from_driver(const std::vector<u8>& packet);

    VirtioNetDriver& driver() { return driver_; }
    EthernetLayer& ethernet() { return ethernet_; }
    ArpLayer& arp() { return arp_; }
    IpLayer& ip() { return ip_layer_; }
    IcmpLayer& icmp() { return icmp_; }
    TcpLayer& tcp() { return tcp_; }
    PacketBus& bus() { return bus_; }

    void ping(const IpAddress& dst_ip, u16 id = 1, u16 seq = 1);

    void tcp_connect(const IpAddress& dst_ip, u16 dst_port, u16 src_port);

    void tcp_listen(u16 port);

    void simulate_zero_window(u16 local_port);

    void toggle_keep_alive(u16 local_port, bool enabled);

    std::vector<u8> get_pcap_data();

    void clear_pcap_buffer();

    static std::string hex_dump(const u8* data, size_t len);

    static TcpIpStack& instance();

private:
    VirtioNetDriver driver_;
    EthernetLayer ethernet_;
    ArpLayer arp_;
    IpLayer ip_layer_;
    IcmpLayer icmp_;
    TcpLayer tcp_;
    PacketBus bus_;
    PcapWriter pcap_writer_;

    MacAddress mac_;
    IpAddress ip_addr_;
};

extern TcpIpStack g_stack;

}

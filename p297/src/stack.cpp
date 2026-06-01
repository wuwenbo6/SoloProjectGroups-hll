#include "stack.h"
#include "common/byte_order.h"
#include <sstream>
#include <iomanip>
#include <cstring>

namespace net {

TcpIpStack g_stack;

TcpIpStack& TcpIpStack::instance() {
    return g_stack;
}

TcpIpStack::TcpIpStack() = default;

void TcpIpStack::init(const MacAddress& mac, const IpAddress& ip) {
    mac_ = mac;
    ip_addr_ = ip;

    driver_.set_mac(mac);
    ethernet_.set_mac_address(mac);
    ethernet_.set_arp_layer(&arp_);
    ethernet_.set_ip_layer(&ip_layer_);
    arp_.set_ethernet_layer(&ethernet_);
    arp_.set_ip_address(ip);
    ip_layer_.local_ip_ = ip;
}

std::string TcpIpStack::hex_dump(const u8* data, size_t len) {
    std::ostringstream oss;
    for (size_t i = 0; i < len; i++) {
        oss << std::hex << std::setw(2) << std::setfill('0')
            << static_cast<int>(data[i]) << " ";
        if ((i + 1) % 16 == 0) oss << "\n";
    }
    return oss.str();
}

void TcpIpStack::send_to_driver(const std::vector<u8>& packet) {
    std::ostringstream info;
    info << "TX " << packet.size() << " bytes";
    std::string hex = hex_dump(packet.data(), packet.size());
    bus_.publish_packet("tx", "ETH", info.str(), hex);

    pcap_writer_.add_packet(packet.data(), packet.size());

    driver_.tx_packet(packet);
}

void TcpIpStack::handle_from_driver(const std::vector<u8>& packet) {
    std::ostringstream info;
    info << "RX " << packet.size() << " bytes";
    std::string hex = hex_dump(packet.data(), packet.size());
    bus_.publish_packet("rx", "ETH", info.str(), hex);

    pcap_writer_.add_packet(packet.data(), packet.size());

    Buffer buf(packet.data(), packet.size());
    ethernet_.handle_rx(buf);
}

void TcpIpStack::tick() {
    driver_.tick();
    tcp_.tick();

    std::vector<u8> packet;
    while (driver_.rx_packet(packet)) {
        handle_from_driver(packet);
        packet.clear();
    }
}

void TcpIpStack::ping(const IpAddress& dst_ip, u16 id, u16 seq) {
    MacAddress mac = arp_.lookup(dst_ip);
    if (mac.is_zero()) {
        arp_.send_request(dst_ip);
    }
    icmp_.send_echo_request(dst_ip, id, seq);
}

void TcpIpStack::tcp_connect(const IpAddress& dst_ip, u16 dst_port, u16 src_port) {
    tcp_.connect(ip_addr_.addr, src_port, dst_ip.addr, dst_port);
}

void TcpIpStack::tcp_listen(u16 port) {
    tcp_.listen(port);
}

void TcpIpStack::simulate_zero_window(u16 local_port) {
    tcp_.simulate_zero_window(local_port);
}

void TcpIpStack::toggle_keep_alive(u16 local_port, bool enabled) {
    tcp_.toggle_keep_alive(local_port, enabled);
}

std::vector<u8> TcpIpStack::get_pcap_data() {
    return pcap_writer_.data();
}

void TcpIpStack::clear_pcap_buffer() {
    pcap_writer_.clear();
}

}

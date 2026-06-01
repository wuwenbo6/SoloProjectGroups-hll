#include "net/arp.h"
#include "net/ethernet.h"
#include "stack.h"
#include <cstring>
#include <sstream>

namespace net {

ArpLayer::ArpLayer()
    : eth_layer_(nullptr) {
}

bool ArpLayer::parse(Buffer& buf, ArpPacket& out_pkt) {
    if (buf.available() < ARP_PACKET_LEN) {
        return false;
    }

    out_pkt.hw_type = (ntohs)(buf.read<u16>());
    out_pkt.proto_type = (ntohs)(buf.read<u16>());
    out_pkt.hw_len = buf.read<u8>();
    out_pkt.proto_len = buf.read<u8>();
    out_pkt.operation = (ntohs)(buf.read<u16>());
    buf.read(out_pkt.sender_mac.addr.data(), 6);
    out_pkt.sender_ip = (ntohl)(buf.read<u32>());
    buf.read(out_pkt.target_mac.addr.data(), 6);
    out_pkt.target_ip = (ntohl)(buf.read<u32>());

    return true;
}

void ArpLayer::learn(IpAddress ip, MacAddress mac) {
    arp_cache_[ip] = mac;
}

MacAddress ArpLayer::lookup(IpAddress ip) {
    auto it = arp_cache_.find(ip);
    if (it != arp_cache_.end()) {
        return it->second;
    }
    return MacAddress();
}

void ArpLayer::handle_request(Buffer& buf) {
    ArpPacket pkt;
    if (!parse(buf, pkt)) {
        return;
    }

    if (pkt.hw_type != ARP_HW_ETHERNET ||
        pkt.proto_type != ARP_PROTO_IPV4 ||
        pkt.hw_len != ARP_HW_LEN ||
        pkt.proto_len != ARP_PROTO_LEN) {
        return;
    }

    learn(IpAddress(pkt.sender_ip), pkt.sender_mac);

    if (pkt.operation == ARP_OP_REQUEST && IpAddress(pkt.target_ip) == ip_) {
        send_reply(pkt);
    } else if (pkt.operation == ARP_OP_REPLY) {
        handle_reply(buf);
    }
}

void ArpLayer::handle_reply(Buffer& buf) {
    ArpPacket pkt;
    if (!parse(buf, pkt)) {
        return;
    }

    if (pkt.hw_type != ARP_HW_ETHERNET ||
        pkt.proto_type != ARP_PROTO_IPV4 ||
        pkt.hw_len != ARP_HW_LEN ||
        pkt.proto_len != ARP_PROTO_LEN) {
        return;
    }

    learn(IpAddress(pkt.sender_ip), pkt.sender_mac);
}

void ArpLayer::send_reply(const ArpPacket& request) {
    if (!eth_layer_) {
        return;
    }

    Buffer buf;

    buf.write((htons)(ARP_HW_ETHERNET));
    buf.write((htons)(ARP_PROTO_IPV4));
    buf.write(ARP_HW_LEN);
    buf.write(ARP_PROTO_LEN);
    buf.write((htons)(ARP_OP_REPLY));
    buf.write(eth_layer_->mac_address().addr.data(), 6);
    buf.write((htonl)(ip_.addr));
    buf.write(request.sender_mac.addr.data(), 6);
    buf.write((htonl)(request.sender_ip));

    Buffer send_buf;
    eth_layer_->encapsulate(send_buf, request.sender_mac, eth_layer_->mac_address(), ETH_TYPE_ARP);
    send_buf.write(buf.data(), buf.size());

    std::ostringstream info;
    info << "ARP Reply " << ip_.to_string() << " -> "
         << IpAddress(request.sender_ip).to_string();
    std::string hex = TcpIpStack::hex_dump(send_buf.data(), send_buf.available());
    TcpIpStack::instance().bus().publish_packet(
        "tx", "ARP", info.str(), hex, "ARP Reply (gratuitous)");

    std::vector<u8> packet(send_buf.data(), send_buf.data() + send_buf.available());
    TcpIpStack::instance().send_to_driver(packet);
}

void ArpLayer::send_request(IpAddress ip) {
    if (!eth_layer_) {
        return;
    }

    MacAddress broadcast_mac(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF);

    Buffer buf;

    buf.write((htons)(ARP_HW_ETHERNET));
    buf.write((htons)(ARP_PROTO_IPV4));
    buf.write(ARP_HW_LEN);
    buf.write(ARP_PROTO_LEN);
    buf.write((htons)(ARP_OP_REQUEST));
    buf.write(eth_layer_->mac_address().addr.data(), 6);
    buf.write((htonl)(ip_.addr));
    buf.write(MacAddress().addr.data(), 6);
    buf.write((htonl)(ip.addr));

    Buffer send_buf;
    eth_layer_->encapsulate(send_buf, broadcast_mac, eth_layer_->mac_address(), ETH_TYPE_ARP);
    send_buf.write(buf.data(), buf.size());

    std::ostringstream info;
    info << "ARP Request who-has " << ip.to_string() << " tell " << ip_.to_string();
    std::string hex = TcpIpStack::hex_dump(send_buf.data(), send_buf.available());
    TcpIpStack::instance().bus().publish_packet(
        "tx", "ARP", info.str(), hex, "ARP Request (broadcast)");

    std::vector<u8> packet(send_buf.data(), send_buf.data() + send_buf.available());
    TcpIpStack::instance().send_to_driver(packet);
}

}

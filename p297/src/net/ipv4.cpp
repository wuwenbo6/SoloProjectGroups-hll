#include "net/ipv4.h"
#include "net/icmp.h"
#include "net/tcp.h"
#include "stack.h"
#include "common/byte_order.h"
#include "common/checksum.h"
#include <cstring>
#include <sstream>
#include <iomanip>

namespace net {

IpLayer g_ip_layer;

bool IpLayer::parse(Buffer& buf, IpHeader& out_hdr) {
    if (buf.available() < IP_HEADER_MIN) {
        return false;
    }

    out_hdr.ver_ihl = buf.read<u8>();
    out_hdr.tos = buf.read<u8>();
    out_hdr.total_len = ntohs(buf.read<u16>());
    out_hdr.id = ntohs(buf.read<u16>());
    out_hdr.frag_off = ntohs(buf.read<u16>());
    out_hdr.ttl = buf.read<u8>();
    out_hdr.protocol = buf.read<u8>();
    out_hdr.checksum = ntohs(buf.read<u16>());
    out_hdr.src = ntohl(buf.read<u32>());
    out_hdr.dst = ntohl(buf.read<u32>());

    u8 ihl = (out_hdr.ver_ihl & 0x0F) * 4;
    if (ihl > IP_HEADER_MIN) {
        buf.skip(ihl - IP_HEADER_MIN);
    }

    return true;
}

void IpLayer::encapsulate(Buffer& buf, u8 protocol, IpAddress src, IpAddress dst, u16 payload_len) {
    IpHeader hdr;
    hdr.ver_ihl = 0x45;
    hdr.tos = 0;
    hdr.total_len = IP_HEADER_MIN + payload_len;
    hdr.id = next_id_++;
    hdr.frag_off = 0;
    hdr.ttl = 64;
    hdr.protocol = protocol;
    hdr.checksum = 0;
    hdr.src = src.addr;
    hdr.dst = dst.addr;

    Buffer hdr_buf(IP_HEADER_MIN);
    hdr_buf.write<u8>(hdr.ver_ihl);
    hdr_buf.write<u8>(hdr.tos);
    hdr_buf.write<u16>(htons(hdr.total_len));
    hdr_buf.write<u16>(htons(hdr.id));
    hdr_buf.write<u16>(htons(hdr.frag_off));
    hdr_buf.write<u8>(hdr.ttl);
    hdr_buf.write<u8>(hdr.protocol);
    hdr_buf.write<u16>(0);
    hdr_buf.write<u32>(htonl(hdr.src));
    hdr_buf.write<u32>(htonl(hdr.dst));

    hdr.checksum = checksum(hdr_buf.data(), IP_HEADER_MIN);

    buf.write<u8>(hdr.ver_ihl);
    buf.write<u8>(hdr.tos);
    buf.write<u16>(htons(hdr.total_len));
    buf.write<u16>(htons(hdr.id));
    buf.write<u16>(htons(hdr.frag_off));
    buf.write<u8>(hdr.ttl);
    buf.write<u8>(hdr.protocol);
    buf.write<u16>(htons(hdr.checksum));
    buf.write<u32>(htonl(hdr.src));
    buf.write<u32>(htonl(hdr.dst));
}

void IpLayer::handle_rx(Buffer& buf) {
    IpHeader hdr;
    if (!parse(buf, hdr)) {
        return;
    }

    IpAddress src_ip(hdr.src);
    IpAddress dst_ip(hdr.dst);

    if (dst_ip != local_ip_ && !dst_ip.is_broadcast()) {
        return;
    }

    switch (hdr.protocol) {
        case IP_PROTO_ICMP:
            g_icmp_layer.handle_rx(buf, src_ip);
            break;
        case IP_PROTO_TCP:
            g_tcp_layer.handle_rx(buf, src_ip, dst_ip);
            break;
        default:
            break;
    }
}

void IpLayer::send(IpAddress dst, u8 protocol, Buffer& payload) {
    Buffer buf;
    encapsulate(buf, protocol, local_ip_, dst, static_cast<u16>(payload.available()));
    buf.write(payload.peek(), payload.available());

    std::ostringstream info;
    info << "IP " << protocol << " " << local_ip_.to_string() << " -> " << dst.to_string();
    std::string hex = TcpIpStack::hex_dump(buf.data(), buf.available());

    std::string proto_name = "IP";
    std::string details;
    if (protocol == IP_PROTO_ICMP) {
        proto_name = "ICMP";
        details = "Ping request/reply";
    } else if (protocol == IP_PROTO_TCP) {
        proto_name = "TCP";
        details = "TCP segment";
    }

    TcpIpStack::instance().bus().publish_packet("tx", proto_name, info.str(), hex, details);

    MacAddress dst_mac = TcpIpStack::instance().arp().lookup(dst);
    if (dst_mac.is_zero()) {
        TcpIpStack::instance().arp().send_request(dst);
        dst_mac = MacAddress(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF);
    }

    Buffer eth_buf;
    TcpIpStack::instance().ethernet().encapsulate(
        eth_buf, dst_mac, TcpIpStack::instance().ethernet().mac_address(), ETH_TYPE_IPV4);
    eth_buf.write(buf.data(), buf.available());

    std::vector<u8> packet(eth_buf.data(), eth_buf.data() + eth_buf.available());
    TcpIpStack::instance().send_to_driver(packet);
}

}

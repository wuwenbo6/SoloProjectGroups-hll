#include "net/ethernet.h"
#include "net/arp.h"
#include "net/ipv4.h"
#include "stack.h"
#include <cstring>
#include <sstream>

namespace net {

EthernetLayer::EthernetLayer()
    : arp_layer_(nullptr), ip_layer_(nullptr) {
}

bool EthernetLayer::parse(Buffer& buf, EthernetHeader& out_hdr) {
    if (buf.available() < ETH_HEADER_LEN) {
        return false;
    }

    buf.read(out_hdr.dst.addr.data(), 6);
    buf.read(out_hdr.src.addr.data(), 6);
    out_hdr.type = ntohs(buf.read<u16>());

    return true;
}

void EthernetLayer::encapsulate(Buffer& buf, const MacAddress& dst, const MacAddress& src, u16 type) {
    buf.write(dst.addr.data(), 6);
    buf.write(src.addr.data(), 6);
    buf.write((htons)(type));
}

void EthernetLayer::handle_rx(Buffer& buf) {
    EthernetHeader hdr;

    if (!parse(buf, hdr)) {
        return;
    }

    if (hdr.dst != mac_ && !hdr.dst.is_broadcast()) {
        return;
    }

    std::ostringstream info;
    info << hdr.src.to_string() << " -> " << hdr.dst.to_string()
         << " type: 0x" << std::hex << hdr.type;

    std::string proto = "ETH";
    std::string details;
    if (hdr.type == ETH_TYPE_ARP) {
        proto = "ARP";
        details = "Address Resolution Protocol";
    } else if (hdr.type == ETH_TYPE_IPV4) {
        proto = "IPv4";
        details = "Internet Protocol version 4";
    }

    std::string hex = TcpIpStack::hex_dump(buf.peek(), buf.available());
    TcpIpStack::instance().bus().publish_packet("rx", proto, info.str(), hex, details);

    switch (hdr.type) {
        case ETH_TYPE_ARP:
            if (arp_layer_) {
                arp_layer_->handle_request(buf);
            }
            break;
        case ETH_TYPE_IPV4:
            if (ip_layer_) {
                ip_layer_->handle_rx(buf);
            }
            break;
        default:
            break;
    }
}

}

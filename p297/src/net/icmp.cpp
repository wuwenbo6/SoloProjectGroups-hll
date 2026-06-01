#include "net/icmp.h"
#include "net/ipv4.h"
#include "stack.h"
#include "common/byte_order.h"
#include "common/checksum.h"
#include <sstream>

namespace net {

IcmpLayer g_icmp_layer;

static u16 calculate_icmp_checksum(const u8* data, size_t len) {
    return checksum(data, len);
}

void IcmpLayer::handle_rx(Buffer& buf, IpAddress src_ip) {
    if (buf.available() < 8) {
        return;
    }

    IcmpHeader hdr;
    hdr.type = buf.read<u8>();
    hdr.code = buf.read<u8>();
    hdr.checksum = ntohs(buf.read<u16>());
    hdr.echo_id = ntohs(buf.read<u16>());
    hdr.echo_seq = ntohs(buf.read<u16>());

    size_t data_len = buf.available();
    const u8* data = buf.peek();

    if (hdr.type == ICMP_ECHO_REQUEST && hdr.code == 0) {
        std::ostringstream ping_event;
        ping_event << "{"
                   << "\"type\":\"ping_result\","
                   << "\"direction\":\"rx\","
                   << "\"src_ip\":\"" << src_ip.to_string() << "\","
                   << "\"id\":" << hdr.echo_id << ","
                   << "\"seq\":" << hdr.echo_seq << ","
                   << "\"status\":\"request_received\""
                   << "}";
        TcpIpStack::instance().bus().publish("ping_result", ping_event.str());

        send_echo_reply(src_ip, hdr.echo_id, hdr.echo_seq, data, data_len);
    } else if (hdr.type == ICMP_ECHO_REPLY && hdr.code == 0) {
        std::ostringstream ping_event;
        ping_event << "{"
                   << "\"type\":\"ping_result\","
                   << "\"direction\":\"rx\","
                   << "\"src_ip\":\"" << src_ip.to_string() << "\","
                   << "\"id\":" << hdr.echo_id << ","
                   << "\"seq\":" << hdr.echo_seq << ","
                   << "\"status\":\"reply_received\""
                   << "}";
        TcpIpStack::instance().bus().publish("ping_result", ping_event.str());
    }
}

void IcmpLayer::send_echo_reply(IpAddress dst, u16 id, u16 seq, const u8* data, size_t len) {
    Buffer payload;
    size_t icmp_len = 8 + len;

    IcmpHeader hdr;
    hdr.type = ICMP_ECHO_REPLY;
    hdr.code = 0;
    hdr.checksum = 0;
    hdr.echo_id = id;
    hdr.echo_seq = seq;

    Buffer checksum_buf(icmp_len);
    checksum_buf.write<u8>(hdr.type);
    checksum_buf.write<u8>(hdr.code);
    checksum_buf.write<u16>(0);
    checksum_buf.write<u16>(htons(hdr.echo_id));
    checksum_buf.write<u16>(htons(hdr.echo_seq));
    checksum_buf.write(data, len);

    hdr.checksum = calculate_icmp_checksum(checksum_buf.data(), icmp_len);

    payload.write<u8>(hdr.type);
    payload.write<u8>(hdr.code);
    payload.write<u16>(htons(hdr.checksum));
    payload.write<u16>(htons(hdr.echo_id));
    payload.write<u16>(htons(hdr.echo_seq));
    payload.write(data, len);

    std::ostringstream ping_event;
    ping_event << "{"
               << "\"type\":\"ping_result\","
               << "\"direction\":\"tx\","
               << "\"dst_ip\":\"" << dst.to_string() << "\","
               << "\"id\":" << hdr.echo_id << ","
               << "\"seq\":" << hdr.echo_seq << ","
               << "\"status\":\"reply_sent\""
               << "}";
    TcpIpStack::instance().bus().publish("ping_result", ping_event.str());

    g_ip_layer.send(dst, IP_PROTO_ICMP, payload);
}

void IcmpLayer::send_echo_request(IpAddress dst, u16 id, u16 seq) {
    Buffer payload;
    const size_t icmp_len = 8;

    IcmpHeader hdr;
    hdr.type = ICMP_ECHO_REQUEST;
    hdr.code = 0;
    hdr.checksum = 0;
    hdr.echo_id = id;
    hdr.echo_seq = seq;

    Buffer checksum_buf(icmp_len);
    checksum_buf.write<u8>(hdr.type);
    checksum_buf.write<u8>(hdr.code);
    checksum_buf.write<u16>(0);
    checksum_buf.write<u16>(htons(hdr.echo_id));
    checksum_buf.write<u16>(htons(hdr.echo_seq));

    hdr.checksum = calculate_icmp_checksum(checksum_buf.data(), icmp_len);

    payload.write<u8>(hdr.type);
    payload.write<u8>(hdr.code);
    payload.write<u16>(htons(hdr.checksum));
    payload.write<u16>(htons(hdr.echo_id));
    payload.write<u16>(htons(hdr.echo_seq));

    std::ostringstream ping_event;
    ping_event << "{"
               << "\"type\":\"ping_result\","
               << "\"direction\":\"tx\","
               << "\"dst_ip\":\"" << dst.to_string() << "\","
               << "\"id\":" << hdr.echo_id << ","
               << "\"seq\":" << hdr.echo_seq << ","
               << "\"status\":\"request_sent\""
               << "}";
    TcpIpStack::instance().bus().publish("ping_result", ping_event.str());

    g_ip_layer.send(dst, IP_PROTO_ICMP, payload);
}

}

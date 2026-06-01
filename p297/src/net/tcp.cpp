#include "net/tcp.h"
#include "net/ipv4.h"
#include "stack.h"
#include "common/checksum.h"
#include "common/byte_order.h"
#include <cstring>
#include <random>
#include <stdexcept>
#include <sstream>
#include <iomanip>
#include <chrono>

namespace net {

TcpLayer g_tcp_layer;

constexpr u32 DEFAULT_WINDOW = 65535;

u32 TcpLayer::generate_iss() {
    static std::mt19937 gen(std::random_device{}());
    static std::uniform_int_distribution<u32> dist;
    return dist(gen);
}

bool TcpLayer::parse_header(Buffer& buf, TcpHeader& hdr) {
    if (buf.available() < TCP_HEADER_MIN) {
        return false;
    }

    hdr.src_port = ntohs(buf.read<u16>());
    hdr.dst_port = ntohs(buf.read<u16>());
    hdr.seq = ntohl(buf.read<u32>());
    hdr.ack = ntohl(buf.read<u32>());
    u8 data_off_flags = buf.read<u8>();
    hdr.data_off = (data_off_flags >> 4) * 4;
    hdr.flags = buf.read<u8>();
    hdr.window = ntohs(buf.read<u16>());
    hdr.checksum = ntohs(buf.read<u16>());
    hdr.urgent = ntohs(buf.read<u16>());

    if (hdr.data_off < TCP_HEADER_MIN || hdr.data_off > buf.available() + TCP_HEADER_MIN) {
        return false;
    }

    size_t options_len = hdr.data_off - TCP_HEADER_MIN;
    if (options_len > 0) {
        buf.skip(options_len);
    }

    return true;
}

void TcpLayer::build_header(TcpHeader& hdr, const TcpConnection* conn, u8 flags) {
    hdr.src_port = htons(conn->local_port);
    hdr.dst_port = htons(conn->remote_port);
    hdr.seq = htonl(conn->snd_nxt);
    hdr.ack = htonl(conn->rcv_nxt);
    hdr.data_off = (TCP_HEADER_MIN / 4) << 4;
    hdr.flags = flags;
    hdr.window = htons(static_cast<u16>(conn->rcv_wnd));
    hdr.checksum = 0;
    hdr.urgent = 0;
}

u16 TcpLayer::compute_checksum(const TcpHeader& hdr, const u8* data, size_t len,
                               u32 src_ip, u32 dst_ip) {
    size_t total_len = TCP_HEADER_MIN + len;
    std::vector<u8> segment(total_len);

    TcpHeader hdr_copy = hdr;
    hdr_copy.src_port = htons(hdr.src_port);
    hdr_copy.dst_port = htons(hdr.dst_port);
    hdr_copy.seq = htonl(hdr.seq);
    hdr_copy.ack = htonl(hdr.ack);
    hdr_copy.window = htons(hdr.window);
    hdr_copy.checksum = 0;
    hdr_copy.urgent = htons(hdr.urgent);

    std::memcpy(segment.data(), &hdr_copy, TCP_HEADER_MIN);
    if (data && len > 0) {
        std::memcpy(segment.data() + TCP_HEADER_MIN, data, len);
    }

    return transport_checksum(segment.data(), total_len, src_ip, dst_ip, IP_PROTO_TCP);
}

TcpConnection* TcpLayer::find_connection(u32 local_ip, u16 local_port,
                                         u32 remote_ip, u16 remote_port) {
    for (auto& conn : connections_) {
        if (conn->local_ip == local_ip &&
            conn->remote_ip == remote_ip &&
            conn->local_port == local_port &&
            conn->remote_port == remote_port) {
            return conn.get();
        }
    }

    for (auto& conn : connections_) {
        if (conn->state == LISTEN &&
            conn->local_ip == local_ip &&
            conn->local_port == local_port) {
            return conn.get();
        }
    }

    return nullptr;
}

TcpConnection* TcpLayer::create_connection(u32 local_ip, u16 local_port,
                                           u32 remote_ip, u16 remote_port,
                                           bool active) {
    auto conn = std::make_shared<TcpConnection>();
    conn->local_ip = local_ip;
    conn->remote_ip = remote_ip;
    conn->local_port = local_port;
    conn->remote_port = remote_port;
    conn->snd_wnd = DEFAULT_WINDOW;
    conn->rcv_wnd = DEFAULT_WINDOW;
    conn->iss = generate_iss();
    conn->irs = 0;
    conn->snd_una = conn->iss;

    if (active) {
        conn->state = SYN_SENT;
        conn->snd_nxt = conn->iss + 1;
    } else {
        conn->state = LISTEN;
        conn->snd_nxt = conn->iss;
    }

    conn->rcv_nxt = 0;
    conn->last_activity_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    connections_.push_back(conn);
    return conn.get();
}

void TcpLayer::connect(u32 local_ip, u16 local_port,
                       u32 remote_ip, u16 remote_port) {
    TcpConnection* conn = find_connection(local_ip, local_port, remote_ip, remote_port);
    if (!conn) {
        conn = create_connection(local_ip, local_port, remote_ip, remote_port, true);
    }
    send_segment(conn, SYN, nullptr, 0);
}

void TcpLayer::listen(u16 port) {
    TcpConnection* conn = find_connection(0, port, 0, 0);
    if (!conn) {
        conn = create_connection(0, port, 0, 0, false);
    }
    conn->state = LISTEN;
}

void TcpLayer::handle_syn(TcpConnection* conn, const TcpHeader& hdr) {
    conn->irs = hdr.seq;
    conn->rcv_nxt = hdr.seq + 1;
    conn->snd_una = conn->iss;

    if (conn->state == LISTEN) {
        conn->state = SYN_RCVD;
        conn->snd_nxt = conn->iss + 1;
        send_segment(conn, SYN | ACK, nullptr, 0);
    } else if (conn->state == SYN_SENT) {
        conn->state = ESTABLISHED;
        conn->snd_una = conn->iss + 1;
        send_segment(conn, ACK, nullptr, 0);
    }
}

void TcpLayer::handle_ack(TcpConnection* conn, const TcpHeader& hdr) {
    if (hdr.ack >= conn->snd_una) {
        conn->snd_una = hdr.ack;
    }

    if (conn->snd_wnd == 0 && hdr.window > 0) {
        conn->last_zero_probe_ts = 0;
    }
    conn->snd_wnd = hdr.window;

    if (conn->state == SYN_RCVD) {
        conn->state = ESTABLISHED;
    } else if (conn->state == FIN_WAIT_1) {
        conn->state = FIN_WAIT_2;
    } else if (conn->state == CLOSING) {
        conn->state = TIME_WAIT;
    } else if (conn->state == LAST_ACK) {
        conn->state = CLOSED;
    } else if (conn->state == TIME_WAIT) {
    }
}

void TcpLayer::process_data(TcpConnection* conn, const u8* data, size_t len) {
    if (len > 0) {
        conn->rcv_nxt += len;
        send_segment(conn, ACK, nullptr, 0);
    }
    (void)data;
}

std::string tcp_flags_to_string(u8 flags) {
    std::ostringstream oss;
    if (flags & SYN) oss << "SYN ";
    if (flags & ACK) oss << "ACK ";
    if (flags & FIN) oss << "FIN ";
    if (flags & RST) oss << "RST ";
    if (flags & PSH) oss << "PSH ";
    if (flags & URG) oss << "URG ";
    return oss.str();
}

std::string tcp_state_to_string(int state) {
    switch (state) {
        case CLOSED: return "CLOSED";
        case LISTEN: return "LISTEN";
        case SYN_SENT: return "SYN_SENT";
        case SYN_RCVD: return "SYN_RCVD";
        case ESTABLISHED: return "ESTABLISHED";
        case FIN_WAIT_1: return "FIN_WAIT_1";
        case FIN_WAIT_2: return "FIN_WAIT_2";
        case CLOSE_WAIT: return "CLOSE_WAIT";
        case LAST_ACK: return "LAST_ACK";
        case CLOSING: return "CLOSING";
        case TIME_WAIT: return "TIME_WAIT";
        default: return "UNKNOWN";
    }
}

void TcpLayer::send_segment(TcpConnection* conn, u8 flags, const u8* data, size_t len) {
    if (!conn) {
        return;
    }

    conn->last_activity_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
    conn->keep_alive_probes_sent = 0;

    TcpHeader hdr;
    build_header(hdr, conn, flags);

    u32 seq_inc = len;
    if (flags & SYN) seq_inc++;
    if (flags & FIN) seq_inc++;
    conn->snd_nxt += seq_inc;

    hdr.checksum = compute_checksum(hdr, data, len, conn->local_ip, conn->remote_ip);

    Buffer out(TCP_HEADER_MIN + len);
    out.write(hdr.src_port);
    out.write(hdr.dst_port);
    out.write(hdr.seq);
    out.write(hdr.ack);
    u8 data_off = (TCP_HEADER_MIN / 4) << 4;
    out.write(data_off);
    out.write(hdr.flags);
    out.write(hdr.window);
    out.write(hdr.checksum);
    out.write(hdr.urgent);

    if (data && len > 0) {
        out.write(data, len);
    }

    std::ostringstream info;
    info << ntohs(hdr.src_port) << " -> " << ntohs(hdr.dst_port)
         << " [" << tcp_flags_to_string(flags) << "] "
         << "SEQ=" << ntohl(hdr.seq)
         << " ACK=" << ntohl(hdr.ack)
         << " WIN=" << ntohs(hdr.window);

    std::ostringstream details;
    details << "TCP Segment\n"
            << "Flags: " << tcp_flags_to_string(flags) << "\n"
            << "SEQ: " << ntohl(hdr.seq) << "\n"
            << "ACK: " << ntohl(hdr.ack) << "\n"
            << "Window: " << ntohs(hdr.window) << "\n"
            << "Payload length: " << len << "\n"
            << "Connection state: " << tcp_state_to_string(conn->state);

    std::string hex = TcpIpStack::hex_dump(out.data(), out.available());
    TcpIpStack::instance().bus().publish_packet(
        "tx", "TCP", info.str(), hex, details.str());

    std::ostringstream tcp_event;
    tcp_event << "{"
              << "\"type\":\"tcp_segment\","
              << "\"direction\":\"tx\","
              << "\"src_port\":" << ntohs(hdr.src_port) << ","
              << "\"dst_port\":" << ntohs(hdr.dst_port) << ","
              << "\"seq\":" << ntohl(hdr.seq) << ","
              << "\"ack\":" << ntohl(hdr.ack) << ","
              << "\"snd_una\":" << conn->snd_una << ","
              << "\"flags\":\"" << tcp_flags_to_string(flags) << "\","
              << "\"window\":" << ntohs(hdr.window) << ","
              << "\"state\":\"" << tcp_state_to_string(conn->state) << "\","
              << "\"payload_len\":" << len
              << "}";
    TcpIpStack::instance().bus().publish("tcp_segment", tcp_event.str());

    Buffer payload;
    payload.write(out.data(), out.available());
    g_ip_layer.send(IpAddress(conn->remote_ip), IP_PROTO_TCP, payload);
}

void TcpLayer::handle_rx(Buffer& buf, IpAddress src_ip, IpAddress dst_ip) {
    size_t buf_len = buf.available();
    if (buf_len < TCP_HEADER_MIN) {
        return;
    }

    TcpHeader hdr;
    if (!parse_header(buf, hdr)) {
        return;
    }

    u64 now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    u16 recv_checksum = hdr.checksum;
    size_t data_len = buf.available();

    u16 calc_checksum = compute_checksum(hdr, buf.peek(), data_len,
                                         src_ip.addr, dst_ip.addr);
    if (recv_checksum != calc_checksum) {
        return;
    }

    TcpConnection* conn = find_connection(dst_ip.addr, hdr.dst_port,
                                          src_ip.addr, hdr.src_port);

    if (conn) {
        conn->last_activity_ts = now;
        conn->keep_alive_probes_sent = 0;
    }

    if (!conn) {
        if (hdr.flags & RST) {
            return;
        }
        if (hdr.flags & SYN) {
            conn = create_connection(dst_ip.addr, hdr.dst_port,
                                     src_ip.addr, hdr.src_port, false);
            conn->state = LISTEN;
        } else {
            send_segment(nullptr, RST, nullptr, 0);
            return;
        }
    }

    if (hdr.flags & RST) {
        conn->state = CLOSED;
        return;
    }

    std::ostringstream rx_info;
    rx_info << hdr.src_port << " -> " << hdr.dst_port
            << " [" << tcp_flags_to_string(hdr.flags) << "] "
            << "SEQ=" << hdr.seq
            << " ACK=" << hdr.ack
            << " WIN=" << hdr.window;

    std::ostringstream rx_details;
    rx_details << "TCP Segment Received\n"
               << "Flags: " << tcp_flags_to_string(hdr.flags) << "\n"
               << "SEQ: " << hdr.seq << "\n"
               << "ACK: " << hdr.ack << "\n"
               << "Window: " << hdr.window << "\n"
               << "Payload length: " << data_len << "\n"
               << "Connection state: " << tcp_state_to_string(conn->state);

    std::ostringstream tcp_event;
    tcp_event << "{"
              << "\"type\":\"tcp_segment\","
              << "\"direction\":\"rx\","
              << "\"src_port\":" << hdr.src_port << ","
              << "\"dst_port\":" << hdr.dst_port << ","
              << "\"seq\":" << hdr.seq << ","
              << "\"ack\":" << hdr.ack << ","
              << "\"snd_una\":" << conn->snd_una << ","
              << "\"flags\":\"" << tcp_flags_to_string(hdr.flags) << "\","
              << "\"window\":" << hdr.window << ","
              << "\"state\":\"" << tcp_state_to_string(conn->state) << "\","
              << "\"payload_len\":" << data_len
              << "}";
    TcpIpStack::instance().bus().publish("tcp_segment", tcp_event.str());

    int old_state = conn->state;

    switch (conn->state) {
        case LISTEN:
            if (hdr.flags & SYN) {
                conn->remote_ip = src_ip.addr;
                conn->remote_port = hdr.src_port;
                conn->local_ip = dst_ip.addr;
                handle_syn(conn, hdr);
            }
            break;

        case SYN_SENT:
            if ((hdr.flags & (SYN | ACK)) == (SYN | ACK)) {
                if (hdr.ack == conn->iss + 1) {
                    handle_syn(conn, hdr);
                    handle_ack(conn, hdr);
                }
            } else if (hdr.flags & SYN) {
                handle_syn(conn, hdr);
            }
            break;

        case SYN_RCVD:
            if (hdr.flags & ACK) {
                handle_ack(conn, hdr);
            }
            break;

        case ESTABLISHED:
            if (hdr.flags & FIN) {
                conn->rcv_nxt = hdr.seq + 1;
                conn->state = CLOSE_WAIT;
                send_segment(conn, ACK, nullptr, 0);
                send_segment(conn, FIN | ACK, nullptr, 0);
                conn->state = LAST_ACK;
            } else {
                if (hdr.flags & ACK) {
                    handle_ack(conn, hdr);
                }
                if (data_len > 0) {
                    process_data(conn, buf.peek(), data_len);
                }
            }
            break;

        case FIN_WAIT_1:
            if (hdr.flags & ACK) {
                handle_ack(conn, hdr);
            }
            if (hdr.flags & FIN) {
                conn->rcv_nxt = hdr.seq + 1;
                send_segment(conn, ACK, nullptr, 0);
                if (conn->state == FIN_WAIT_1) {
                    conn->state = CLOSING;
                } else if (conn->state == FIN_WAIT_2) {
                    conn->state = TIME_WAIT;
                }
            }
            break;

        case FIN_WAIT_2:
            if (hdr.flags & FIN) {
                conn->rcv_nxt = hdr.seq + 1;
                conn->state = TIME_WAIT;
                send_segment(conn, ACK, nullptr, 0);
            }
            break;

        case CLOSE_WAIT:
            if (hdr.flags & ACK) {
                handle_ack(conn, hdr);
            }
            break;

        case LAST_ACK:
            if (hdr.flags & ACK) {
                handle_ack(conn, hdr);
            }
            break;

        case CLOSING:
            if (hdr.flags & ACK) {
                handle_ack(conn, hdr);
            }
            break;

        case TIME_WAIT:
            if (hdr.flags & FIN) {
                send_segment(conn, ACK, nullptr, 0);
            }
            break;

        case CLOSED:
            break;
    }

    if (old_state != conn->state) {
        std::ostringstream state_event;
        state_event << "{"
                    << "\"type\":\"tcp_state_change\","
                    << "\"old_state\":\"" << tcp_state_to_string(old_state) << "\","
                    << "\"new_state\":\"" << tcp_state_to_string(conn->state) << "\","
                    << "\"local_port\":" << conn->local_port << ","
                    << "\"remote_port\":" << conn->remote_port
                    << "}";
        TcpIpStack::instance().bus().publish("tcp_state_change", state_event.str());
    }
}

void TcpLayer::tick() {
    auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();

    for (auto& conn : connections_) {
        if (conn->state != ESTABLISHED && conn->state != CLOSE_WAIT) {
            continue;
        }

        if (conn->snd_wnd == 0) {
            u64 elapsed = static_cast<u64>(now) - conn->last_zero_probe_ts;
            if (elapsed >= TcpConnection::ZERO_PROBE_INTERVAL_MS) {
                send_zero_window_probe(conn.get());
                conn->last_zero_probe_ts = static_cast<u64>(now);
            }
        }

        if (conn->keep_alive_enabled) {
            u64 idle_time = static_cast<u64>(now) - conn->last_activity_ts;
            if (idle_time >= TcpConnection::KEEP_ALIVE_IDLE_MS) {
                if (conn->keep_alive_probes_sent >= TcpConnection::KEEP_ALIVE_MAX_PROBES) {
                    conn->state = CLOSED;
                    std::ostringstream state_event;
                    state_event << "{"
                                << "\"type\":\"tcp_state_change\","
                                << "\"old_state\":\"" << tcp_state_to_string(ESTABLISHED) << "\","
                                << "\"new_state\":\"CLOSED\","
                                << "\"local_port\":" << conn->local_port << ","
                                << "\"remote_port\":" << conn->remote_port << ","
                                << "\"reason\":\"keep_alive_timeout\""
                                << "}";
                    TcpIpStack::instance().bus().publish("tcp_state_change", state_event.str());
                    continue;
                }

                u64 probe_interval = (conn->keep_alive_probes_sent == 0) 
                    ? TcpConnection::KEEP_ALIVE_IDLE_MS 
                    : TcpConnection::KEEP_ALIVE_INTERVAL_MS;

                u64 last_probe_time = (conn->keep_alive_probes_sent == 0)
                    ? conn->last_activity_ts
                    : conn->last_activity_ts + TcpConnection::KEEP_ALIVE_IDLE_MS + 
                      (conn->keep_alive_probes_sent - 1) * TcpConnection::KEEP_ALIVE_INTERVAL_MS;

                if (static_cast<u64>(now) >= last_probe_time + probe_interval) {
                    send_keep_alive_probe(conn.get());
                    conn->keep_alive_probes_sent++;
                }
            }
        }
    }
}

void TcpLayer::send_zero_window_probe(TcpConnection* conn) {
    if (!conn) {
        return;
    }

    u8 probe_data = 0;
    u32 saved_snd_nxt = conn->snd_nxt;

    conn->snd_nxt = conn->snd_una;

    TcpHeader hdr;
    build_header(hdr, conn, ACK | PSH);

    hdr.checksum = compute_checksum(hdr, &probe_data, 1, conn->local_ip, conn->remote_ip);

    Buffer out(TCP_HEADER_MIN + 1);
    out.write(hdr.src_port);
    out.write(hdr.dst_port);
    out.write(hdr.seq);
    out.write(hdr.ack);
    u8 data_off = (TCP_HEADER_MIN / 4) << 4;
    out.write(data_off);
    out.write(hdr.flags);
    out.write(hdr.window);
    out.write(hdr.checksum);
    out.write(hdr.urgent);
    out.write(&probe_data, 1);

    std::ostringstream info;
    info << ntohs(hdr.src_port) << " -> " << ntohs(hdr.dst_port)
         << " [ACK PSH] "
         << "SEQ=" << ntohl(hdr.seq)
         << " ACK=" << ntohl(hdr.ack)
         << " WIN=" << ntohs(hdr.window)
         << " (Zero Window Probe)";

    std::ostringstream details;
    details << "TCP Zero Window Probe\n"
            << "Flags: ACK PSH\n"
            << "SEQ: " << ntohl(hdr.seq) << "\n"
            << "ACK: " << ntohl(hdr.ack) << "\n"
            << "Window: " << ntohs(hdr.window) << "\n"
            << "Payload: 1 byte (probe)\n"
            << "Connection state: " << tcp_state_to_string(conn->state);

    std::string hex = TcpIpStack::hex_dump(out.data(), out.available());
    TcpIpStack::instance().bus().publish_packet(
        "tx", "TCP", info.str(), hex, details.str());

    std::ostringstream tcp_event;
    tcp_event << "{"
              << "\"type\":\"tcp_segment\","
              << "\"direction\":\"tx\","
              << "\"src_port\":" << ntohs(hdr.src_port) << ","
              << "\"dst_port\":" << ntohs(hdr.dst_port) << ","
              << "\"seq\":" << ntohl(hdr.seq) << ","
              << "\"ack\":" << ntohl(hdr.ack) << ","
              << "\"flags\":\"ACK PSH \","
              << "\"window\":" << ntohs(hdr.window) << ","
              << "\"state\":\"" << tcp_state_to_string(conn->state) << "\","
              << "\"payload_len\":1,"
              << "\"is_zero_probe\":true"
              << "}";
    TcpIpStack::instance().bus().publish("tcp_segment", tcp_event.str());

    conn->snd_nxt = saved_snd_nxt;

    Buffer payload;
    payload.write(out.data(), out.available());
    g_ip_layer.send(IpAddress(conn->remote_ip), IP_PROTO_TCP, payload);
}

void TcpLayer::simulate_zero_window(u16 local_port) {
    for (auto& conn : connections_) {
        if (conn->local_port == local_port &&
            (conn->state == ESTABLISHED || conn->state == CLOSE_WAIT)) {
            conn->snd_wnd = 0;
            conn->last_zero_probe_ts = 0;

            std::ostringstream event;
            event << "{"
                  << "\"type\":\"zero_window_simulated\","
                  << "\"local_port\":" << local_port << ","
                  << "\"remote_port\":" << conn->remote_port
                  << "}";
            TcpIpStack::instance().bus().publish("zero_window_simulated", event.str());
            break;
        }
    }
}

void TcpLayer::send_keep_alive_probe(TcpConnection* conn) {
    if (!conn) {
        return;
    }

    u32 saved_snd_nxt = conn->snd_nxt;
    conn->snd_nxt = conn->snd_una - 1;

    TcpHeader hdr;
    build_header(hdr, conn, ACK);

    hdr.checksum = compute_checksum(hdr, nullptr, 0, conn->local_ip, conn->remote_ip);

    Buffer out(TCP_HEADER_MIN);
    out.write(hdr.src_port);
    out.write(hdr.dst_port);
    out.write(hdr.seq);
    out.write(hdr.ack);
    u8 data_off = (TCP_HEADER_MIN / 4) << 4;
    out.write(data_off);
    out.write(hdr.flags);
    out.write(hdr.window);
    out.write(hdr.checksum);
    out.write(hdr.urgent);

    std::ostringstream info;
    info << ntohs(hdr.src_port) << " -> " << ntohs(hdr.dst_port)
         << " [ACK] "
         << "SEQ=" << ntohl(hdr.seq)
         << " ACK=" << ntohl(hdr.ack)
         << " WIN=" << ntohs(hdr.window)
         << " (Keep-Alive Probe " << conn->keep_alive_probes_sent + 1 
         << "/" << TcpConnection::KEEP_ALIVE_MAX_PROBES << ")";

    std::ostringstream details;
    details << "TCP Keep-Alive Probe\n"
            << "Flags: ACK\n"
            << "SEQ: " << ntohl(hdr.seq) << "\n"
            << "ACK: " << ntohl(hdr.ack) << "\n"
            << "Window: " << ntohs(hdr.window) << "\n"
            << "Probe: " << conn->keep_alive_probes_sent + 1 
            << "/" << TcpConnection::KEEP_ALIVE_MAX_PROBES << "\n"
            << "Connection state: " << tcp_state_to_string(conn->state);

    std::string hex = TcpIpStack::hex_dump(out.data(), out.available());
    TcpIpStack::instance().bus().publish_packet(
        "tx", "TCP", info.str(), hex, details.str());

    std::ostringstream tcp_event;
    tcp_event << "{"
              << "\"type\":\"tcp_segment\","
              << "\"direction\":\"tx\","
              << "\"src_port\":" << ntohs(hdr.src_port) << ","
              << "\"dst_port\":" << ntohs(hdr.dst_port) << ","
              << "\"seq\":" << ntohl(hdr.seq) << ","
              << "\"ack\":" << ntohl(hdr.ack) << ","
              << "\"snd_una\":" << conn->snd_una << ","
              << "\"flags\":\"ACK \","
              << "\"window\":" << ntohs(hdr.window) << ","
              << "\"state\":\"" << tcp_state_to_string(conn->state) << "\","
              << "\"payload_len\":0,"
              << "\"is_keep_alive\":true,"
              << "\"keep_alive_probe\":" << (conn->keep_alive_probes_sent + 1) << ","
              << "\"keep_alive_max_probes\":" << TcpConnection::KEEP_ALIVE_MAX_PROBES
              << "}";
    TcpIpStack::instance().bus().publish("tcp_segment", tcp_event.str());

    conn->snd_nxt = saved_snd_nxt;

    Buffer payload;
    payload.write(out.data(), out.available());
    g_ip_layer.send(IpAddress(conn->remote_ip), IP_PROTO_TCP, payload);
}

void TcpLayer::toggle_keep_alive(u16 local_port, bool enabled) {
    for (auto& conn : connections_) {
        if (conn->local_port == local_port) {
            conn->keep_alive_enabled = enabled;
            if (enabled) {
                conn->last_activity_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count();
                conn->keep_alive_probes_sent = 0;
            }

            std::ostringstream event;
            event << "{"
                  << "\"type\":\"keep_alive_toggled\","
                  << "\"local_port\":" << local_port << ","
                  << "\"enabled\":" << (enabled ? "true" : "false")
                  << "}";
            TcpIpStack::instance().bus().publish("keep_alive_toggled", event.str());
            break;
        }
    }
}

}

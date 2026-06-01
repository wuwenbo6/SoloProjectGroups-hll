#pragma once
#include "common/types.h"
#include "common/buffer.h"
#include "common/ip_address.h"
#include <vector>
#include <memory>

namespace net {

enum TcpState {
    CLOSED,
    LISTEN,
    SYN_SENT,
    SYN_RCVD,
    ESTABLISHED,
    FIN_WAIT_1,
    FIN_WAIT_2,
    CLOSE_WAIT,
    LAST_ACK,
    CLOSING,
    TIME_WAIT
};

enum TcpFlag {
    FIN = 0x01,
    SYN = 0x02,
    RST = 0x04,
    PSH = 0x08,
    ACK = 0x10,
    URG = 0x20
};

struct TcpHeader {
    u16 src_port;
    u16 dst_port;
    u32 seq;
    u32 ack;
    u8  data_off;
    u8  flags;
    u16 window;
    u16 checksum;
    u16 urgent;
};

struct TcpConnection {
    u32 local_ip;
    u32 remote_ip;
    u16 local_port;
    u16 remote_port;
    u32 snd_nxt;
    u32 snd_una;
    u32 rcv_nxt;
    u32 snd_wnd;
    u32 rcv_wnd;
    u32 iss;
    u32 irs;
    int state;

    u64 last_zero_probe_ts = 0;
    static constexpr u64 ZERO_PROBE_INTERVAL_MS = 500;

    bool keep_alive_enabled = true;
    u64 last_activity_ts = 0;
    u32 keep_alive_probes_sent = 0;
    static constexpr u64 KEEP_ALIVE_IDLE_MS = 2000;
    static constexpr u64 KEEP_ALIVE_INTERVAL_MS = 1000;
    static constexpr u32 KEEP_ALIVE_MAX_PROBES = 9;
};

class TcpLayer {
public:
    TcpLayer() = default;
    ~TcpLayer() = default;

    void handle_rx(Buffer& buf, IpAddress src_ip, IpAddress dst_ip);

    TcpConnection* find_connection(u32 local_ip, u16 local_port,
                                   u32 remote_ip, u16 remote_port);

    TcpConnection* create_connection(u32 local_ip, u16 local_port,
                                     u32 remote_ip, u16 remote_port,
                                     bool active);

    void send_segment(TcpConnection* conn, u8 flags, const u8* data, size_t len);

    void handle_syn(TcpConnection* conn, const TcpHeader& hdr);

    void handle_ack(TcpConnection* conn, const TcpHeader& hdr);

    void process_data(TcpConnection* conn, const u8* data, size_t len);

    void connect(u32 local_ip, u16 local_port,
                 u32 remote_ip, u16 remote_port);

    void listen(u16 port);

    void tick();

    void send_zero_window_probe(TcpConnection* conn);

    void simulate_zero_window(u16 local_port);

    void send_keep_alive_probe(TcpConnection* conn);

    void toggle_keep_alive(u16 local_port, bool enabled);

private:
    std::vector<std::shared_ptr<TcpConnection>> connections_;

    static u32 generate_iss();
    static bool parse_header(Buffer& buf, TcpHeader& hdr);
    static void build_header(TcpHeader& hdr, const TcpConnection* conn, u8 flags);
    static u16 compute_checksum(const TcpHeader& hdr, const u8* data, size_t len,
                                u32 src_ip, u32 dst_ip);
};

extern TcpLayer g_tcp_layer;

}

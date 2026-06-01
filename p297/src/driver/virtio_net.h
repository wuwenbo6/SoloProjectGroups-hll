#pragma once
#include "driver/virt_queue.h"
#include "common/mac_address.h"
#include "common/types.h"
#include <vector>
#include <queue>

namespace net {

constexpr u16 VIRTIO_NET_F_MAC = 5;
constexpr u8 VIRTIO_NET_HDR_LEN = 10;

struct VirtioNetHdr {
    u8 flags;
    u8 gso_type;
    u16 hdr_len;
    u16 gso_size;
    u16 csum_start;
    u16 csum_offset;
    u16 num_buffers;
};

class VirtioNetDriver {
public:
    VirtioNetDriver();

    bool rx_packet(std::vector<u8>& out_packet);
    bool tx_packet(const std::vector<u8>& packet);
    void tick();
    void inject_rx(const std::vector<u8>& packet);

    const MacAddress& get_mac() const { return mac; }
    void set_mac(const MacAddress& m) { mac = m; }

    VirtQueue& get_rx_queue() { return rx_queue; }
    VirtQueue& get_tx_queue() { return tx_queue; }

private:
    void process_tx_to_rx();
    void push_to_rx_queue(const std::vector<u8>& packet);

    VirtQueue rx_queue;
    VirtQueue tx_queue;
    MacAddress mac;
    std::queue<std::vector<u8>> loopback_pending;
};

}

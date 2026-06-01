#include "driver/virtio_net.h"
#include <cstring>

namespace net {

VirtioNetDriver::VirtioNetDriver()
    : mac(0x52, 0x54, 0x00, 0x12, 0x34, 0x56) {
}

bool VirtioNetDriver::rx_packet(std::vector<u8>& out_packet) {
    u16 idx;
    u32 len;

    if (!rx_queue.get_used(&idx, &len)) {
        return false;
    }

    const auto& buffer = rx_queue.get_buffer(idx);
    if (len > buffer.size()) {
        len = static_cast<u32>(buffer.size());
    }

    out_packet.assign(buffer.begin(), buffer.begin() + len);
    return true;
}

bool VirtioNetDriver::tx_packet(const std::vector<u8>& packet) {
    if (packet.size() > ETH_FRAME_MAX) {
        return false;
    }

    u16 idx;
    if (!tx_queue.add_buffer(packet, &idx)) {
        return false;
    }

    tx_queue.push_used(idx, static_cast<u32>(packet.size()));
    loopback_pending.push(packet);
    return true;
}

void VirtioNetDriver::tick() {
    process_tx_to_rx();
}

void VirtioNetDriver::inject_rx(const std::vector<u8>& packet) {
    push_to_rx_queue(packet);
}

void VirtioNetDriver::process_tx_to_rx() {
    while (!loopback_pending.empty()) {
        const auto& packet = loopback_pending.front();
        push_to_rx_queue(packet);
        loopback_pending.pop();
    }
}

void VirtioNetDriver::push_to_rx_queue(const std::vector<u8>& packet) {
    if (packet.size() > ETH_FRAME_MAX) {
        return;
    }

    u16 idx;
    if (!rx_queue.add_buffer(packet, &idx)) {
        return;
    }

    rx_queue.push_used(idx, static_cast<u32>(packet.size()));
}

}

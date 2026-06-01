#pragma once
#include "common/types.h"
#include <vector>
#include <cstring>

namespace net {

constexpr u16 VIRTQ_DESC_F_NEXT = 1;
constexpr u16 VIRTQ_DESC_F_WRITE = 2;
constexpr u16 VIRTQ_DESC_F_INDIRECT = 4;

constexpr u16 VIRTQ_AVAIL_F_NO_INTERRUPT = 1;
constexpr u16 VIRTQ_USED_F_NO_NOTIFY = 1;

struct VirtqDesc {
    u64 addr;
    u32 len;
    u16 flags;
    u16 next;
};

struct VirtqAvail {
    u16 flags;
    u16 idx;
    u16 ring[VIRTQUEUE_SIZE];
    u16 used_event;
};

struct VirtqUsed {
    u16 flags;
    u16 idx;
    struct {
        u32 id;
        u32 len;
    } ring[VIRTQUEUE_SIZE];
    u16 avail_event;
};

class VirtQueue {
public:
    VirtQueue() {
        std::memset(&desc, 0, sizeof(desc));
        std::memset(&avail, 0, sizeof(avail));
        std::memset(&used, 0, sizeof(used));
        free_head = 0;
        last_used_idx = 0;
        for (size_t i = 0; i < VIRTQUEUE_SIZE - 1; i++) {
            desc[i].next = static_cast<u16>(i + 1);
        }
        desc[VIRTQUEUE_SIZE - 1].next = 0;
        for (size_t i = 0; i < VIRTQUEUE_SIZE; i++) {
            buffer_storage[i].resize(ETH_FRAME_MAX);
        }
    }

    bool add_buffer(const std::vector<u8>& data, u16* out_idx) {
        if (available_count() < 1) {
            return false;
        }

        u16 idx = free_head;
        free_head = desc[idx].next;

        buffer_storage[idx] = data;
        desc[idx].addr = reinterpret_cast<u64>(buffer_storage[idx].data());
        desc[idx].len = static_cast<u32>(data.size());
        desc[idx].flags = 0;
        desc[idx].next = 0;

        avail.ring[avail.idx % VIRTQUEUE_SIZE] = idx;
        avail.idx++;

        if (out_idx) {
            *out_idx = idx;
        }
        return true;
    }

    bool get_used(u16* out_idx, u32* out_len) {
        if (last_used_idx == used.idx) {
            return false;
        }

        const auto& elem = used.ring[last_used_idx % VIRTQUEUE_SIZE];
        u16 idx = static_cast<u16>(elem.id);
        u32 len = elem.len;

        free_desc_chain(idx);

        last_used_idx++;

        if (out_idx) {
            *out_idx = idx;
        }
        if (out_len) {
            *out_len = len;
        }
        return true;
    }

    size_t available_count() const {
        size_t count = 0;
        u16 idx = free_head;
        while (true) {
            count++;
            idx = desc[idx].next;
            if (idx == free_head) {
                break;
            }
        }
        return count;
    }

    void push_used(u16 idx, u32 len) {
        used.ring[used.idx % VIRTQUEUE_SIZE].id = idx;
        used.ring[used.idx % VIRTQUEUE_SIZE].len = len;
        used.idx++;
    }

    std::vector<u8>& get_buffer(u16 idx) {
        return buffer_storage[idx];
    }

    u16 get_free_head() const {
        return free_head;
    }

    VirtqDesc desc[VIRTQUEUE_SIZE];
    VirtqAvail avail;
    VirtqUsed used;

private:
    void free_desc_chain(u16 head) {
        u16 idx = head;
        while (desc[idx].flags & VIRTQ_DESC_F_NEXT) {
            idx = desc[idx].next;
        }
        desc[idx].next = free_head;
        free_head = head;
    }

    u16 free_head;
    u16 last_used_idx;
    std::vector<u8> buffer_storage[VIRTQUEUE_SIZE];
};

}

#pragma once
#include "common/types.h"
#include <vector>
#include <chrono>

namespace net {

constexpr u32 PCAP_MAGIC = 0xa1b2c3d4;
constexpr u16 PCAP_VERSION_MAJOR = 2;
constexpr u16 PCAP_VERSION_MINOR = 4;
constexpr u32 PCAP_SNAPLEN = 65535;
constexpr u32 PCAP_LINKTYPE_ETHERNET = 1;

struct PcapGlobalHeader {
    u32 magic;
    u16 version_major;
    u16 version_minor;
    u32 thiszone;
    u32 sigfigs;
    u32 snaplen;
    u32 network;
};

struct PcapPacketHeader {
    u32 ts_sec;
    u32 ts_usec;
    u32 incl_len;
    u32 orig_len;
};

class PcapWriter {
public:
    PcapWriter() {
        write_global_header();
    }

    void add_packet(const u8* data, size_t len) {
        auto now = std::chrono::system_clock::now();
        auto duration = now.time_since_epoch();
        auto seconds = std::chrono::duration_cast<std::chrono::seconds>(duration);
        auto microseconds = std::chrono::duration_cast<std::chrono::microseconds>(duration - seconds);

        PcapPacketHeader hdr;
        hdr.ts_sec = static_cast<u32>(seconds.count());
        hdr.ts_usec = static_cast<u32>(microseconds.count());
        hdr.incl_len = static_cast<u32>(len);
        hdr.orig_len = static_cast<u32>(len);

        buffer_.insert(buffer_.end(), 
                       reinterpret_cast<u8*>(&hdr), 
                       reinterpret_cast<u8*>(&hdr) + sizeof(hdr));
        buffer_.insert(buffer_.end(), data, data + len);
    }

    const std::vector<u8>& data() const { return buffer_; }

    void clear() {
        buffer_.clear();
        write_global_header();
    }

    size_t size() const { return buffer_.size(); }

private:
    std::vector<u8> buffer_;

    void write_global_header() {
        PcapGlobalHeader hdr;
        hdr.magic = PCAP_MAGIC;
        hdr.version_major = PCAP_VERSION_MAJOR;
        hdr.version_minor = PCAP_VERSION_MINOR;
        hdr.thiszone = 0;
        hdr.sigfigs = 0;
        hdr.snaplen = PCAP_SNAPLEN;
        hdr.network = PCAP_LINKTYPE_ETHERNET;

        buffer_.insert(buffer_.end(), 
                       reinterpret_cast<u8*>(&hdr), 
                       reinterpret_cast<u8*>(&hdr) + sizeof(hdr));
    }
};

}

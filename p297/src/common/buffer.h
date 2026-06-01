#pragma once
#include "common/types.h"
#include <vector>
#include <cstring>
#include <stdexcept>

namespace net {

class Buffer {
public:
    Buffer() = default;
    explicit Buffer(size_t size) : data_(size), read_pos_(0), write_pos_(0) {}

    Buffer(const void* data, size_t size)
        : data_(static_cast<const u8*>(data), static_cast<const u8*>(data) + size),
          read_pos_(0), write_pos_(size) {}

    size_t size() const { return data_.size(); }
    size_t available() const { return write_pos_ - read_pos_; }
    const u8* data() const { return data_.data(); }
    u8* data() { return data_.data(); }

    template<typename T>
    T read() {
        if (read_pos_ + sizeof(T) > write_pos_) {
            throw std::runtime_error("Buffer read overflow");
        }
        T val;
        std::memcpy(&val, data_.data() + read_pos_, sizeof(T));
        read_pos_ += sizeof(T);
        return val;
    }

    void read(void* out, size_t len) {
        if (read_pos_ + len > write_pos_) {
            throw std::runtime_error("Buffer read overflow");
        }
        std::memcpy(out, data_.data() + read_pos_, len);
        read_pos_ += len;
    }

    template<typename T>
    void write(T val) {
        if (write_pos_ + sizeof(T) > data_.size()) {
            data_.resize(write_pos_ + sizeof(T));
        }
        std::memcpy(data_.data() + write_pos_, &val, sizeof(T));
        write_pos_ += sizeof(T);
    }

    void write(const void* src, size_t len) {
        if (write_pos_ + len > data_.size()) {
            data_.resize(write_pos_ + len);
        }
        std::memcpy(data_.data() + write_pos_, src, len);
        write_pos_ += len;
    }

    void skip(size_t n) { read_pos_ += n; }
    void reset() { read_pos_ = 0; write_pos_ = 0; }
    void clear() { data_.clear(); read_pos_ = 0; write_pos_ = 0; }

    const u8* peek() const { return data_.data() + read_pos_; }
    size_t read_pos() const { return read_pos_; }
    size_t write_pos() const { return write_pos_; }

private:
    std::vector<u8> data_;
    size_t read_pos_;
    size_t write_pos_;
};

}

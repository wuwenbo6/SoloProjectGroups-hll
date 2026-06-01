#include "websocket_server.h"

#include <algorithm>
#include <cstring>
#include <sys/socket.h>
#include <unistd.h>

void WebSocketServer::on_connect(int fd) {
    clients_.push_back(fd);
}

void WebSocketServer::on_disconnect(int fd) {
    auto it = std::find(clients_.begin(), clients_.end(), fd);
    if (it != clients_.end()) {
        clients_.erase(it);
    }
    close(fd);
}

void WebSocketServer::broadcast(const std::string& message) {
    std::string frame = encode_frame(message);
    for (int fd : clients_) {
        send(fd, frame.data(), frame.size(), 0);
    }
}

std::string WebSocketServer::encode_frame(const std::string& data) {
    std::string frame;
    size_t len = data.size();

    frame.push_back(0x81);

    if (len <= 125) {
        frame.push_back(static_cast<char>(len));
    } else if (len <= 65535) {
        frame.push_back(126);
        frame.push_back(static_cast<char>((len >> 8) & 0xFF));
        frame.push_back(static_cast<char>(len & 0xFF));
    } else {
        frame.push_back(127);
        for (int i = 7; i >= 0; --i) {
            frame.push_back(static_cast<char>((len >> (i * 8)) & 0xFF));
        }
    }

    frame.append(data);
    return frame;
}

std::string WebSocketServer::decode_frame(const u8* data, size_t len) {
    if (len < 2) {
        return "";
    }

    bool fin = (data[0] & 0x80) != 0;
    if (!fin) {
        return "";
    }
    u8 opcode = data[0] & 0x0F;
    bool masked = (data[1] & 0x80) != 0;
    size_t payload_len = data[1] & 0x7F;

    size_t offset = 2;

    if (payload_len == 126) {
        if (len < 4) return "";
        payload_len = (data[2] << 8) | data[3];
        offset = 4;
    } else if (payload_len == 127) {
        if (len < 10) return "";
        payload_len = 0;
        for (int i = 0; i < 8; ++i) {
            payload_len = (payload_len << 8) | data[2 + i];
        }
        offset = 10;
    }

    u8 mask_key[4] = {0};
    if (masked) {
        if (len < offset + 4) return "";
        std::memcpy(mask_key, data + offset, 4);
        offset += 4;
    }

    if (len < offset + payload_len) {
        return "";
    }

    std::string decoded;
    decoded.reserve(payload_len);
    for (size_t i = 0; i < payload_len; ++i) {
        u8 byte = data[offset + i];
        if (masked) {
            byte ^= mask_key[i % 4];
        }
        decoded.push_back(static_cast<char>(byte));
    }

    if (opcode == 0x8) {
        return "";
    }

    return decoded;
}



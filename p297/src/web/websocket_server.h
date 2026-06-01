#ifndef WEBSOCKET_SERVER_H
#define WEBSOCKET_SERVER_H

#include <cstdint>
#include <string>
#include <vector>
#include <functional>

using u8 = uint8_t;

class WebSocketServer {
public:
    using MessageHandler = std::function<void(int, const std::string&)>;

    void on_connect(int fd);
    void on_disconnect(int fd);
    void broadcast(const std::string& message);
    std::string encode_frame(const std::string& data);
    std::string decode_frame(const u8* data, size_t len);

    const std::vector<int>& get_clients() const { return clients_; }
    std::vector<int> clients_;
    MessageHandler handle_message = nullptr;
};

#endif

#ifndef PACKET_BUS_H
#define PACKET_BUS_H

#include <functional>
#include <string>
#include <vector>
#include <iomanip>

class PacketBus {
public:
    using EventCallback = std::function<void(const std::string& type, const std::string& json)>;

    void subscribe(EventCallback cb);
    void publish(const std::string& type, const std::string& json);
    void publish_packet(const std::string& direction, const std::string& proto,
                        const std::string& info, const std::string& hex_dump,
                        const std::string& details = "");

private:
    std::vector<EventCallback> callbacks_;
};

#endif

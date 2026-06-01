#include "packet_bus.h"
#include <sstream>

static std::string escape_json(const std::string& s) {
    std::ostringstream out;
    for (char c : s) {
        switch (c) {
            case '"': out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    out << "\\u" << std::hex << std::setw(4) << std::setfill('0')
                        << static_cast<int>(static_cast<unsigned char>(c));
                } else {
                    out << c;
                }
        }
    }
    return out.str();
}

void PacketBus::subscribe(EventCallback cb) {
    callbacks_.push_back(std::move(cb));
}

void PacketBus::publish(const std::string& type, const std::string& json) {
    for (const auto& cb : callbacks_) {
        cb(type, json);
    }
}

void PacketBus::publish_packet(const std::string& direction, const std::string& proto,
                               const std::string& info, const std::string& hex_dump,
                               const std::string& details) {
    std::string type = (direction == "rx") ? "packet_rx" : "packet_tx";
    std::string json = "{";
    json += "\"type\":\"" + type + "\",";
    json += "\"direction\":\"" + direction + "\",";
    json += "\"proto\":\"" + proto + "\",";
    json += "\"info\":\"" + escape_json(info) + "\",";
    json += "\"hex_dump\":\"" + escape_json(hex_dump) + "\",";
    json += "\"details\":\"" + escape_json(details) + "\"";
    json += "}";
    publish(type, json);
}

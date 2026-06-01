#include "stack.h"
#include "web/http_server.h"
#include "web/websocket_server.h"
#include "common/mac_address.h"
#include "common/ip_address.h"
#include <iostream>
#include <thread>
#include <chrono>
#include <mutex>
#include <atomic>
#include <sstream>
#include <cstring>
#include <sys/select.h>
#include <unistd.h>
#include <fcntl.h>
#include <arpa/inet.h>

using namespace net;

std::mutex g_stack_mutex;
std::atomic<bool> g_running(true);

WebSocketServer* g_ws_server = nullptr;

void broadcast_to_frontend(const std::string& type, const std::string& json) {
    if (g_ws_server) {
        g_ws_server->broadcast(json);
    }
}

void handle_websocket_message(int fd, const std::string& msg) {
    std::cout << "[WS] Received: " << msg << std::endl;

    size_t pos = msg.find("\"action\":\"");
    if (pos == std::string::npos) return;

    size_t action_start = pos + 10;
    size_t action_end = msg.find("\"", action_start);
    if (action_end == std::string::npos) return;

    std::string action = msg.substr(action_start, action_end - action_start);

    std::lock_guard<std::mutex> lock(g_stack_mutex);
    TcpIpStack& stack = TcpIpStack::instance();

    if (action == "ping") {
        size_t ip_pos = msg.find("\"ip\":\"");
        if (ip_pos == std::string::npos) return;
        size_t ip_start = ip_pos + 6;
        size_t ip_end = msg.find("\"", ip_start);
        if (ip_end == std::string::npos) return;
        std::string ip_str = msg.substr(ip_start, ip_end - ip_start);

        u16 id = 1, seq = 1;
        size_t id_pos = msg.find("\"id\":");
        if (id_pos != std::string::npos) {
            id = static_cast<u16>(std::stoi(msg.substr(id_pos + 5)));
        }
        size_t seq_pos = msg.find("\"seq\":");
        if (seq_pos != std::string::npos) {
            seq = static_cast<u16>(std::stoi(msg.substr(seq_pos + 6)));
        }

        IpAddress dst_ip;
        int a, b, c, d;
        if (sscanf(ip_str.c_str(), "%d.%d.%d.%d", &a, &b, &c, &d) == 4) {
            dst_ip = IpAddress(static_cast<u8>(a), static_cast<u8>(b),
                               static_cast<u8>(c), static_cast<u8>(d));
            stack.ping(dst_ip, id, seq);
        }

    } else if (action == "tcp_connect") {
        size_t ip_pos = msg.find("\"ip\":\"");
        size_t dst_port_pos = msg.find("\"dst_port\":");
        size_t src_port_pos = msg.find("\"src_port\":");
        if (ip_pos == std::string::npos || dst_port_pos == std::string::npos ||
            src_port_pos == std::string::npos) return;

        size_t ip_start = ip_pos + 6;
        size_t ip_end = msg.find("\"", ip_start);
        std::string ip_str = msg.substr(ip_start, ip_end - ip_start);

        u16 dst_port = static_cast<u16>(std::stoi(msg.substr(dst_port_pos + 11)));
        u16 src_port = static_cast<u16>(std::stoi(msg.substr(src_port_pos + 11)));

        IpAddress dst_ip;
        int a, b, c, d;
        if (sscanf(ip_str.c_str(), "%d.%d.%d.%d", &a, &b, &c, &d) == 4) {
            dst_ip = IpAddress(static_cast<u8>(a), static_cast<u8>(b),
                               static_cast<u8>(c), static_cast<u8>(d));
            stack.tcp_connect(dst_ip, dst_port, src_port);
        }

    } else if (action == "tcp_listen") {
        size_t port_pos = msg.find("\"port\":");
        if (port_pos == std::string::npos) return;
        u16 port = static_cast<u16>(std::stoi(msg.substr(port_pos + 7)));
        stack.tcp_listen(port);
    } else if (action == "simulate_zero_window") {
        size_t port_pos = msg.find("\"port\":");
        if (port_pos == std::string::npos) return;
        u16 port = static_cast<u16>(std::stoi(msg.substr(port_pos + 7)));
        stack.simulate_zero_window(port);
    } else if (action == "toggle_keep_alive") {
        size_t port_pos = msg.find("\"port\":");
        size_t enabled_pos = msg.find("\"enabled\":");
        if (port_pos == std::string::npos || enabled_pos == std::string::npos) return;
        u16 port = static_cast<u16>(std::stoi(msg.substr(port_pos + 7)));
        bool enabled = (msg.substr(enabled_pos + 10, 4) == "true");
        stack.toggle_keep_alive(port, enabled);
    } else if (action == "get_pcap") {
        auto pcap_data = stack.get_pcap_data();
        std::string base64;
        static const char* b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        int val = 0, valb = -6;
        for (u8 c : pcap_data) {
            val = (val << 8) + c;
            valb += 8;
            while (valb >= 0) {
                base64.push_back(b64[(val >> valb) & 0x3F]);
                valb -= 6;
            }
        }
        if (valb > -6) base64.push_back(b64[((val << 8) >> (valb + 8)) & 0x3F]);
        while (base64.size() % 4) base64.push_back('=');

        std::ostringstream response;
        response << "{"
                 << "\"type\":\"pcap_data\","
                 << "\"size\":" << pcap_data.size() << ","
                 << "\"data\":\"" << base64 << "\""
                 << "}";
        send(fd, response.str().c_str(), response.str().size(), 0);
    } else if (action == "clear_pcap") {
        stack.clear_pcap_buffer();
        std::ostringstream response;
        response << "{"
                 << "\"type\":\"pcap_cleared\""
                 << "}";
        send(fd, response.str().c_str(), response.str().size(), 0);
    }
}

void stack_thread_func() {
    TcpIpStack& stack = TcpIpStack::instance();

    while (g_running) {
        {
            std::lock_guard<std::mutex> lock(g_stack_mutex);
            stack.tick();
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
}

int main() {
    MacAddress mac(0x52, 0x54, 0x00, 0x12, 0x34, 0x56);
    IpAddress ip(192, 168, 1, 100);

    TcpIpStack& stack = TcpIpStack::instance();
    stack.init(mac, ip);

    WebSocketServer ws_server;
    g_ws_server = &ws_server;

    HttpServer http_server(8088, ws_server);
    http_server.start();

    stack.bus().subscribe([](const std::string& type, const std::string& json) {
        broadcast_to_frontend(type, json);
    });

    ws_server.handle_message = [](int fd, const std::string& msg) {
        handle_websocket_message(fd, msg);
    };

    std::thread stack_thread(stack_thread_func);

    std::cout << "============================================" << std::endl;
    std::cout << "  用户态TCP/IP协议栈已启动" << std::endl;
    std::cout << "============================================" << std::endl;
    std::cout << "  MAC: " << mac.to_string() << std::endl;
    std::cout << "  IP:  " << ip.to_string() << std::endl;
    std::cout << "  Web: http://localhost:8088" << std::endl;
    std::cout << "============================================" << std::endl;
    std::cout << "  支持的功能:" << std::endl;
    std::cout << "    - VIRTIO虚拟队列驱动" << std::endl;
    std::cout << "    - 以太网帧收发" << std::endl;
    std::cout << "    - ARP地址解析协议" << std::endl;
    std::cout << "    - IPv4协议" << std::endl;
    std::cout << "    - ICMP Echo (ping)" << std::endl;
    std::cout << "    - TCP (SEQ/ACK交互、状态机)" << std::endl;
    std::cout << "============================================" << std::endl;

    fd_set read_fds;
    int max_fd = http_server.server_fd_;

    while (g_running) {
        FD_ZERO(&read_fds);
        FD_SET(http_server.server_fd_, &read_fds);

        for (int fd : ws_server.clients_) {
            FD_SET(fd, &read_fds);
            if (fd > max_fd) max_fd = fd;
        }

        timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 100000;

        int ret = select(max_fd + 1, &read_fds, nullptr, nullptr, &tv);
        if (ret < 0) {
            if (errno == EINTR) continue;
            std::cerr << "select error" << std::endl;
            break;
        }

        if (FD_ISSET(http_server.server_fd_, &read_fds)) {
            sockaddr_in client_addr;
            socklen_t client_len = sizeof(client_addr);
            int client_fd = accept(http_server.server_fd_,
                                   reinterpret_cast<sockaddr*>(&client_addr),
                                   &client_len);
            if (client_fd >= 0) {
                http_server.handle_client(client_fd);
            }
        }

        auto clients_copy = ws_server.get_clients();
        for (int fd : clients_copy) {
            if (FD_ISSET(fd, &read_fds)) {
                char buffer[4096];
                ssize_t n = recv(fd, buffer, sizeof(buffer), 0);
                if (n <= 0) {
                    ws_server.on_disconnect(fd);
                } else {
                    std::string msg = ws_server.decode_frame(
                        reinterpret_cast<u8*>(buffer), static_cast<size_t>(n));
                    if (!msg.empty()) {
                        ws_server.handle_message(fd, msg);
                    }
                }
            }
        }
    }

    g_running = false;
    if (stack_thread.joinable()) {
        stack_thread.join();
    }

    close(http_server.server_fd_);
    for (int fd : ws_server.clients_) {
        close(fd);
    }

    std::cout << "协议栈已停止" << std::endl;
    return 0;
}

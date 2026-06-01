#include "http_server.h"
#include "frontend_html.h"

#include <arpa/inet.h>
#include <cstring>
#include <netinet/in.h>
#include <sstream>
#include <sys/socket.h>
#include <unistd.h>

static const std::string HTML_CONTENT = FRONTEND_HTML;

HttpServer::HttpServer(int port, WebSocketServer& ws_server)
    : port_(port), server_fd_(-1), ws_server_(ws_server) {}

void HttpServer::start() {
    server_fd_ = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd_ < 0) {
        return;
    }

    int opt = 1;
    setsockopt(server_fd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    sockaddr_in addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons(port_);

    if (bind(server_fd_, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) < 0) {
        close(server_fd_);
        server_fd_ = -1;
        return;
    }

    listen(server_fd_, 10);
}

void HttpServer::handle_client(int client_fd) {
    char buffer[4096];
    ssize_t n = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (n <= 0) {
        close(client_fd);
        return;
    }
    buffer[n] = '\0';

    std::string request(buffer);
    std::istringstream iss(request);
    std::string method, path;
    iss >> method >> path;

    if (method != "GET") {
        const char* response = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n";
        send(client_fd, response, std::strlen(response), 0);
        close(client_fd);
        return;
    }

    if (path == "/") {
        std::ostringstream oss;
        oss << "HTTP/1.1 200 OK\r\n";
        oss << "Content-Type: text/html\r\n";
        oss << "Content-Length: " << HTML_CONTENT.size() << "\r\n";
        oss << "\r\n";
        oss << HTML_CONTENT;
        std::string response = oss.str();
        send(client_fd, response.c_str(), response.size(), 0);
        close(client_fd);
        return;
    }

    if (path == "/ws") {
        size_t key_pos = request.find("Sec-WebSocket-Key:");
        if (key_pos == std::string::npos) {
            const char* response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
            send(client_fd, response, std::strlen(response), 0);
            close(client_fd);
            return;
        }

        size_t key_start = key_pos + 19;
        size_t key_end = request.find("\r\n", key_start);
        std::string key = request.substr(key_start, key_end - key_start);
        while (!key.empty() && key[0] == ' ') {
            key.erase(0, 1);
        }
        while (!key.empty() && key[key.size() - 1] == ' ') {
            key.pop_back();
        }

        std::string accept = websocket_accept(key);

        std::ostringstream oss;
        oss << "HTTP/1.1 101 Switching Protocols\r\n";
        oss << "Upgrade: websocket\r\n";
        oss << "Connection: Upgrade\r\n";
        oss << "Sec-WebSocket-Accept: " << accept << "\r\n";
        oss << "\r\n";
        std::string response = oss.str();
        send(client_fd, response.c_str(), response.size(), 0);

        ws_server_.on_connect(client_fd);
        return;
    }

    const char* response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
    send(client_fd, response, std::strlen(response), 0);
    close(client_fd);
}

std::string HttpServer::websocket_accept(const std::string& key) {
    static const std::string GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    std::string combined = key + GUID;
    std::string hash = sha1(combined);
    return base64_encode(hash);
}

std::string HttpServer::sha1(const std::string& input) {
    uint32_t h0 = 0x67452301;
    uint32_t h1 = 0xEFCDAB89;
    uint32_t h2 = 0x98BADCFE;
    uint32_t h3 = 0x10325476;
    uint32_t h4 = 0xC3D2E1F0;

    uint64_t bit_len = input.size() * 8;
    size_t msg_len = input.size() + 1 + 8;
    while (msg_len % 64 != 0) {
        msg_len++;
    }

    std::string msg(msg_len, '\0');
    msg.replace(0, input.size(), input);
    msg[input.size()] = static_cast<char>(0x80);

    for (int i = 0; i < 8; ++i) {
        msg[msg_len - 8 + i] = static_cast<char>((bit_len >> (56 - i * 8)) & 0xFF);
    }

    for (size_t offset = 0; offset < msg_len; offset += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; ++i) {
            w[i] = (static_cast<uint8_t>(msg[offset + i * 4]) << 24) |
                   (static_cast<uint8_t>(msg[offset + i * 4 + 1]) << 16) |
                   (static_cast<uint8_t>(msg[offset + i * 4 + 2]) << 8) |
                   static_cast<uint8_t>(msg[offset + i * 4 + 3]);
        }

        for (int i = 16; i < 80; ++i) {
            uint32_t x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
            w[i] = (x << 1) | (x >> 31);
        }

        uint32_t a = h0, b = h1, c = h2, d = h3, e = h4;

        for (int i = 0; i < 80; ++i) {
            uint32_t f, k;
            if (i < 20) {
                f = (b & c) | (~b & d);
                k = 0x5A827999;
            } else if (i < 40) {
                f = b ^ c ^ d;
                k = 0x6ED9EBA1;
            } else if (i < 60) {
                f = (b & c) | (b & d) | (c & d);
                k = 0x8F1BBCDC;
            } else {
                f = b ^ c ^ d;
                k = 0xCA62C1D6;
            }

            uint32_t temp = ((a << 5) | (a >> 27)) + f + e + k + w[i];
            e = d;
            d = c;
            c = (b << 30) | (b >> 2);
            b = a;
            a = temp;
        }

        h0 += a;
        h1 += b;
        h2 += c;
        h3 += d;
        h4 += e;
    }

    std::string result;
    result.reserve(20);
    for (uint32_t h : {h0, h1, h2, h3, h4}) {
        for (int i = 3; i >= 0; --i) {
            result.push_back(static_cast<char>((h >> (i * 8)) & 0xFF));
        }
    }

    return result;
}

std::string HttpServer::base64_encode(const std::string& input) {
    static const char* chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    std::string result;
    result.reserve(((input.size() + 2) / 3) * 4);

    size_t i = 0;
    while (i + 3 <= input.size()) {
        uint32_t val = (static_cast<uint8_t>(input[i]) << 16) |
                       (static_cast<uint8_t>(input[i + 1]) << 8) |
                       static_cast<uint8_t>(input[i + 2]);
        result.push_back(chars[(val >> 18) & 0x3F]);
        result.push_back(chars[(val >> 12) & 0x3F]);
        result.push_back(chars[(val >> 6) & 0x3F]);
        result.push_back(chars[val & 0x3F]);
        i += 3;
    }

    if (i + 1 == input.size()) {
        uint32_t val = static_cast<uint8_t>(input[i]) << 16;
        result.push_back(chars[(val >> 18) & 0x3F]);
        result.push_back(chars[(val >> 12) & 0x3F]);
        result.push_back('=');
        result.push_back('=');
    } else if (i + 2 == input.size()) {
        uint32_t val = (static_cast<uint8_t>(input[i]) << 16) |
                       (static_cast<uint8_t>(input[i + 1]) << 8);
        result.push_back(chars[(val >> 18) & 0x3F]);
        result.push_back(chars[(val >> 12) & 0x3F]);
        result.push_back(chars[(val >> 6) & 0x3F]);
        result.push_back('=');
    }

    return result;
}

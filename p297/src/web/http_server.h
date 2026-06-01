#ifndef HTTP_SERVER_H
#define HTTP_SERVER_H

#include <string>

#include "websocket_server.h"

class HttpServer {
public:
    HttpServer(int port, WebSocketServer& ws_server);
    void start();
    void handle_client(int client_fd);

    int server_fd_;

private:
    int port_;
    WebSocketServer& ws_server_;

    std::string websocket_accept(const std::string& key);
    std::string sha1(const std::string& input);
    std::string base64_encode(const std::string& input);
};

#endif

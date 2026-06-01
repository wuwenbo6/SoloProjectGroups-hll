#pragma once

#include "ptp_clock.h"
#include <string>
#include <functional>
#include <thread>
#include <atomic>
#include <unordered_map>

namespace ptp {

struct HttpRequest {
    std::string method;
    std::string path;
    std::string body;
    std::unordered_map<std::string, std::string> headers;
    std::unordered_map<std::string, std::string> params;
};

struct HttpResponse {
    int status = 200;
    std::string contentType = "application/json";
    std::string body;
    std::unordered_map<std::string, std::string> headers;
};

using RouteHandler = std::function<HttpResponse(const HttpRequest&)>;

class HttpServer {
public:
    explicit HttpServer(PTPClock& clock, int port = 8080);
    ~HttpServer();

    void start();
    void stop();
    int port() const { return port_; }

private:
    void run();
    void handle_client(int clientFd);
    HttpRequest parse_request(const std::string& raw);
    HttpResponse route(const HttpRequest& req);
    HttpResponse serve_static_file(const std::string& path);
    std::string build_response(const HttpResponse& resp);

    HttpResponse api_get_status(const HttpRequest& req);
    HttpResponse api_inject_announce(const HttpRequest& req);
    HttpResponse api_set_priority1(const HttpRequest& req);
    HttpResponse api_set_priority2(const HttpRequest& req);
    HttpResponse api_set_clock_class(const HttpRequest& req);
    HttpResponse api_set_clock_accuracy(const HttpRequest& req);
    HttpResponse api_get_history(const HttpRequest& req);
    HttpResponse api_get_measurements(const HttpRequest& req);
    HttpResponse api_export_csv(const HttpRequest& req);
    HttpResponse api_set_sim_offset(const HttpRequest& req);
    HttpResponse api_set_sim_jitter(const HttpRequest& req);

    static std::string url_decode(const std::string& str);
    static std::unordered_map<std::string, std::string> parse_query(const std::string& query);
    static std::string json_escape(const std::string& s);
    static std::string clock_accuracy_to_string(uint8_t ca);

    PTPClock& clock_;
    int port_;
    int serverFd_ = -1;
    std::thread thread_;
    std::atomic<bool> running_{false};
    std::string staticDir_;
};

}

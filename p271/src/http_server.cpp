#include "http_server.h"
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <cstring>
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <csignal>
#include <filesystem>
#include <iomanip>

namespace ptp {

HttpServer::HttpServer(PTPClock& clock, int port)
    : clock_(clock), port_(port)
{
    staticDir_ = std::filesystem::current_path() / "frontend";
}

HttpServer::~HttpServer() {
    stop();
}

void HttpServer::start() {
    if (running_.exchange(true)) return;
    thread_ = std::thread([this]() { run(); });
}

void HttpServer::stop() {
    running_ = false;
    if (serverFd_ >= 0) {
        shutdown(serverFd_, SHUT_RDWR);
        close(serverFd_);
        serverFd_ = -1;
    }
    if (thread_.joinable()) {
        thread_.join();
    }
}

void HttpServer::run() {
    serverFd_ = socket(AF_INET, SOCK_STREAM, 0);
    if (serverFd_ < 0) {
        std::cerr << "Failed to create socket" << std::endl;
        return;
    }

    int opt = 1;
    setsockopt(serverFd_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port_);

    if (bind(serverFd_, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        std::cerr << "Failed to bind on port " << port_ << std::endl;
        close(serverFd_);
        serverFd_ = -1;
        running_ = false;
        return;
    }

    if (listen(serverFd_, 10) < 0) {
        std::cerr << "Failed to listen" << std::endl;
        close(serverFd_);
        serverFd_ = -1;
        running_ = false;
        return;
    }

    std::cout << "PTP Clock HTTP server listening on port " << port_ << std::endl;

    while (running_) {
        struct sockaddr_in clientAddr{};
        socklen_t clientLen = sizeof(clientAddr);
        int clientFd = accept(serverFd_, (struct sockaddr*)&clientAddr, &clientLen);
        if (clientFd < 0) {
            if (running_) {
                std::cerr << "Accept failed" << std::endl;
            }
            continue;
        }
        handle_client(clientFd);
    }
}

void HttpServer::handle_client(int clientFd) {
    char buf[8192];
    ssize_t n = recv(clientFd, buf, sizeof(buf) - 1, 0);
    if (n <= 0) {
        close(clientFd);
        return;
    }
    buf[n] = '\0';

    HttpRequest req = parse_request(std::string(buf, n));
    HttpResponse resp = route(req);

    std::string responseStr = build_response(resp);
    send(clientFd, responseStr.c_str(), responseStr.size(), 0);
    close(clientFd);
}

HttpRequest HttpServer::parse_request(const std::string& raw) {
    HttpRequest req;

    size_t lineEnd = raw.find("\r\n");
    if (lineEnd == std::string::npos) lineEnd = raw.find("\n");
    std::string requestLine = raw.substr(0, lineEnd);

    std::istringstream rlStream(requestLine);
    rlStream >> req.method;

    std::string fullPath;
    rlStream >> fullPath;

    size_t qPos = fullPath.find('?');
    if (qPos != std::string::npos) {
        req.path = fullPath.substr(0, qPos);
        req.params = parse_query(fullPath.substr(qPos + 1));
    } else {
        req.path = fullPath;
    }

    size_t bodyStart = raw.find("\r\n\r\n");
    if (bodyStart == std::string::npos) bodyStart = raw.find("\n\n");
    if (bodyStart != std::string::npos) {
        req.body = raw.substr(bodyStart + 4);
        while (!req.body.empty() && (req.body.back() == '\r' || req.body.back() == '\n')) {
            req.body.pop_back();
        }
    }

    return req;
}

HttpResponse HttpServer::route(const HttpRequest& req) {
    HttpResponse resp;
    resp.headers["Access-Control-Allow-Origin"] = "*";
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type";

    if (req.method == "OPTIONS") {
        resp.status = 204;
        resp.body = "";
        return resp;
    }

    if (req.path == "/api/status" && req.method == "GET") {
        return api_get_status(req);
    }
    if (req.path == "/api/announce" && req.method == "POST") {
        return api_inject_announce(req);
    }
    if (req.path == "/api/priority1" && req.method == "POST") {
        return api_set_priority1(req);
    }
    if (req.path == "/api/priority2" && req.method == "POST") {
        return api_set_priority2(req);
    }
    if (req.path == "/api/clock-class" && req.method == "POST") {
        return api_set_clock_class(req);
    }
    if (req.path == "/api/clock-accuracy" && req.method == "POST") {
        return api_set_clock_accuracy(req);
    }
    if (req.path == "/api/history" && req.method == "GET") {
        return api_get_history(req);
    }
    if (req.path == "/api/measurements" && req.method == "GET") {
        return api_get_measurements(req);
    }
    if (req.path == "/api/export-csv" && req.method == "GET") {
        return api_export_csv(req);
    }
    if (req.path == "/api/sim-offset" && req.method == "POST") {
        return api_set_sim_offset(req);
    }
    if (req.path == "/api/sim-jitter" && req.method == "POST") {
        return api_set_sim_jitter(req);
    }

    if (req.method == "GET") {
        std::string filePath = req.path;
        if (filePath == "/") filePath = "/index.html";
        HttpResponse staticResp = serve_static_file(filePath);
        if (staticResp.status == 200) return staticResp;
    }

    resp.status = 404;
    resp.body = R"({"error":"not found"})";
    return resp;
}

HttpResponse HttpServer::serve_static_file(const std::string& path) {
    std::string filePath = staticDir_ + path;

    std::ifstream file(filePath, std::ios::binary);
    if (!file.is_open()) {
        HttpResponse resp;
        resp.status = 404;
        return resp;
    }

    std::ostringstream ss;
    ss << file.rdbuf();
    HttpResponse resp;
    resp.status = 200;
    resp.body = ss.str();

    if (path.find(".html") != std::string::npos) resp.contentType = "text/html";
    else if (path.find(".css") != std::string::npos) resp.contentType = "text/css";
    else if (path.find(".js") != std::string::npos) resp.contentType = "application/javascript";
    else resp.contentType = "application/octet-stream";

    return resp;
}

std::string HttpServer::build_response(const HttpResponse& resp) {
    std::ostringstream ss;
    ss << "HTTP/1.1 " << resp.status << " OK\r\n";
    ss << "Content-Type: " << resp.contentType << "\r\n";
    ss << "Content-Length: " << resp.body.size() << "\r\n";
    ss << "Connection: close\r\n";
    for (auto& [k, v] : resp.headers) {
        ss << k << ": " << v << "\r\n";
    }
    ss << "\r\n";
    ss << resp.body;
    return ss.str();
}

std::string HttpServer::json_escape(const std::string& s) {
    std::string result;
    for (char c : s) {
        switch (c) {
            case '"': result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default: result += c;
        }
    }
    return result;
}

std::string HttpServer::url_decode(const std::string& str) {
    std::string result;
    for (size_t i = 0; i < str.size(); ++i) {
        if (str[i] == '%' && i + 2 < str.size()) {
            int val = 0;
            std::istringstream iss(str.substr(i + 1, 2));
            iss >> std::hex >> val;
            result += static_cast<char>(val);
            i += 2;
        } else if (str[i] == '+') {
            result += ' ';
        } else {
            result += str[i];
        }
    }
    return result;
}

std::unordered_map<std::string, std::string> HttpServer::parse_query(const std::string& query) {
    std::unordered_map<std::string, std::string> params;
    std::istringstream iss(query);
    std::string pair;
    while (std::getline(iss, pair, '&')) {
        size_t eq = pair.find('=');
        if (eq != std::string::npos) {
            params[url_decode(pair.substr(0, eq))] = url_decode(pair.substr(eq + 1));
        }
    }
    return params;
}

std::string HttpServer::clock_accuracy_to_string(uint8_t ca) {
    if (ca <= 0x17) return "Reserved";
    if (ca == 0x20) return "Accurate to 25ns";
    if (ca == 0x21) return "Accurate to 100ns";
    if (ca == 0x22) return "Accurate to 250ns";
    if (ca == 0x23) return "Accurate to 1us";
    if (ca == 0x24) return "Accurate to 2.5us";
    if (ca == 0x25) return "Accurate to 10us";
    if (ca == 0x26) return "Accurate to 25us";
    if (ca == 0x27) return "Accurate to 100us";
    if (ca == 0x28) return "Accurate to 250us";
    if (ca == 0x29) return "Accurate to 1ms";
    if (ca == 0x2A) return "Accurate to 2.5ms";
    if (ca == 0x2B) return "Accurate to 10ms";
    if (ca == 0x2C) return "Accurate to 25ms";
    if (ca == 0x2D) return "Accurate to 100ms";
    if (ca == 0x2E) return "Accurate to 250ms";
    if (ca == 0x2F) return "Accurate to 1s";
    if (ca == 0x30) return "Accurate to 10s";
    if (ca == 0x31) return "Accurate to >10s";
    if (ca == 0x32) return "Unknown";
    if (ca == 0xFE) return "Default";
    if (ca == 0xFF) return "Reserved";
    return "Unknown";
}

HttpResponse HttpServer::api_get_status(const HttpRequest&) {
    PTPStatus status = clock_.get_status();
    std::ostringstream ss;

    ss << "{";
    ss << "\"currentState\":\"" << json_escape(status.stateString) << "\",";
    ss << "\"localClock\":{";
    ss << "\"identity\":\"" << json_escape(status.localDS.clockIdentity.to_string()) << "\",";
    ss << "\"priority1\":" << static_cast<int>(status.localDS.priority1) << ",";
    ss << "\"priority2\":" << static_cast<int>(status.localDS.priority2) << ",";
    ss << "\"clockClass\":" << static_cast<int>(status.localDS.clockQuality.clockClass) << ",";
    ss << "\"clockAccuracy\":" << static_cast<int>(status.localDS.clockQuality.clockAccuracy) << ",";
    ss << "\"clockAccuracyDesc\":\"" << json_escape(clock_accuracy_to_string(status.localDS.clockQuality.clockAccuracy)) << "\",";
    ss << "\"domain\":" << static_cast<int>(status.localDS.domainNumber) << ",";
    ss << "\"slaveOnly\":" << (status.localDS.slaveOnly ? "true" : "false");
    ss << "},";

    ss << "\"hasGrandmaster\":" << (status.hasGrandmaster ? "true" : "false") << ",";

    if (status.hasGrandmaster) {
        ss << "\"grandmaster\":{";
        ss << "\"identity\":\"" << json_escape(status.grandmaster.grandmasterIdentity.to_string()) << "\",";
        ss << "\"priority1\":" << static_cast<int>(status.grandmaster.grandmasterPriority1) << ",";
        ss << "\"priority2\":" << static_cast<int>(status.grandmaster.grandmasterPriority2) << ",";
        ss << "\"clockClass\":" << static_cast<int>(status.grandmaster.grandmasterClockQuality.clockClass) << ",";
        ss << "\"clockAccuracy\":" << static_cast<int>(status.grandmaster.grandmasterClockQuality.clockAccuracy) << ",";
        ss << "\"clockAccuracyDesc\":\"" << json_escape(clock_accuracy_to_string(status.grandmaster.grandmasterClockQuality.clockAccuracy)) << "\",";
        ss << "\"stepsRemoved\":" << status.grandmaster.stepsRemoved << ",";
        ss << "\"timeSource\":\"0x" << std::hex << std::uppercase << static_cast<int>(status.grandmaster.timeSource) << std::dec << "\",";
        ss << "\"sourcePort\":\"" << json_escape(status.grandmaster.sourcePortIdentity) << "\"";
        ss << "},";
    } else {
        ss << "\"grandmaster\":null,";
    }

    ss << "\"foreignMasters\":[";
    for (size_t i = 0; i < status.foreignMasterIds.size(); ++i) {
        if (i > 0) ss << ",";
        ss << "\"" << json_escape(status.foreignMasterIds[i]) << "\"";
    }
    ss << "],";

    ss << "\"bmcaDescription\":\"" << json_escape(status.bmcaDescription) << "\",";

    if (status.hasMeasurement) {
        ss << "\"measurement\":{";
        ss << "\"seq\":" << status.latestMeasurement.sequenceId << ",";
        ss << "\"t1\":" << status.latestMeasurement.t1.to_nanoseconds() << ",";
        ss << "\"t2\":" << status.latestMeasurement.t2.to_nanoseconds() << ",";
        ss << "\"t3\":" << status.latestMeasurement.t3.to_nanoseconds() << ",";
        ss << "\"t4\":" << status.latestMeasurement.t4.to_nanoseconds() << ",";
        ss << "\"offsetNs\":" << status.latestMeasurement.offset_ns << ",";
        ss << "\"delayNs\":" << status.latestMeasurement.delay_ns << ",";
        ss << std::fixed << std::setprecision(3);
        ss << "\"offsetUs\":" << status.latestMeasurement.offset_us << ",";
        ss << "\"delayUs\":" << status.latestMeasurement.delay_us;
        ss << "},";
    } else {
        ss << "\"measurement\":null,";
    }

    ss << "\"stateHistory\":[";
    for (size_t i = 0; i < status.stateHistory.size(); ++i) {
        if (i > 0) ss << ",";
        ss << "{\"timestamp\":\"" << json_escape(status.stateHistory[i].first) << "\",";
        ss << "\"transition\":\"" << json_escape(status.stateHistory[i].second) << "\"}";
    }
    ss << "]";

    ss << "}";

    HttpResponse resp;
    resp.status = 200;
    resp.body = ss.str();
    return resp;
}

HttpResponse HttpServer::api_inject_announce(const HttpRequest& req) {
    auto& p = req.params;

    std::string gmId = p.count("grandmasterIdentity") ? p.at("grandmasterIdentity") : "00:00:00:00:00:00:00:01";
    uint8_t priority1 = p.count("priority1") ? static_cast<uint8_t>(std::stoi(p.at("priority1"))) : 128;
    uint8_t priority2 = p.count("priority2") ? static_cast<uint8_t>(std::stoi(p.at("priority2"))) : 128;
    uint8_t clockClass = p.count("clockClass") ? static_cast<uint8_t>(std::stoi(p.at("clockClass"))) : 248;
    uint8_t clockAccuracy = p.count("clockAccuracy") ? static_cast<uint8_t>(std::stoi(p.at("clockAccuracy"))) : 0xFE;
    uint16_t stepsRemoved = p.count("stepsRemoved") ? static_cast<uint16_t>(std::stoi(p.at("stepsRemoved"))) : 0;

    clock_.inject_announce(gmId, priority1, priority2, clockClass, clockAccuracy, stepsRemoved, 0);

    HttpResponse resp;
    resp.status = 200;
    resp.body = R"({"status":"ok","message":"Announce injected"})";
    return resp;
}

HttpResponse HttpServer::api_set_priority1(const HttpRequest& req) {
    auto& p = req.params;
    uint8_t val = p.count("value") ? static_cast<uint8_t>(std::stoi(p.at("value"))) : 128;
    clock_.set_local_priority1(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"value\":" + std::to_string(val) + "}";
    return resp;
}

HttpResponse HttpServer::api_set_priority2(const HttpRequest& req) {
    auto& p = req.params;
    uint8_t val = p.count("value") ? static_cast<uint8_t>(std::stoi(p.at("value"))) : 128;
    clock_.set_local_priority2(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"value\":" + std::to_string(val) + "}";
    return resp;
}

HttpResponse HttpServer::api_set_clock_class(const HttpRequest& req) {
    auto& p = req.params;
    uint8_t val = p.count("value") ? static_cast<uint8_t>(std::stoi(p.at("value"))) : 248;
    clock_.set_local_clock_class(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"value\":" + std::to_string(val) + "}";
    return resp;
}

HttpResponse HttpServer::api_set_clock_accuracy(const HttpRequest& req) {
    auto& p = req.params;
    uint8_t val = p.count("value") ? static_cast<uint8_t>(std::stoi(p.at("value"))) : 0xFE;
    clock_.set_local_clock_accuracy(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"value\":" + std::to_string(val) + "}";
    return resp;
}

HttpResponse HttpServer::api_get_history(const HttpRequest&) {
    PTPStatus status = clock_.get_status();
    std::ostringstream ss;
    ss << "[";
    for (size_t i = 0; i < status.stateHistory.size(); ++i) {
        if (i > 0) ss << ",";
        ss << "{\"timestamp\":\"" << json_escape(status.stateHistory[i].first) << "\",";
        ss << "\"transition\":\"" << json_escape(status.stateHistory[i].second) << "\"}";
    }
    ss << "]";

    HttpResponse resp;
    resp.status = 200;
    resp.body = ss.str();
    return resp;
}

HttpResponse HttpServer::api_get_measurements(const HttpRequest& req) {
    int count = 100;
    auto it = req.params.find("count");
    if (it != req.params.end()) {
        count = std::stoi(it->second);
        if (count < 1) count = 1;
        if (count > 3600) count = 3600;
    }

    auto history = clock_.get_measurement_history_copy();
    int startIdx = static_cast<int>(history.size()) - count;
    if (startIdx < 0) startIdx = 0;

    std::ostringstream ss;
    ss << "[";
    bool first = true;
    for (int i = startIdx; i < static_cast<int>(history.size()); ++i) {
        if (!first) ss << ",";
        first = false;
        const auto& m = history[i];
        ss << std::fixed << std::setprecision(3);
        ss << "{";
        ss << "\"seq\":" << m.sequenceId << ",";
        ss << "\"t1\":" << m.t1.to_nanoseconds() << ",";
        ss << "\"t2\":" << m.t2.to_nanoseconds() << ",";
        ss << "\"t3\":" << m.t3.to_nanoseconds() << ",";
        ss << "\"t4\":" << m.t4.to_nanoseconds() << ",";
        ss << "\"offsetNs\":" << m.offset_ns << ",";
        ss << "\"delayNs\":" << m.delay_ns << ",";
        ss << "\"offsetUs\":" << m.offset_us << ",";
        ss << "\"delayUs\":" << m.delay_us;
        ss << "}";
    }
    ss << "]";

    HttpResponse resp;
    resp.status = 200;
    resp.body = ss.str();
    return resp;
}

HttpResponse HttpServer::api_export_csv(const HttpRequest&) {
    std::string csv = clock_.export_csv();

    HttpResponse resp;
    resp.status = 200;
    resp.contentType = "text/csv";
    resp.headers["Content-Disposition"] = "attachment; filename=\"ptp_sync_measurements.csv\"";
    resp.body = csv;
    return resp;
}

HttpResponse HttpServer::api_set_sim_offset(const HttpRequest& req) {
    auto& p = req.params;
    int64_t val = p.count("value") ? std::stoll(p.at("value")) : 0;
    clock_.set_simulated_offset(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"offsetNs\":" + std::to_string(val) + "}";
    return resp;
}

HttpResponse HttpServer::api_set_sim_jitter(const HttpRequest& req) {
    auto& p = req.params;
    int64_t val = p.count("value") ? std::stoll(p.at("value")) : 50;
    clock_.set_simulated_jitter(val);

    HttpResponse resp;
    resp.status = 200;
    resp.body = "{\"status\":\"ok\",\"jitterNs\":" + std::to_string(val) + "}";
    return resp;
}

}

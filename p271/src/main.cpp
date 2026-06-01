#include "ptp_clock.h"
#include "http_server.h"
#include <iostream>
#include <csignal>
#include <cstdlib>
#include <array>

static ptp::PTPClock* g_clock = nullptr;

void signal_handler(int) {
    if (g_clock) {
        g_clock->stop();
    }
    std::exit(0);
}

int main(int argc, char* argv[]) {
    int port = 8080;
    if (argc > 1) {
        port = std::atoi(argv[1]);
    }

    ptp::DefaultDS localDS;
    localDS.clockIdentity = ptp::ClockIdentity::from_string("0C29A7FFFE123456");
    localDS.priority1 = 128;
    localDS.priority2 = 128;
    localDS.clockQuality.clockClass = 248;
    localDS.clockQuality.clockAccuracy = 0xFE;
    localDS.clockQuality.offsetScaledLogVariance = 0xFFFF;
    localDS.domainNumber = 0;
    localDS.numberPorts = 1;
    localDS.slaveOnly = false;

    ptp::PTPClock clock(localDS);
    g_clock = &clock;

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    clock.start();

    ptp::HttpServer server(clock, port);
    server.start();

    std::cout << "PTP Ordinary Clock Simulator running" << std::endl;
    std::cout << "  Clock Identity: " << localDS.clockIdentity.to_string() << std::endl;
    std::cout << "  Priority1: " << static_cast<int>(localDS.priority1) << std::endl;
    std::cout << "  Priority2: " << static_cast<int>(localDS.priority2) << std::endl;
    std::cout << "  Clock Class: " << static_cast<int>(localDS.clockQuality.clockClass) << std::endl;
    std::cout << "  HTTP API: http://localhost:" << port << "/api/status" << std::endl;
    std::cout << "  Dashboard: http://localhost:" << port << "/" << std::endl;
    std::cout << "  Press Ctrl+C to stop" << std::endl;

    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
}

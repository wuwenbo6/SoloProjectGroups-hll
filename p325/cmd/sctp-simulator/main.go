package main

import (
	"flag"
	"log"
	"sctp-simulator/internal/server"
	"sctp-simulator/pkg/sctp"
	"time"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP server address")
	heartbeatInterval := flag.Duration("heartbeat", 1*time.Second, "Heartbeat interval")
	maxMissed := flag.Int("max-missed", 3, "Max missed heartbeats before failover")
	flag.Parse()

	config := sctp.SimulatorConfig{
		EndpointAName:       "端点 A",
		EndpointBName:       "端点 B",
		EndpointAIPs:        []string{"192.168.1.1", "192.168.2.1"},
		EndpointBIPs:        []string{"192.168.1.2", "192.168.2.2"},
		HeartbeatInterval:   *heartbeatInterval,
		MaxMissedHeartbeats: *maxMissed,
	}

	sim := sctp.NewSimulator(config)
	sim.Start()

	srv := server.NewServer(sim)

	log.Printf("SCTP 模拟器已启动")
	log.Printf("  端点 A IPs: %v", config.EndpointAIPs)
	log.Printf("  端点 B IPs: %v", config.EndpointBIPs)
	log.Printf("  心跳间隔: %v", *heartbeatInterval)
	log.Printf("  最大错过心跳: %d", *maxMissed)
	log.Printf("Web UI: http://localhost%s", *addr)

	if err := srv.Start(*addr); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

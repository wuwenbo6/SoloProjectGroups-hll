package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lisp-mapserver/internal/api"
	"github.com/lisp-mapserver/internal/mapserver"
	"github.com/lisp-mapserver/internal/server"
)

const (
	defaultUDPPort     = ":4342"
	defaultHTTPPort    = ":8080"
)

func main() {
	log.Println("Starting LISP Map-Server...")

	ms := mapserver.NewMapServer()

	mappings := ms.GetAllMappings()
	log.Printf("Loaded %d default EID-RLOC mappings:", len(mappings))
	for _, m := range mappings {
		rlocIPs := make([]string, 0, len(m.RLOCs))
		for _, r := range m.RLOCs {
			rlocIPs = append(rlocIPs, r.IP)
		}
		log.Printf("  %s/%d -> %v", m.EID, m.EIDMaskLen, rlocIPs)
	}

	udpServer := server.NewUDPServer(defaultUDPPort, ms)
	if err := udpServer.Start(); err != nil {
		log.Fatalf("Failed to start UDP server: %v", err)
	}

	apiServer := api.NewAPIServer(defaultHTTPPort, ms)
	if err := apiServer.Start(); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}

	log.Println("LISP Map-Server is running.")
	log.Printf("  UDP (LISP Control): %s", defaultUDPPort)
	log.Printf("  HTTP API/Web UI:   http://localhost%s", defaultHTTPPort)
	log.Println("Press Ctrl+C to stop...")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("\nShutting down...")

	if err := udpServer.Stop(); err != nil {
		log.Printf("Error stopping UDP server: %v", err)
	}

	if err := apiServer.Stop(); err != nil {
		log.Printf("Error stopping API server: %v", err)
	}

	stats := ms.GetStats()
	log.Println("Final statistics:")
	log.Printf("  Total Requests:  %d", stats.TotalRequests)
	log.Printf("  Total Replies:   %d", stats.TotalReplies)
	log.Printf("  Cache Hits:      %d", stats.CacheHits)
	log.Printf("  Cache Misses:    %d", stats.CacheMisses)
	log.Printf("  Uptime:          %v", stats.Uptime)

	log.Println("LISP Map-Server stopped.")
}

package main

import (
	"flag"
	"log"
	"net/http"
	"nvme-simulator/internal/server"
	"nvme-simulator/pkg/nvme"
)

func main() {
	port := flag.String("port", "8080", "Server port")
	mode := flag.String("mode", "both", "Run mode: server, cli, or both")
	flag.Parse()

	controller := nvme.NewController()
	wsServer := server.NewWebSocketController(controller)

	if *mode == "cli" || *mode == "both" {
		go func() {
			log.Printf("NVMe CLI simulator ready")
		}()
	}

	if *mode == "server" || *mode == "both" {
		http.HandleFunc("/", wsServer.HandleIndex)
		http.HandleFunc("/ws", wsServer.HandleWebSocket)
		http.HandleFunc("/api/status", wsServer.HandleStatus)

		log.Printf("NVMe Simulator Server starting on port %s", *port)
		log.Printf("WebSocket endpoint: ws://localhost:%s/ws", *port)
		log.Printf("Status API: http://localhost:%s/api/status", *port)
		log.Printf("Web UI: http://localhost:%s/", *port)

		if err := http.ListenAndServe(":"+*port, nil); err != nil {
			log.Fatalf("Server error: %v", err)
		}
	}
}

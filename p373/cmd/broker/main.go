package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"mqtt-quic-broker/internal/quic"
	"mqtt-quic-broker/internal/session"
	"mqtt-quic-broker/internal/websocket"
)

func main() {
	sessionMgr := session.NewManager()
	wsHub := websocket.NewHub()
	go wsHub.Run()

	server, err := quic.NewServer(
		":1883",
		"certs/server.crt",
		"certs/server.key",
		sessionMgr,
		wsHub,
	)
	if err != nil {
		log.Fatalf("Failed to create QUIC server: %v", err)
	}

	go func() {
		if err := server.ListenAndServe(); err != nil {
			log.Fatalf("QUIC server error: %v", err)
		}
	}()

	http.HandleFunc("/ws", wsHub.HandleWebSocket)
	http.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		
		sessions := sessionMgr.GetAll()
		type ClientInfo struct {
			ClientID    string `json:"clientId"`
			Connected   bool   `json:"connected"`
			CurrentAddr string `json:"currentAddr"`
			ConnID      string `json:"connId"`
			SubsCount   int    `json:"subscriptionsCount"`
			QueueCount  int    `json:"queueCount"`
		}
		
		clients := make([]ClientInfo, 0, len(sessions))
		for _, s := range sessions {
			clients = append(clients, ClientInfo{
				ClientID:    s.ClientID,
				Connected:   s.Connected,
				CurrentAddr: s.CurrentAddr,
				ConnID:      s.ConnectionID,
				SubsCount:   len(s.Subscriptions),
				QueueCount:  len(s.MessageQueue),
			})
		}
		
		json.NewEncoder(w).Encode(map[string]interface{}{
			"clients":          clients,
			"websocketClients": len(wsHub.GetStatus()),
		})
	})

	fs := http.FileServer(http.Dir("web"))
	http.Handle("/", fs)

	go func() {
		log.Printf("HTTP server listening on :8888")
		if err := http.ListenAndServe(":8888", nil); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
	server.Shutdown()
}

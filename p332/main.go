package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"pfc-simulator/pfc"
	"sync"

	"github.com/gorilla/websocket"
)

//go:embed static/*
var staticFiles embed.FS

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]bool)}
}

func (h *Hub) Add(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[conn] = true
}

func (h *Hub) Remove(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, conn)
}

func (h *Hub) Broadcast(data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.clients {
		err := conn.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			conn.Close()
			delete(h.clients, conn)
		}
	}
}

func main() {
	sim := pfc.NewSimulator(3, 100, 100)
	hub := NewHub()

	go sim.Start()

	go func() {
		for snap := range sim.SnapshotCh {
			data, err := json.Marshal(snap)
			if err != nil {
				continue
			}
			hub.Broadcast(data)
		}
	}()

	http.HandleFunc("/api/stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		stats := sim.ExportStats()
		json.NewEncoder(w).Encode(stats)
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("WebSocket upgrade error:", err)
			return
		}
		hub.Add(conn)
		defer func() {
			hub.Remove(conn)
			conn.Close()
		}()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var cmd map[string]interface{}
			if err := json.Unmarshal(msg, &cmd); err != nil {
				continue
			}
			if action, ok := cmd["action"].(string); ok {
				switch action {
				case "pause":
					sim.SetPaused(true)
				case "resume":
					sim.SetPaused(false)
				case "history":
					historyData, _ := json.Marshal(map[string]interface{}{
						"type":    "history",
						"history": sim.History,
					})
					conn.WriteMessage(websocket.TextMessage, historyData)
				}
			}
		}
	})

	fs, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}
	http.Handle("/", http.FileServer(http.FS(fs)))

	addr := ":8080"
	fmt.Printf("PFC Simulator running at http://localhost%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

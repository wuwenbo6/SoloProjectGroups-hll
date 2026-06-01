package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type ClientEvent struct {
	Type            string        `json:"type"`
	ClientID        string        `json:"clientId"`
	Addr            string        `json:"addr"`
	ConnID          string        `json:"connId"`
	Timestamp       time.Time     `json:"timestamp"`
	Message         string        `json:"message,omitempty"`
	Topic           string        `json:"topic,omitempty"`
	Payload         string        `json:"payload,omitempty"`
	MigrationDuration time.Duration `json:"migrationDuration,omitempty"`
	Using0RTT       bool          `json:"using0RTT,omitempty"`
	MigrationCount  int           `json:"migrationCount,omitempty"`
	AvgDuration     time.Duration `json:"avgDuration,omitempty"`
}

type Hub struct {
	clients   map[*websocket.Conn]bool
	broadcast chan ClientEvent
	mu        sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan ClientEvent, 100),
	}
}

func (h *Hub) Run() {
	for {
		event := <-h.broadcast
		h.mu.RLock()
		for client := range h.clients {
			err := client.WriteJSON(event)
			if err != nil {
				log.Printf("websocket write error: %v", err)
				client.Close()
				delete(h.clients, client)
			}
		}
		h.mu.RUnlock()
	}
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()

	log.Printf("new websocket client connected")

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
		conn.Close()
		log.Printf("websocket client disconnected")
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *Hub) Broadcast(event ClientEvent) {
	select {
	case h.broadcast <- event:
	default:
		log.Printf("websocket broadcast channel full, dropping event")
	}
}

func (h *Hub) ClientConnected(clientID, addr, connID string) {
	h.Broadcast(ClientEvent{
		Type:      "connected",
		ClientID:  clientID,
		Addr:      addr,
		ConnID:    connID,
		Timestamp: time.Now(),
		Message:   "Client connected",
	})
}

func (h *Hub) ClientDisconnected(clientID, addr, connID string) {
	h.Broadcast(ClientEvent{
		Type:      "disconnected",
		ClientID:  clientID,
		Addr:      addr,
		ConnID:    connID,
		Timestamp: time.Now(),
		Message:   "Client disconnected",
	})
}

func (h *Hub) PathChanged(clientID, oldAddr, newAddr, connID string, duration time.Duration, migrationCount int, avgDuration time.Duration, using0RTT bool) {
	msg := "Network path changed: " + oldAddr + " -> " + newAddr
	if duration > 0 {
		msg += " (took " + duration.String() + ")"
	}
	h.Broadcast(ClientEvent{
		Type:              "path_changed",
		ClientID:          clientID,
		Addr:              newAddr,
		ConnID:            connID,
		Timestamp:         time.Now(),
		Message:           msg,
		MigrationDuration: duration,
		MigrationCount:    migrationCount,
		AvgDuration:       avgDuration,
		Using0RTT:         using0RTT,
	})
}

func (h *Hub) MessageReceived(clientID, topic, payload string) {
	h.Broadcast(ClientEvent{
		Type:      "message",
		ClientID:  clientID,
		Timestamp: time.Now(),
		Topic:     topic,
		Payload:   payload,
		Message:   "Received message on topic: " + topic,
	})
}

func (h *Hub) MessagePublished(clientID, topic, payload string) {
	h.Broadcast(ClientEvent{
		Type:      "publish",
		ClientID:  clientID,
		Timestamp: time.Now(),
		Topic:     topic,
		Payload:   payload,
		Message:   "Published message to topic: " + topic,
	})
}

func (h *Hub) GetStatus() map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return map[string]interface{}{
		"websocketClients": len(h.clients),
	}
}

func (h *Hub) MarshalJSON() ([]byte, error) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return json.Marshal(map[string]interface{}{
		"connectedClients": len(h.clients),
	})
}

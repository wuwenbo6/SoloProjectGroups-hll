package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/user/lldp-topology/internal/topology"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type wsClient struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

type Handler struct {
	store     *topology.TopologyStore
	clients   map[*wsClient]bool
	clientsMu sync.Mutex
}

func NewHandler(store *topology.TopologyStore) *Handler {
	h := &Handler{
		store:   store,
		clients: make(map[*wsClient]bool),
	}
	store.OnChange(h.broadcastTopology)
	return h
}

func (h *Handler) SetupRoutes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/topology", h.handleTopology)
	mux.HandleFunc("/api/topology/export", h.handleExportTopology)
	mux.HandleFunc("/api/devices", h.handleDevices)
	mux.HandleFunc("/api/devices/", h.handleDeviceByID)
	mux.HandleFunc("/ws/topology", h.handleWS)

	mux.Handle("/", http.FileServer(http.Dir("./web/dist")))

	return corsMiddleware(mux)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (h *Handler) handleTopology(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := h.store.GetTopology()
	writeJSON(w, http.StatusOK, data)
}

func (h *Handler) handleExportTopology(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	exportData := struct {
		ExportedAt time.Time              `json:"exportedAt"`
		Version    string                 `json:"version"`
		Metadata   map[string]interface{} `json:"metadata"`
		Devices    []topology.Device      `json:"devices"`
		Links      []topology.Link        `json:"links"`
	}{
		ExportedAt: time.Now(),
		Version:    "1.0",
		Metadata: map[string]interface{}{
			"exporter":    "lldp-topology-server",
			"deviceCount": len(h.store.GetDevices()),
			"linkCount":   len(h.store.GetTopology().Links),
		},
		Devices: h.store.GetDevices(),
		Links:   h.store.GetTopology().Links,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"topology-export-%s.json\"", time.Now().Format("20060102-150405")))
	w.WriteHeader(http.StatusOK)

	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	if err := enc.Encode(exportData); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}

func (h *Handler) handleDevices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	devices := h.store.GetDevices()
	writeJSON(w, http.StatusOK, devices)
}

func (h *Handler) handleDeviceByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	if path == "" {
		http.Error(w, "device id required", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(path, "/", 2)
	id := parts[0]

	if len(parts) == 2 && parts[1] == "neighbors" {
		neighbors, links := h.store.GetNeighbors(id)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"devices": neighbors,
			"links":   links,
		})
		return
	}

	device := h.store.GetDevice(id)
	if device == nil {
		http.Error(w, "device not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, device)
}

func (h *Handler) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	client := &wsClient{conn: conn}

	h.clientsMu.Lock()
	h.clients[client] = true
	h.clientsMu.Unlock()

	topo := h.store.GetTopology()
	h.sendToClient(client, WSMessage{Type: "topology_full", Data: topo})

	go h.readPump(client)
}

func (h *Handler) readPump(client *wsClient) {
	defer func() {
		h.clientsMu.Lock()
		delete(h.clients, client)
		h.clientsMu.Unlock()
		client.conn.Close()
	}()

	for {
		_, _, err := client.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *Handler) sendToClient(client *wsClient, msg WSMessage) {
	client.mu.Lock()
	defer client.mu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("WebSocket marshal error: %v", err)
		return
	}

	if err := client.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("WebSocket write error: %v", err)
	}
}

func (h *Handler) broadcastTopology() {
	topo := h.store.GetTopology()
	msg := WSMessage{Type: "topology_full", Data: topo}

	h.clientsMu.Lock()
	clients := make([]*wsClient, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.clientsMu.Unlock()

	for _, client := range clients {
		h.sendToClient(client, msg)
	}
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}

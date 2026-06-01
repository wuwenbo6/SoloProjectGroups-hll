package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"mdns-reflector/reflector"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
	bus     *reflector.Bus
}

func NewHub(bus *reflector.Bus) *Hub {
	return &Hub{
		clients: make(map[*Client]bool),
		bus:     bus,
	}
}

func (h *Hub) Run() {
	ch := h.bus.Subscribe()
	defer h.bus.Unsubscribe(ch)

	for event := range ch {
		data, err := json.Marshal(event)
		if err != nil {
			log.Printf("ws hub marshal error: %v", err)
			continue
		}
		h.mu.RLock()
		for client := range h.clients {
			select {
			case client.send <- data:
			default:
				h.mu.RUnlock()
				h.removeClient(client)
				h.mu.RLock()
			}
		}
		h.mu.RUnlock()
	}
}

func (h *Hub) addClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client] = true
}

func (h *Hub) removeClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[client]; ok {
		delete(h.clients, client)
		close(client.send)
	}
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}
	client := &Client{hub: h, conn: conn, send: make(chan []byte, 256)}
	h.addClient(client)

	go client.writePump()
	go client.readPump()
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.removeClient(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(512)
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
	}
}

func HandleWS(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hub.ServeWS(w, r)
	}
}

package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	ospf "ospfv3-simulator/ospf"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Hub struct {
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
	engine  *ospf.Engine
}

func NewHub(engine *ospf.Engine) *Hub {
	return &Hub{
		clients: make(map[*websocket.Conn]bool),
		engine:  engine,
	}
}

type ClientMessage struct {
	Type     string         `json:"type"`
	Event    ospf.OspfEvent `json:"event,omitempty"`
	RouterID string         `json:"routerId,omitempty"`
	TargetID string         `json:"targetId,omitempty"`
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()

	topoData, links := h.engine.GetTopology()
	h.sendToClient(conn, map[string]interface{}{
		"type":    "topology_update",
		"routers": topoData,
		"links":   links,
	})

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		var clientMsg ClientMessage
		if err := json.Unmarshal(msg, &clientMsg); err != nil {
			log.Printf("Message parse error: %v", err)
			continue
		}

		h.handleMessage(clientMsg)
	}
}

func (h *Hub) handleMessage(msg ClientMessage) {
	switch msg.Type {
	case "trigger_event":
		events := h.engine.TriggerEvent(msg.Event, msg.RouterID, msg.TargetID)
		h.broadcastEvents(events)

	case "select_router":
		detail := h.engine.GetRouterDetail(msg.RouterID)
		if detail != nil {
			h.broadcast(map[string]interface{}{
				"type":   "router_detail",
				"router": detail,
			})
		}

	case "reset_all":
		events := h.engine.ResetAll()
		h.broadcastEvents(events)
		h.broadcast(map[string]interface{}{
			"type":      "log",
			"message":   "All neighbors reset to Down state",
			"level":     "warn",
			"timestamp": time.Now().UnixMilli(),
		})

	case "auto_demo":
		go h.runAutoDemo(msg.RouterID, msg.TargetID)
	}
}

func (h *Hub) runAutoDemo(routerKey, targetKey string) {
	steps := []struct {
		event ospf.OspfEvent
		desc  string
	}{
		{ospf.EventSendHello, "Step 1: Send Hello → Down→Init"},
		{ospf.EventSendHello, "Step 2: Send Hello (with self) → Init→2-Way"},
		{ospf.EventSendDBD, "Step 3: Send DBD → 2-Way→ExStart"},
		{ospf.EventSendDBD, "Step 4: DBD negotiation → ExStart→Exchange"},
		{ospf.EventSendDBD, "Step 5: DBD complete → Exchange→Loading"},
		{ospf.EventSendLSR, "Step 6: Send LSR (request LSAs)"},
		{ospf.EventSendLSU, "Step 7: Send LSU → Loading→Full"},
	}

	for _, step := range steps {
		events := h.engine.TriggerEvent(step.event, routerKey, targetKey)
		h.broadcastEvents(events)
		h.broadcast(map[string]interface{}{
			"type":      "log",
			"message":   step.desc,
			"level":     "info",
			"timestamp": time.Now().UnixMilli(),
		})
		time.Sleep(800 * time.Millisecond)
	}

	h.broadcast(map[string]interface{}{
		"type":      "log",
		"message":   "Auto demo completed: Down → Init → 2-Way → ExStart → Exchange → Loading → Full",
		"level":     "info",
		"timestamp": time.Now().UnixMilli(),
	})
}

func (h *Hub) broadcastEvents(events []ospf.EngineEvent) {
	for _, ev := range events {
		h.broadcast(map[string]interface{}{
			"type":    ev.Type,
			"payload": ev.Payload,
		})
	}
}

func (h *Hub) broadcast(msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("JSON marshal error: %v", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	for conn := range h.clients {
		err := conn.WriteMessage(websocket.TextMessage, data)
		if err != nil {
			log.Printf("WebSocket write error: %v", err)
			conn.Close()
			delete(h.clients, conn)
		}
	}
}

func (h *Hub) sendToClient(conn *websocket.Conn, msg map[string]interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("JSON marshal error: %v", err)
		return
	}
	conn.WriteMessage(websocket.TextMessage, data)
}

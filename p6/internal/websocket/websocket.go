package websocket

import (
	"leakage-monitor/internal/models"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var (
	upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
)

type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func StartHub() {
	log.Println("WebSocket hub started")
}

func HandleConnection(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()

	log.Println("New WebSocket client connected")

	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		log.Println("WebSocket client disconnected")
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func BroadcastData(data *models.SensorData) {
	msg := Message{
		Type: "data",
		Data: data,
	}
	broadcast(msg)
}

func BroadcastAlert(alert *models.Alert) {
	msg := Message{
		Type: "alert",
		Data: alert,
	}
	broadcast(msg)
}

func broadcast(msg Message) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	for client := range clients {
		err := client.WriteJSON(msg)
		if err != nil {
			log.Printf("WebSocket broadcast error: %v", err)
			client.Close()
			delete(clients, client)
		}
	}
}

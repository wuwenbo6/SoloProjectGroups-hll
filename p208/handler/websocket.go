package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"s1ap-simulator/enb"
	"s1ap-simulator/mme"
	"s1ap-simulator/s1ap"
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

type SignalingFlow struct {
	ID          int         `json:"id"`
	Source      string      `json:"source"`
	Destination string      `json:"destination"`
	MessageType string      `json:"messageType"`
	Message     interface{} `json:"message"`
	Timestamp   string      `json:"timestamp"`
}

type WebSocketHandler struct {
	enb        *enb.ENB
	targetEnb  *enb.ENB
	mme        *mme.MME
	clients    map[*websocket.Conn]bool
	broadcast  chan SignalingFlow
	mu         sync.Mutex
	messageID  int
}

func NewWebSocketHandler() *WebSocketHandler {
	handler := &WebSocketHandler{
		enb:       enb.NewENB("eNB-001"),
		targetEnb: enb.NewENB("eNB-002"),
		mme:       mme.NewMME("MME-001"),
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan SignalingFlow),
		messageID: 0,
	}
	go handler.handleBroadcast()
	return handler
}

func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()

	log.Printf("New client connected")

	defer func() {
		h.mu.Lock()
		delete(h.clients, conn)
		h.mu.Unlock()
		conn.Close()
		log.Printf("Client disconnected")
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *WebSocketHandler) handleBroadcast() {
	for flow := range h.broadcast {
		h.mu.Lock()
		for client := range h.clients {
			err := client.WriteJSON(flow)
			if err != nil {
				log.Printf("WebSocket write error: %v", err)
				client.Close()
				delete(h.clients, client)
			}
		}
		h.mu.Unlock()
	}
}

func (h *WebSocketHandler) sendFlow(source, destination, messageType string, message interface{}) {
	h.messageID++
	flow := SignalingFlow{
		ID:          h.messageID,
		Source:      source,
		Destination: destination,
		MessageType: messageType,
		Message:     message,
		Timestamp:   time.Now().Format(time.RFC3339Nano),
	}
	h.broadcast <- flow
}

func (h *WebSocketHandler) StartSignaling(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flowType := r.URL.Query().Get("type")
	if flowType == "" {
		flowType = "attach"
	}

	switch flowType {
	case "x2-handover":
		go h.runX2HandoverFlow()
	default:
		go h.runAttachFlow()
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "started",
		"message": "Signaling flow started",
		"type":    flowType,
	})
}

func (h *WebSocketHandler) runAttachFlow() {
	h.messageID = 0

	log.Println("=== Starting S1AP Attach Flow ===")

	time.Sleep(500 * time.Millisecond)

	initialUEMsg, enbUeId := h.enb.SendInitialUEMessage()
	h.sendFlow("eNB", "MME", string(initialUEMsg.MessageType), initialUEMsg)

	time.Sleep(1 * time.Second)

	mmeUeId := h.mme.ReceiveInitialUEMessage(initialUEMsg)

	time.Sleep(500 * time.Millisecond)

	icsReq := h.mme.SendInitialContextSetupRequest(enbUeId, mmeUeId)
	h.sendFlow("MME", "eNB", string(icsReq.MessageType), icsReq)

	time.Sleep(1 * time.Second)

	h.enb.ReceiveInitialContextSetupRequest(icsReq)

	time.Sleep(500 * time.Millisecond)

	icsResp := h.enb.SendInitialContextSetupResponse(enbUeId, mmeUeId)
	h.sendFlow("eNB", "MME", string(icsResp.MessageType), icsResp)

	time.Sleep(500 * time.Millisecond)

	h.mme.ReceiveInitialContextSetupResponse(icsResp)

	time.Sleep(1 * time.Second)

	log.Println("=== Starting UE Context Release ===")

	releaseCmd := h.mme.SendUEContextReleaseCommand(enbUeId, mmeUeId, "normal-release", "正常释放")
	h.sendFlow("MME", "eNB", string(releaseCmd.MessageType), releaseCmd)

	time.Sleep(1 * time.Second)

	h.enb.ReceiveUEContextReleaseCommand(releaseCmd)

	time.Sleep(500 * time.Millisecond)

	releaseComplete := h.enb.SendUEContextReleaseComplete(enbUeId, mmeUeId)
	h.sendFlow("eNB", "MME", string(releaseComplete.MessageType), releaseComplete)

	time.Sleep(500 * time.Millisecond)

	h.mme.ReceiveUEContextReleaseComplete(releaseComplete)

	log.Println("=== S1AP Attach Flow Complete ===")
}

func (h *WebSocketHandler) runX2HandoverFlow() {
	h.messageID = 0

	sourceEnbId := h.enb.ID
	targetEnbId := h.targetEnb.ID

	log.Println("=== Starting X2 Handover Flow ===")

	time.Sleep(500 * time.Millisecond)

	enbUeId := s1ap.GetENBUeIDGenerator().Next()
	mmeUeId := s1ap.GetMMEUeIDGenerator().Next()

	log.Printf("[Handler] Pre-established context: eNB_UE_ID=%d, MME_UE_ID=%d", enbUeId, mmeUeId)

	handoverReq := h.enb.SendX2HandoverRequest(targetEnbId, mmeUeId, enbUeId)
	h.sendFlow(sourceEnbId, targetEnbId, string(handoverReq.MessageType), handoverReq)

	time.Sleep(1 * time.Second)

	h.targetEnb.ReceiveX2HandoverRequest(handoverReq)

	time.Sleep(500 * time.Millisecond)

	handoverAck := h.targetEnb.SendX2HandoverRequestAck(sourceEnbId, enbUeId)
	h.sendFlow(targetEnbId, sourceEnbId, string(handoverAck.MessageType), handoverAck)

	time.Sleep(1 * time.Second)

	h.enb.ReceiveX2HandoverRequestAck(handoverAck)

	time.Sleep(500 * time.Millisecond)

	snTransfer := h.enb.SendSNStatusTransfer(targetEnbId)
	h.sendFlow(sourceEnbId, targetEnbId, string(snTransfer.MessageType), snTransfer)

	time.Sleep(1 * time.Second)

	h.targetEnb.ReceiveSNStatusTransfer(snTransfer)

	time.Sleep(500 * time.Millisecond)

	pathSwitchReq := h.targetEnb.SendPathSwitchRequest(mmeUeId, enbUeId)
	h.sendFlow(targetEnbId, "MME", string(pathSwitchReq.MessageType), pathSwitchReq)

	time.Sleep(1 * time.Second)

	h.mme.ReceivePathSwitchRequest(pathSwitchReq)

	time.Sleep(500 * time.Millisecond)

	pathSwitchAck := h.mme.SendPathSwitchRequestAck(targetEnbId, mmeUeId, enbUeId)
	h.sendFlow("MME", targetEnbId, string(pathSwitchAck.MessageType), pathSwitchAck)

	time.Sleep(1 * time.Second)

	h.targetEnb.ReceivePathSwitchRequestAck(pathSwitchAck)

	time.Sleep(500 * time.Millisecond)

	log.Println("=== MME triggers UE Context Release to Source eNB ===")

	releaseCmd := h.mme.SendUEContextReleaseCommand(enbUeId, mmeUeId, "ho-to-target", "切换至目标eNB (Handover to target eNB)")
	h.sendFlow("MME", sourceEnbId, string(releaseCmd.MessageType), releaseCmd)

	time.Sleep(1 * time.Second)

	h.enb.ReceiveUEContextReleaseCommand(releaseCmd)

	time.Sleep(500 * time.Millisecond)

	releaseComplete := h.enb.SendUEContextReleaseComplete(enbUeId, mmeUeId)
	h.sendFlow(sourceEnbId, "MME", string(releaseComplete.MessageType), releaseComplete)

	time.Sleep(500 * time.Millisecond)

	h.mme.ReceiveUEContextReleaseComplete(releaseComplete)

	log.Println("=== X2 Handover Flow Complete ===")
}

func (h *WebSocketHandler) ResetSignaling(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	h.messageID = 0
	s1ap.GetENBUeIDGenerator().Reset()
	s1ap.GetMMEUeIDGenerator().Reset()

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "reset",
		"message": "Signaling flow reset",
	})
}

func ServeHome(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "web/index.html")
}

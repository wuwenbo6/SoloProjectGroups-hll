package mtp2

import (
	"fmt"
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

type WebSocketServer struct {
	mu           sync.Mutex
	clients      map[*websocket.Conn]bool
	broadcast    chan *SimulatorEvent
	stateMachine *StateMachine
	eventChan    chan *SimulatorEvent
	pcapWriter   *PcapWriter
}

func NewWebSocketServer() *WebSocketServer {
	eventChan := make(chan *SimulatorEvent, 256)
	return &WebSocketServer{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan *SimulatorEvent, 256),
		eventChan:  eventChan,
		pcapWriter: NewPcapWriter(),
	}
}

func (wss *WebSocketServer) GetStateMachine() *StateMachine {
	return wss.stateMachine
}

func (wss *WebSocketServer) HandleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer ws.Close()

	wss.mu.Lock()
	wss.clients[ws] = true
	wss.mu.Unlock()

	log.Printf("New client connected. Total clients: %d", len(wss.clients))

	wss.sendInitialState(ws)

	for {
		var msg map[string]interface{}
		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			wss.mu.Lock()
			delete(wss.clients, ws)
			wss.mu.Unlock()
			log.Printf("Client disconnected. Total clients: %d", len(wss.clients))
			break
		}

		wss.handleControlMessage(msg)
	}
}

func (wss *WebSocketServer) sendInitialState(ws *websocket.Conn) {
	var state MTP2State = StateIdle
	fisu, lssu, msu := 0, 0, 0
	var syncStatus SyncStatus = SyncInSync
	var t1Active bool
	var t1Retries int
	var t3Active bool
	var t3Retries int
	var expectedFSN int
	var linkStats *LinkStats

	if wss.stateMachine != nil {
		state = wss.stateMachine.GetState()
		fisu, lssu, msu = wss.stateMachine.GetStats()
		syncStatus = wss.stateMachine.GetSyncStatus()
		t1Active, t1Retries, t3Active, t3Retries = wss.stateMachine.GetTimerInfo()
		expectedFSN = wss.stateMachine.GetExpectedFSN()
		linkStats = wss.stateMachine.GetLinkStats()
	} else {
		linkStats = &LinkStats{}
	}

	initialEvent := &SimulatorEvent{
		Event:      "initial_state",
		State:      state,
		SyncStatus: syncStatus,
		Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
	}

	if err := ws.WriteJSON(initialEvent); err != nil {
		log.Printf("Error sending initial state: %v", err)
	}

	wss.mu.Lock()
	pcapCount := wss.pcapWriter.PacketCount()
	wss.mu.Unlock()

	statsEvent := map[string]interface{}{
		"event":        "stats",
		"fisu_count":   fisu,
		"lssu_count":   lssu,
		"msu_count":    msu,
		"sync_status":  syncStatus,
		"expected_fsn": expectedFSN,
		"t1_active":    t1Active,
		"t1_retries":   t1Retries,
		"t3_active":    t3Active,
		"t3_retries":   t3Retries,
		"timestamp":    time.Now().UnixNano() / int64(time.Millisecond),
		"link_stats":   linkStats,
		"pcap_count":   pcapCount,
	}

	if err := ws.WriteJSON(statsEvent); err != nil {
		log.Printf("Error sending stats: %v", err)
	}
}

func (wss *WebSocketServer) handleControlMessage(msg map[string]interface{}) {
	action, ok := msg["action"].(string)
	if !ok {
		return
	}

	switch action {
	case "start":
		if wss.stateMachine == nil {
			wss.stateMachine = NewStateMachine(wss.eventChan)
			wss.stateMachine.Start()
			log.Println("State machine started")
		}
	case "stop":
		if wss.stateMachine != nil {
			wss.stateMachine.Stop()
			wss.stateMachine = nil
			log.Println("State machine stopped")
		}
	case "reset":
		if wss.stateMachine != nil {
			wss.stateMachine.Stop()
		}
		wss.stateMachine = NewStateMachine(wss.eventChan)
		wss.stateMachine.Start()
		wss.mu.Lock()
		wss.pcapWriter.Reset()
		wss.mu.Unlock()
		log.Println("State machine reset")
	case "set_state":
		state, ok := msg["state"].(string)
		if ok && wss.stateMachine != nil {
			wss.stateMachine.ManualStateChange(MTP2State(state))
		}
	case "set_duration":
		duration, ok := msg["duration"].(float64)
		if ok && wss.stateMachine != nil {
			wss.stateMachine.SetStateDuration(time.Duration(duration) * time.Second)
		}
	case "set_auto_advance":
		auto, ok := msg["auto"].(bool)
		if ok && wss.stateMachine != nil {
			wss.stateMachine.SetAutoAdvance(auto)
		}
	case "set_simulate_errors":
		simulate, ok := msg["simulate_errors"].(bool)
		if ok && wss.stateMachine != nil {
			wss.stateMachine.SetSimulateErrors(simulate)
		}
	case "send_message":
		msgType, ok := msg["type"].(string)
		if ok && wss.stateMachine != nil {
			mf := wss.stateMachine.GetMessageFactory()
			var su *SignalUnit
			switch msgType {
			case "FISU":
				su = mf.CreateFISU()
			case "LSSU":
				status, _ := msg["status"].(string)
				su = mf.CreateLSSU(LSSUStatus(status))
			case "MSU":
				si, _ := msg["si"].(string)
				su = mf.CreateMSU(si, nil)
			}
			if su != nil {
				wss.mu.Lock()
				wss.pcapWriter.AddPacket(su.Timestamp, su.Hex)
				wss.mu.Unlock()

				wss.broadcast <- &SimulatorEvent{
					Event:      "message",
					Message:    su,
					State:      wss.stateMachine.GetState(),
					SyncStatus: wss.stateMachine.GetSyncStatus(),
					Timestamp:  su.Timestamp,
				}
			}
		}
	}
}

func (wss *WebSocketServer) HandleBroadcasts() {
	for {
		select {
		case event := <-wss.broadcast:
			wss.mu.Lock()
			for client := range wss.clients {
				err := client.WriteJSON(event)
				if err != nil {
					log.Printf("WebSocket write error: %v", err)
					client.Close()
					delete(wss.clients, client)
				}
			}
			wss.mu.Unlock()
		case event := <-wss.eventChan:
			if event.Message != nil {
				wss.mu.Lock()
				wss.pcapWriter.AddPacket(event.Message.Timestamp, event.Message.Hex)
				wss.mu.Unlock()
			}

			wss.broadcast <- event

			if wss.stateMachine != nil {
				syncStatus := wss.stateMachine.GetSyncStatus()
				t1Active, t1Retries, t3Active, t3Retries := wss.stateMachine.GetTimerInfo()
				expectedFSN := wss.stateMachine.GetExpectedFSN()
				fisu, lssu, msu := wss.stateMachine.GetStats()
				linkStats := wss.stateMachine.GetLinkStats()

				wss.mu.Lock()
				pcapCount := wss.pcapWriter.PacketCount()
				wss.mu.Unlock()

				statsEvent := map[string]interface{}{
					"event":        "stats",
					"fisu_count":   fisu,
					"lssu_count":   lssu,
					"msu_count":    msu,
					"sync_status":  syncStatus,
					"expected_fsn": expectedFSN,
					"t1_active":    t1Active,
					"t1_retries":   t1Retries,
					"t3_active":    t3Active,
					"t3_retries":   t3Retries,
					"timestamp":    time.Now().UnixNano() / int64(time.Millisecond),
					"link_stats":   linkStats,
					"pcap_count":   pcapCount,
				}

				wss.mu.Lock()
				for client := range wss.clients {
					err := client.WriteJSON(statsEvent)
					if err != nil {
						log.Printf("WebSocket write error: %v", err)
						client.Close()
						delete(wss.clients, client)
					}
				}
				wss.mu.Unlock()
			}
		}
	}
}

func (wss *WebSocketServer) HandlePcapDownload(w http.ResponseWriter, r *http.Request) {
	wss.mu.Lock()
	data, err := wss.pcapWriter.Write()
	wss.mu.Unlock()

	if err != nil {
		http.Error(w, "Failed to generate PCAP", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.tcpdump.pcap")
	w.Header().Set("Content-Disposition", "attachment; filename=mtp2_capture.pcap")
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Write(data)
}

func (wss *WebSocketServer) Start(port string) {
	go wss.HandleBroadcasts()

	fs := http.FileServer(http.Dir("./frontend"))
	http.Handle("/", fs)
	http.HandleFunc("/ws", wss.HandleConnections)
	http.HandleFunc("/pcap", wss.HandlePcapDownload)

	log.Printf("Server starting on :%s...", port)
	log.Printf("WebSocket endpoint: ws://localhost:%s/ws", port)
	log.Printf("PCAP download: http://localhost:%s/pcap", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

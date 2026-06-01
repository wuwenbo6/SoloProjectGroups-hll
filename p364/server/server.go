package server

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"iec104-simulator/protocol"
	"iec104-simulator/session"
	"iec104-simulator/simulator"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Server struct {
	sim        *simulator.Simulator
	listener   net.Listener
	wsClients  map[*websocket.Conn]bool
	wsMu       sync.Mutex
	upgrader   websocket.Upgrader
	httpServer *http.Server
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

func NewServer(sim *simulator.Simulator) *Server {
	return &Server{
		sim:       sim,
		wsClients: make(map[*websocket.Conn]bool),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func (s *Server) Start(httpPort int, iecPort int) error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.serveIndex)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.HandleFunc("/api/events", s.handleGetEvents)
	mux.HandleFunc("/api/points", s.handleGetPoints)
	mux.HandleFunc("/api/burst/start", s.handleBurstStart)
	mux.HandleFunc("/api/burst/stop", s.handleBurstStop)
	mux.HandleFunc("/api/gi", s.handleGI)
	mux.HandleFunc("/api/startdt", s.handleStartDT)
	mux.HandleFunc("/api/export/csv", s.handleExportCSV)
	mux.HandleFunc("/api/files", s.handleGetFiles)
	mux.HandleFunc("/api/files/download", s.handleDownloadFile)
	mux.HandleFunc("/api/filetransfer/list", s.handleFTList)
	mux.HandleFunc("/api/filetransfer/get", s.handleFTGetFile)

	s.httpServer = &http.Server{
		Addr:    fmt.Sprintf(":%d", httpPort),
		Handler: mux,
	}

	go s.startIEC104Server(iecPort)
	go s.startEventBroadcaster()

	log.Printf("[Server] HTTP server starting on :%d", httpPort)
	log.Printf("[Server] IEC 104 server starting on :%d", iecPort)

	return s.httpServer.ListenAndServe()
}

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request) {
	webDir := filepath.Join(".", "web")
	htmlPath := filepath.Join(webDir, "index.html")
	data, err := os.ReadFile(htmlPath)
	if err != nil {
		http.Error(w, "Index not found", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(data)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Server] WebSocket upgrade error: %v", err)
		return
	}

	s.wsMu.Lock()
	s.wsClients[conn] = true
	s.wsMu.Unlock()

	defer func() {
		s.wsMu.Lock()
		delete(s.wsClients, conn)
		s.wsMu.Unlock()
		conn.Close()
	}()

	events := s.sim.GetEvents()
	if len(events) > 0 {
		msg := WSMessage{Type: "history", Data: events}
		data, _ := json.Marshal(msg)
		conn.WriteMessage(websocket.TextMessage, data)
	}

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) handleGetEvents(w http.ResponseWriter, r *http.Request) {
	events := s.sim.GetEvents()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func (s *Server) handleGetPoints(w http.ResponseWriter, r *http.Request) {
	type PointInfo struct {
		IOA     uint32 `json:"ioa"`
		Type    string `json:"type"`
		Value   string `json:"value"`
		Quality string `json:"quality"`
	}

	var points []PointInfo
	for _, dp := range s.sim.GetDigitalPoints() {
		points = append(points, PointInfo{
			IOA:   dp.IOA,
			Type:  "Digital",
			Value: fmt.Sprintf("%v", dp.Value),
		})
	}
	for _, mp := range s.sim.GetMeasurePoints() {
		points = append(points, PointInfo{
			IOA:   mp.IOA,
			Type:  "Measure",
			Value: fmt.Sprintf("%.2f", mp.Value),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(points)
}

func (s *Server) handleBurstStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	count, _ := strconv.Atoi(r.URL.Query().Get("count"))
	interval, _ := strconv.Atoi(r.URL.Query().Get("interval"))
	if count <= 0 {
		count = 20
	}
	if interval <= 0 {
		interval = 100
	}
	s.sim.StartSOEBurst(count, interval)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "started"})
}

func (s *Server) handleBurstStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.sim.StopSOEBurst()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func (s *Server) handleGI(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	asduData := protocol.BuildCICNA1(protocol.DefaultASDUCommonAddr, 0, 20)
	sess := s.sim.GetSession()
	if sess != nil {
		sess.SendIFrame(asduData)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "GI sent"})
	} else {
		http.Error(w, "No active session", http.StatusServiceUnavailable)
	}
}

func (s *Server) handleStartDT(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sess := s.sim.GetSession()
	if sess != nil {
		sess.SendUFrame(protocol.UStartDTACT)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "STARTDT sent"})
	} else {
		http.Error(w, "No active session", http.StatusServiceUnavailable)
	}
}

func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	events := s.sim.GetEvents()

	filename := "events_" + time.Now().Format("20060102_150405") + ".csv"
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

	writer := csv.NewWriter(w)
	defer writer.Flush()

	header := []string{"ID", "Timestamp", "CP56Time2a", "Type", "TypeID", "TypeName", "IOA", "Value", "Cause", "Quality"}
	writer.Write(header)

	for _, evt := range events {
		row := []string{
			strconv.FormatInt(evt.ID, 10),
			evt.Timestamp,
			evt.CP56Time,
			string(evt.EventType),
			strconv.Itoa(int(evt.TypeID)),
			evt.TypeName,
			strconv.FormatUint(uint64(evt.IOA), 10),
			evt.Value,
			evt.Cause,
			evt.Quality,
		}
		writer.Write(row)
	}

	log.Printf("[Server] CSV exported: %d events", len(events))
}

func (s *Server) handleGetFiles(w http.ResponseWriter, r *http.Request) {
	files := s.sim.GetFiles()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing name parameter", http.StatusBadRequest)
		return
	}
	content, ok := s.sim.GetFileContent(name)
	if !ok {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+name+"\"")
	w.Write(content)
}

func (s *Server) handleFTList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sess := s.sim.GetSession()
	if sess == nil {
		http.Error(w, "No active IEC 104 session", http.StatusServiceUnavailable)
		return
	}

	go s.sim.SendFileList(sess)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "Directory listing requested"})
}

func (s *Server) handleFTGetFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	sess := s.sim.GetSession()
	if sess == nil {
		http.Error(w, "No active IEC 104 session", http.StatusServiceUnavailable)
		return
	}

	fileID, _ := strconv.Atoi(r.URL.Query().Get("id"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	numSections, _ := strconv.Atoi(r.URL.Query().Get("sections"))

	go s.sim.SendFileContent(sess, uint16(fileID), offset, numSections)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": fmt.Sprintf("File transfer requested: ID=%d Offset=%d Sections=%d", fileID, offset, numSections),
	})
}

func (s *Server) startIEC104Server(port int) {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		log.Fatalf("[IEC104] Listen error: %v", err)
	}
	s.listener = listener
	log.Printf("[IEC104] Listening on :%d", port)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("[IEC104] Accept error: %v", err)
			return
		}
		remoteAddr := conn.RemoteAddr().String()
		log.Printf("[IEC104] New connection from %s", remoteAddr)

		sess := session.NewSession(conn, s.sim)
		s.sim.SetSession(sess)
		sess.Start()
	}
}

func (s *Server) startEventBroadcaster() {
	ch := s.sim.Subscribe()
	defer s.sim.Unsubscribe(ch)

	for evt := range ch {
		msg := WSMessage{Type: "event", Data: evt}
		data, err := json.Marshal(msg)
		if err != nil {
			continue
		}

		s.wsMu.Lock()
		for conn := range s.wsClients {
			err := conn.WriteMessage(websocket.TextMessage, data)
			if err != nil {
				conn.Close()
				delete(s.wsClients, conn)
			}
		}
		s.wsMu.Unlock()
	}
}

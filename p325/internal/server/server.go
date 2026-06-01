package server

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sctp-simulator/pkg/sctp"
	"strconv"
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

type Server struct {
	simulator *sctp.Simulator
	clients   map[*websocket.Conn]bool
	clientsMu sync.Mutex
}

func NewServer(simulator *sctp.Simulator) *Server {
	return &Server{
		simulator: simulator,
		clients:   make(map[*websocket.Conn]bool),
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
	}()

	status := s.simulator.GetStatus()
	if err := conn.WriteJSON(status); err != nil {
		return
	}

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) broadcastStatus() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		<-ticker.C
		status := s.simulator.GetStatus()

		s.clientsMu.Lock()
		for conn := range s.clients {
			err := conn.WriteJSON(status)
			if err != nil {
				conn.Close()
				delete(s.clients, conn)
			}
		}
		s.clientsMu.Unlock()
	}
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	status := s.simulator.GetStatus()
	json.NewEncoder(w).Encode(status)
}

type SimulateRequest struct {
	EndpointID string `json:"endpoint_id"`
	SourceIP   string `json:"source_ip"`
	DestIP     string `json:"dest_ip"`
}

func (s *Server) handleSimulateFailure(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.simulator.SimulateFailure(req.EndpointID, req.SourceIP, req.DestIP)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleSimulateRecovery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SimulateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.simulator.SimulateRecovery(req.EndpointID, req.SourceIP, req.DestIP)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Start()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleStop(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Stop()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.simulator.Reset()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	events := s.simulator.GetAllSwitchEvents()
	json.NewEncoder(w).Encode(events)
}

type SendDataRequest struct {
	EndpointID string `json:"endpoint_id"`
	Content    string `json:"content"`
}

func (s *Server) handleSendData(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SendDataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	s.simulator.SendData(req.EndpointID, req.Content)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

type SetPrimaryPathRequest struct {
	EndpointID string `json:"endpoint_id"`
	SourceIP   string `json:"source_ip"`
	DestIP     string `json:"dest_ip"`
}

func (s *Server) handleSetPrimaryPath(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SetPrimaryPathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	success := s.simulator.SetPrimaryPath(req.EndpointID, req.SourceIP, req.DestIP)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  map[bool]string{true: "ok", false: "error"}[success],
		"success": success,
	})
}

type SetPathPriorityRequest struct {
	EndpointID string `json:"endpoint_id"`
	SourceIP   string `json:"source_ip"`
	DestIP     string `json:"dest_ip"`
	Priority   int    `json:"priority"`
}

func (s *Server) handleSetPathPriority(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SetPathPriorityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	success := s.simulator.SetPathPriority(req.EndpointID, req.SourceIP, req.DestIP, req.Priority)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  map[bool]string{true: "ok", false: "error"}[success],
		"success": success,
	})
}

func (s *Server) handleGetStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	stats := s.simulator.GetSwitchStats()
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) handleExportStatsCSV(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Disposition", "attachment; filename=sctp_switch_stats.csv")

	stats := s.simulator.GetSwitchStats()
	events := s.simulator.GetAllSwitchEvents()

	writer := csv.NewWriter(w)
	defer writer.Flush()

	writer.Write([]string{"SCTP 路径切换延迟统计报告"})
	writer.Write([]string{fmt.Sprintf("生成时间: %s", time.Now().Format("2006-01-02 15:04:05"))})
	writer.Write([]string{})

	writer.Write([]string{"综合统计"})
	writer.Write([]string{"指标", "数值", "单位"})
	writer.Write([]string{"总切换次数", strconv.Itoa(stats.Combined.TotalSwitches), "次"})
	writer.Write([]string{"平均切换时间", fmt.Sprintf("%.2f", stats.Combined.AvgSwitchTimeMs), "ms"})
	writer.Write([]string{"中位数切换时间", fmt.Sprintf("%.2f", stats.Combined.MedianSwitchTimeMs), "ms"})
	writer.Write([]string{"最小切换时间", strconv.FormatInt(stats.Combined.MinSwitchTimeMs, 10), "ms"})
	writer.Write([]string{"最大切换时间", strconv.FormatInt(stats.Combined.MaxSwitchTimeMs, 10), "ms"})
	writer.Write([]string{"P95 切换时间", fmt.Sprintf("%.2f", stats.Combined.P95SwitchTimeMs), "ms"})
	writer.Write([]string{"P99 切换时间", fmt.Sprintf("%.2f", stats.Combined.P99SwitchTimeMs), "ms"})
	writer.Write([]string{})

	writer.Write([]string{"故障原因分布"})
	writer.Write([]string{"原因", "次数"})
	for reason, count := range stats.Combined.FailuresByReason {
		writer.Write([]string{reason, strconv.Itoa(count)})
	}
	writer.Write([]string{})

	writer.Write([]string{"端点 A 统计"})
	writer.Write([]string{"指标", "数值", "单位"})
	writer.Write([]string{"总切换次数", strconv.Itoa(stats.EndpointA.TotalSwitches), "次"})
	writer.Write([]string{"平均切换时间", fmt.Sprintf("%.2f", stats.EndpointA.AvgSwitchTimeMs), "ms"})
	writer.Write([]string{"中位数切换时间", fmt.Sprintf("%.2f", stats.EndpointA.MedianSwitchTimeMs), "ms"})
	writer.Write([]string{})

	writer.Write([]string{"端点 B 统计"})
	writer.Write([]string{"指标", "数值", "单位"})
	writer.Write([]string{"总切换次数", strconv.Itoa(stats.EndpointB.TotalSwitches), "次"})
	writer.Write([]string{"平均切换时间", fmt.Sprintf("%.2f", stats.EndpointB.AvgSwitchTimeMs), "ms"})
	writer.Write([]string{"中位数切换时间", fmt.Sprintf("%.2f", stats.EndpointB.MedianSwitchTimeMs), "ms"})
	writer.Write([]string{})

	writer.Write([]string{"切换事件明细"})
	writer.Write([]string{"序号", "时间", "从路径", "到路径", "切换耗时(ms)", "原因"})
	for i, event := range events {
		fromPath := fmt.Sprintf("%s → %s", event.FromSourceIP, event.FromDestIP)
		toPath := fmt.Sprintf("%s → %s", event.ToSourceIP, event.ToDestIP)
		timestamp := time.Time(event.Timestamp).Format("2006-01-02 15:04:05.000")
		writer.Write([]string{
			strconv.Itoa(i + 1),
			timestamp,
			fromPath,
			toPath,
			strconv.FormatInt(event.SwitchTimeMs, 10),
			event.Reason,
		})
	}
}

func (s *Server) handleExportEventsCSV(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Disposition", "attachment; filename=sctp_switch_events.csv")

	events := s.simulator.GetAllSwitchEvents()

	writer := csv.NewWriter(w)
	defer writer.Flush()

	writer.Write([]string{"序号", "时间", "从路径(源IP)", "从路径(目的IP)", "到路径(源IP)", "到路径(目的IP)", "切换耗时(ms)", "原因"})
	for i, event := range events {
		timestamp := time.Time(event.Timestamp).Format("2006-01-02 15:04:05.000")
		writer.Write([]string{
			strconv.Itoa(i + 1),
			timestamp,
			event.FromSourceIP,
			event.FromDestIP,
			event.ToSourceIP,
			event.ToDestIP,
			strconv.FormatInt(event.SwitchTimeMs, 10),
			event.Reason,
		})
	}
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()

	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", fs)

	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/start", s.handleStart)
	mux.HandleFunc("/api/stop", s.handleStop)
	mux.HandleFunc("/api/reset", s.handleReset)
	mux.HandleFunc("/api/simulate/failure", s.handleSimulateFailure)
	mux.HandleFunc("/api/simulate/recovery", s.handleSimulateRecovery)
	mux.HandleFunc("/api/data/send", s.handleSendData)
	mux.HandleFunc("/api/path/primary", s.handleSetPrimaryPath)
	mux.HandleFunc("/api/path/priority", s.handleSetPathPriority)
	mux.HandleFunc("/api/stats", s.handleGetStats)
	mux.HandleFunc("/api/stats/export", s.handleExportStatsCSV)
	mux.HandleFunc("/api/events/export", s.handleExportEventsCSV)
	mux.HandleFunc("/ws", s.handleWebSocket)

	go s.broadcastStatus()

	log.Printf("Server starting on %s", addr)
	return http.ListenAndServe(addr, mux)
}

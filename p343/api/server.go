package api

import (
	"encoding/json"
	"mlag-simulator/mlag"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Server struct {
	sw1 *mlag.Switch
	sw2 *mlag.Switch
}

func NewServer(sw1, sw2 *mlag.Switch) *Server {
	return &Server{
		sw1: sw1,
		sw2: sw2,
	}
}

func (s *Server) SetupRoutes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/switches", s.handleGetSwitches)
	mux.HandleFunc("/api/switch/", s.handleGetSwitch)
	mux.HandleFunc("/api/heartbeat", s.handleHeartbeat)
	mux.HandleFunc("/api/heartbeat/logs", s.handleGetHeartbeatLogs)
	mux.HandleFunc("/api/heartbeat/export/", s.handleExportHeartbeat)
	mux.HandleFunc("/api/consistency", s.handleGetConsistency)
	mux.HandleFunc("/api/mac/", s.handleGetMacTable)

	fs := http.FileServer(http.Dir("./static"))
	mux.Handle("/static/", http.StripPrefix("/static/", fs))
	mux.Handle("/", fs)

	return mux
}

func (s *Server) handleGetSwitches(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/api/switches" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status1 := s.sw1.GetStatus()
	status2 := s.sw2.GetStatus()

	response := map[string]interface{}{
		"switches": []mlag.SwitchStatus{status1, status2},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetSwitch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	switchID := r.URL.Path[len("/api/switch/"):]

	var status mlag.SwitchStatus
	if switchID == s.sw1.ID {
		status = s.sw1.GetStatus()
	} else if switchID == s.sw2.ID {
		status = s.sw2.GetStatus()
	} else {
		http.Error(w, "Switch not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func (s *Server) handleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var hb mlag.HeartbeatInfo
	if err := json.NewDecoder(r.Body).Decode(&hb); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if hb.SwitchID == s.sw1.ID {
		s.sw2.ReceiveHeartbeat(hb)
	} else if hb.SwitchID == s.sw2.ID {
		s.sw1.ReceiveHeartbeat(hb)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleGetMacTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	switchID := r.URL.Path[len("/api/mac/"):]

	var status mlag.SwitchStatus
	if switchID == s.sw1.ID {
		status = s.sw1.GetStatus()
	} else if switchID == s.sw2.ID {
		status = s.sw2.GetStatus()
	} else {
		http.Error(w, "Switch not found", http.StatusNotFound)
		return
	}

	response := map[string]interface{}{
		"switch_id":       switchID,
		"mac_entries":     status.MacEntries,
		"drift_count":     status.MacDriftCount,
		"blocked_count":   status.MacBlockedCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetConsistency(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status1 := s.sw1.GetStatus()
	status2 := s.sw2.GetStatus()

	response := map[string]interface{}{
		"sw1": status1.Consistency,
		"sw2": status2.Consistency,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetHeartbeatLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	limit := 100
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	logs1 := []mlag.HeartbeatRecord{}
	logs2 := []mlag.HeartbeatRecord{}

	if s.sw1.HeartbeatLogger != nil {
		logs1 = s.sw1.HeartbeatLogger.GetLastN(limit)
	}
	if s.sw2.HeartbeatLogger != nil {
		logs2 = s.sw2.HeartbeatLogger.GetLastN(limit)
	}

	response := map[string]interface{}{
		"sw1_logs": logs1,
		"sw2_logs": logs2,
		"total_sw1": len(logs1),
		"total_sw2": len(logs2),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleExportHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/heartbeat/export/")
	parts := strings.Split(path, "/")
	format := "json"
	switchID := ""

	if len(parts) >= 1 {
		format = parts[0]
	}
	if len(parts) >= 2 {
		switchID = parts[1]
	}

	var logger *mlag.HeartbeatLogger
	if switchID == s.sw1.ID || switchID == "" {
		logger = s.sw1.HeartbeatLogger
	} else if switchID == s.sw2.ID {
		logger = s.sw2.HeartbeatLogger
	} else {
		http.Error(w, "Switch not found", http.StatusNotFound)
		return
	}

	if logger == nil {
		http.Error(w, "Logger not initialized", http.StatusInternalServerError)
		return
	}

	timestamp := time.Now().Format("20060102-150405")

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=heartbeat-"+timestamp+".csv")

		filename := "/tmp/heartbeat-export.csv"
		if err := logger.ExportCSV(filename); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		http.ServeFile(w, r, filename)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=heartbeat-"+timestamp+".json")

		logs := logger.GetAll()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"switch_id": switchID,
			"exported_at": time.Now(),
			"total_records": len(logs),
			"records": logs,
		})
	}
}

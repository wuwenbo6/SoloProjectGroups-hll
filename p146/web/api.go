package web

import (
	"encoding/json"
	"fmt"
	"modbus-simulator/backend"
	"net/http"
	"strings"
	"time"
)

type APIServer struct {
	simulator *backend.ModbusSimulator
	mux       *http.ServeMux
}

func NewAPIServer(sim *backend.ModbusSimulator) *APIServer {
	server := &APIServer{
		simulator: sim,
		mux:       http.NewServeMux(),
	}
	server.routes()
	return server
}

func (s *APIServer) routes() {
	s.mux.HandleFunc("/", s.handleIndex)
	s.mux.HandleFunc("/api/logs", s.handleLogs)
	s.mux.HandleFunc("/api/logs/clear", s.handleClearLogs)
	s.mux.HandleFunc("/api/slaves", s.handleSlaves)
	s.mux.HandleFunc("/api/traps", s.handleTraps)
	s.mux.HandleFunc("/api/traps/", s.handleTrapByID)
	s.mux.HandleFunc("/static/", s.handleStatic)
}

func (s *APIServer) Start(addr string) error {
	return http.ListenAndServe(addr, s.mux)
}

func (s *APIServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(indexHTML))
}

func (s *APIServer) handleStatic(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/static/")
	if path == "app.js" {
		w.Header().Set("Content-Type", "application/javascript")
		w.Write([]byte(appJS))
		return
	}
	if path == "style.css" {
		w.Header().Set("Content-Type", "text/css")
		w.Write([]byte(styleCSS))
		return
	}
	http.NotFound(w, r)
}

func (s *APIServer) handleLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var logs []backend.ModbusRequest
	var nextLogID uint64

	sinceStr := r.URL.Query().Get("since")
	limitStr := r.URL.Query().Get("limit")

	if sinceStr != "" {
		var sinceLogID uint64
		fmt.Sscanf(sinceStr, "%d", &sinceLogID)

		limit := 0
		if limitStr != "" {
			fmt.Sscanf(limitStr, "%d", &limit)
		}

		logs, nextLogID = s.simulator.GetLogsSince(sinceLogID, limit)
	} else {
		logs = s.simulator.GetLogs()
		_, nextLogID = s.simulator.GetLogStats()
	}

	for i, j := 0, len(logs)-1; i < j; i, j = i+1, j-1 {
		logs[i], logs[j] = logs[j], logs[i]
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"data":        logs,
		"count":       len(logs),
		"next_log_id": nextLogID,
	})
}

func (s *APIServer) handleClearLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	s.simulator.ClearLogs()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Logs cleared",
	})
}

func (s *APIServer) handleSlaves(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	slaves := s.simulator.GetSlaveStatus()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    slaves,
	})
}

func (s *APIServer) handleTraps(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	switch r.Method {
	case http.MethodGet:
		traps := s.simulator.GetTraps()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    traps,
		})

	case http.MethodPost:
		var trap backend.TrapConfig
		if err := json.NewDecoder(r.Body).Decode(&trap); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			})
			return
		}
		trap.ID = "trap-" + time.Now().Format("20060102150405")
		s.simulator.AddTrap(trap)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    trap,
		})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *APIServer) handleTrapByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	id := strings.TrimPrefix(r.URL.Path, "/api/traps/")

	switch r.Method {
	case http.MethodPut:
		var trap backend.TrapConfig
		if err := json.NewDecoder(r.Body).Decode(&trap); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		trap.ID = id
		s.simulator.UpdateTrap(trap)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data":    trap,
		})

	case http.MethodDelete:
		s.simulator.DeleteTrap(id)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
		})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

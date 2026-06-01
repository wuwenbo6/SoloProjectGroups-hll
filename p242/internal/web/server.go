package web

import (
	"alwayson-ag-simulator/internal/ag"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type Server struct {
	agManager  *ag.AvailabilityGroup
	Host       string
	Port       int
	server     *http.Server
	staticPath string
}

func NewServer(agManager *ag.AvailabilityGroup, host string, port int) *Server {
	wd, _ := os.Getwd()
	staticPath := filepath.Join(wd, "web", "static")

	return &Server{
		agManager:  agManager,
		Host:       host,
		Port:       port,
		staticPath: staticPath,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/", s.handleStatic)
	mux.HandleFunc("/style.css", s.handleStatic)
	mux.HandleFunc("/app.js", s.handleStatic)
	mux.HandleFunc("/api/status", s.handleStatusJSON)
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/failover/history", s.handleFailoverHistory)
	mux.HandleFunc("/api/failover/history/export", s.handleExportHistory)
	mux.HandleFunc("/api/sync/suspend", s.handleSyncSuspend)
	mux.HandleFunc("/api/sync/resume", s.handleSyncResume)

	s.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", s.Host, s.Port),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	return s.server.ListenAndServe()
}

func (s *Server) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Path
	if filename == "/" {
		filename = "/index.html"
	}

	filePath := filepath.Join(s.staticPath, filename)
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	switch filepath.Ext(filename) {
	case ".html":
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case ".js":
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	}

	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

func (s *Server) handleStatusJSON(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	status := s.agManager.GetStatus()
	json.NewEncoder(w).Encode(status)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	status := s.agManager.GetStatus()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"health": status.OverallHealth,
	})
}

func (s *Server) handleFailoverHistory(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	history := s.agManager.GetFailoverHistory()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    history,
	})
}

func (s *Server) handleExportHistory(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	history := s.agManager.GetFailoverHistory()

	if format == "json" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=failover_history.json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"export_time": time.Now(),
			"total":       len(history),
			"history":     history,
		})
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=failover_history.csv")

	fmt.Fprintf(w, "ID,Old Primary,New Primary,Timestamp,Reason,Manual\n")
	for _, r := range history {
		fmt.Fprintf(w, "%d,%s,%s,%s,%s,%v\n",
			r.ID, r.OldPrimary, r.NewPrimary,
			r.Timestamp.Format(time.RFC3339), r.Reason, r.Manual)
	}
}

func (s *Server) handleSyncSuspend(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Method not allowed",
		})
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if req.Reason == "" {
		req.Reason = "manual"
	}

	s.agManager.SuspendSync(req.Reason)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Data synchronization suspended",
		"data": map[string]interface{}{
			"suspended": true,
			"reason":    req.Reason,
		},
	})
}

func (s *Server) handleSyncResume(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Method not allowed",
		})
		return
	}

	s.agManager.ResumeSync()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Data synchronization resumed",
		"data": map[string]interface{}{
			"suspended": false,
		},
	})
}

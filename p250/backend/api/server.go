package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"sync"

	"sip-detector/blocker"
	"sip-detector/detector"
	"sip-detector/logger"
	"sip-detector/types"
)

type Server struct {
	detector *detector.Detector
	blocker  *blocker.Blocker
	logger   *logger.AttackLogger
	addr     string
	server   *http.Server
	mu       sync.RWMutex
	clients  map[chan *types.AlertEvent]bool
}

func NewServer(addr string, det *detector.Detector, blk *blocker.Blocker, log *logger.AttackLogger) *Server {
	return &Server{
		detector: det,
		blocker:  blk,
		logger:   log,
		addr:     addr,
		clients:  make(map[chan *types.AlertEvent]bool),
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/alerts", s.handleAlerts)
	mux.HandleFunc("/api/alerts/stream", s.handleAlertStream)
	mux.HandleFunc("/api/config", s.handleConfig)
	mux.HandleFunc("/api/health", s.handleHealth)

	mux.HandleFunc("/api/blocked", s.handleBlocked)
	mux.HandleFunc("/api/block", s.handleBlock)
	mux.HandleFunc("/api/unblock", s.handleUnblock)
	mux.HandleFunc("/api/blocked/count", s.handleBlockedCount)
	mux.HandleFunc("/api/autoblock/toggle", s.handleToggleAutoBlock)

	mux.HandleFunc("/api/logs", s.handleLogs)
	mux.HandleFunc("/api/logs/export/json", s.handleExportJSON)
	mux.HandleFunc("/api/logs/export/csv", s.handleExportCSV)
	mux.HandleFunc("/api/logs/clear", s.handleClearLogs)
	mux.HandleFunc("/api/logs/download/", s.handleDownloadLog)

	mux.HandleFunc("/", s.handleStatic)

	s.server = &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	go s.broadcastAlerts()

	log.Printf("HTTP server starting on %s", s.addr)
	return s.server.ListenAndServe()
}

func (s *Server) broadcastAlerts() {
	for alert := range s.detector.AlertChan() {
		s.mu.RLock()
		for client := range s.clients {
			select {
			case client <- alert:
			default:
			}
		}
		s.mu.RUnlock()
	}
}

func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	stats := s.detector.GetFrequencyStats()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
		"total":   len(stats),
	})
}

func (s *Server) handleAlerts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	alerts := s.detector.GetAlerts(limit)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    alerts,
		"total":   len(alerts),
	})
}

func (s *Server) handleAlertStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	alertChan := make(chan *types.AlertEvent, 10)

	s.mu.Lock()
	s.clients[alertChan] = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, alertChan)
		s.mu.Unlock()
		close(alertChan)
	}()

	notify := w.(http.CloseNotifier).CloseNotify()

	for {
		select {
		case <-notify:
			return
		case alert := <-alertChan:
			data, err := json.Marshal(alert)
			if err != nil {
				continue
			}
			w.Write([]byte("event: alert\n"))
			w.Write([]byte("data: " + string(data) + "\n\n"))
			flusher.Flush()
		}
	}
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"threshold":       10.0,
			"window_seconds":  5,
			"slide_interval":  1,
			"refresh_weight":  0.3,
			"api_version":     "v2",
		},
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  "healthy",
	})
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Write([]byte(`
<!DOCTYPE html>
<html>
<head>
    <title>SIP Attack Detector</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        h1 { color: #333; }
        .info { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .api-list { margin-top: 20px; }
        .api-item { margin: 10px 0; padding: 10px; background: #f9f9f9; border-radius: 4px; }
        .api-item code { background: #eee; padding: 2px 6px; border-radius: 3px; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <h1>SIP Attack Detector API</h1>
    <div class="info">
        <p>Backend service is running. Please access the frontend at <a href="/frontend/index.html">/frontend/index.html</a></p>
        <div class="api-list">
            <h3>Available APIs:</h3>
            <div class="api-item"><code>GET /api/stats</code> - Get frequency statistics</div>
            <div class="api-item"><code>GET /api/alerts?limit=100</code> - Get alert history</div>
            <div class="api-item"><code>GET /api/alerts/stream</code> - SSE real-time alert stream</div>
            <div class="api-item"><code>GET /api/config</code> - Get configuration</div>
            <div class="api-item"><code>GET /api/health</code> - Health check</div>
        </div>
    </div>
</body>
</html>
	`))
}

func (s *Server) handleBlocked(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	blocked := s.blocker.GetBlockedIPs()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    blocked,
		"total":   len(blocked),
	})
}

func (s *Server) handleBlockedCount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	count := s.blocker.GetBlockedCount()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"count":   count,
	})
}

func (s *Server) handleBlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var req struct {
		IP     string `json:"ip"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid request body",
		})
		return
	}

	if req.IP == "" {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "IP address is required",
		})
		return
	}

	blocked, err := s.blocker.BlockIP(req.IP, req.Reason, 0, 0, nil, false)
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	s.logger.AddLog("block", req.IP, "Manual block: "+req.Reason, 0, 0, nil, nil)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    blocked,
	})
}

func (s *Server) handleUnblock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var req struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "Invalid request body",
		})
		return
	}

	if err := s.blocker.UnblockIP(req.IP); err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	s.logger.AddLog("unblock", req.IP, "Manual unblock", 0, 0, nil, nil)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (s *Server) handleToggleAutoBlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var req struct {
		Enabled bool `json:"enabled"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	s.blocker.SetAutoBlock(req.Enabled)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"enabled": req.Enabled,
	})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	limitStr := r.URL.Query().Get("limit")
	logType := r.URL.Query().Get("type")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	logs := s.logger.GetLogs(limit, logType)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    logs,
		"total":   len(logs),
	})
}

func (s *Server) handleExportJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	filePath, err := s.logger.ExportJSON("")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"file_path": filePath,
		"file_name": filepath.Base(filePath),
	})
}

func (s *Server) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	filePath, err := s.logger.ExportCSV("")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"file_path": filePath,
		"file_name": filepath.Base(filePath),
	})
}

func (s *Server) handleClearLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	s.logger.ClearLogs()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (s *Server) handleDownloadLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	filename := filepath.Base(r.URL.Path)
	filePath := filepath.Join(s.logger.GetLogDir(), filename)

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Disposition", "attachment; filename="+filename)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	http.ServeFile(w, r, filePath)
}

func (s *Server) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

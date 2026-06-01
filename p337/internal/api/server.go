package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"bras-simulator/internal/bras"
)

type APIServer struct {
	bras   *bras.BRAS
	mux    *http.ServeMux
	server *http.Server
	port   int
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func NewAPIServer(b *bras.BRAS, port int) *APIServer {
	srv := &APIServer{
		bras: b,
		mux:  http.NewServeMux(),
		port: port,
	}
	srv.setupRoutes()
	return srv
}

func (s *APIServer) setupRoutes() {
	fs := http.FileServer(http.Dir("web"))
	s.mux.Handle("/", fs)

	s.mux.HandleFunc("/api/health", s.handleHealth)
	s.mux.HandleFunc("/api/stats", s.handleStats)
	s.mux.HandleFunc("/api/sessions", s.handleSessions)
	s.mux.HandleFunc("/api/sessions/", s.handleSessionByID)
	s.mux.HandleFunc("/api/connect", s.handleConnect)
	s.mux.HandleFunc("/api/disconnect/", s.handleDisconnect)
	s.mux.HandleFunc("/api/vlans", s.handleVLANs)
	s.mux.HandleFunc("/api/vlan-pools", s.handleVLANPools)
	s.mux.HandleFunc("/api/vlan-free-list", s.handleVLANFreeList)
	s.mux.HandleFunc("/api/vlan-history", s.handleVLANHistory)
	s.mux.HandleFunc("/api/events", s.handleEvents)
	s.mux.HandleFunc("/api/radius/status", s.handleRADIUSStatus)
	s.mux.HandleFunc("/api/radius/stats", s.handleRADIUSStats)
	s.mux.HandleFunc("/api/radius/toggle", s.handleRADIUSToggle)
	s.mux.HandleFunc("/api/session-stats", s.handleSessionStats)
	s.mux.HandleFunc("/api/session-records", s.handleSessionRecords)
	s.mux.HandleFunc("/api/export/csv", s.handleExportCSV)
	s.mux.HandleFunc("/api/export/json", s.handleExportJSON)
}

func (s *APIServer) Start() error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.port),
		Handler:      withCORS(s.mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("API server starting on port %d...", s.port)
	return s.server.ListenAndServe()
}

func (s *APIServer) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (s *APIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"status":    "running",
			"timestamp": time.Now().UTC(),
		},
	})
}

func (s *APIServer) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	stats := s.bras.GetStats()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: stats})
}

func (s *APIServer) handleSessions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		sessions := s.bras.ListSessions()
		writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: sessions})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
	}
}

func (s *APIServer) handleSessionByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	id := r.URL.Path[len("/api/sessions/"):]
	session, err := s.bras.GetSession(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: session})
}

func (s *APIServer) handleConnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	var req bras.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: fmt.Sprintf("Invalid request body: %v", err)})
		return
	}

	if req.Username == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: "Username and password are required"})
		return
	}

	result := s.bras.Connect(&req)
	if result.Success {
		writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
	} else {
		writeJSON(w, http.StatusUnauthorized, APIResponse{Success: false, Error: result.Message, Data: result})
	}
}

func (s *APIServer) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	id := r.URL.Path[len("/api/disconnect/"):]
	if id == "" {
		writeJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: "Session ID is required"})
		return
	}

	if err := s.bras.Disconnect(id); err != nil {
		writeJSON(w, http.StatusNotFound, APIResponse{Success: false, Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{
		Success: true,
		Data: map[string]string{
			"message": fmt.Sprintf("Session %s disconnected", id),
		},
	})
}

func (s *APIServer) handleVLANs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	allocations := s.bras.ListVLANAllocations()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: allocations})
}

func (s *APIServer) handleVLANPools(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	pools := s.bras.ListVLANPools()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: pools})
}

func (s *APIServer) handleVLANFreeList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	poolName := r.URL.Query().Get("pool")
	pools := []string{"residential", "business", "management", "guest"}
	result := make(map[string]interface{})

	if poolName != "" {
		freeList := s.bras.GetVLANFreeList(poolName)
		total, used, available, _ := s.bras.GetVLANPoolStats(poolName)
		result[poolName] = map[string]interface{}{
			"free_list":  freeList,
			"free_count": len(freeList),
			"total":      total,
			"used":       used,
			"available":  available,
		}
	} else {
		for _, p := range pools {
			freeList := s.bras.GetVLANFreeList(p)
			total, used, available, _ := s.bras.GetVLANPoolStats(p)
			result[p] = map[string]interface{}{
				"free_list":  freeList,
				"free_count": len(freeList),
				"total":      total,
				"used":       used,
				"available":  available,
			}
		}
	}

	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: result})
}

func (s *APIServer) handleVLANHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	history := s.bras.ListVLANHistory()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: history})
}

func (s *APIServer) handleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	events := s.bras.ListEvents()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: events})
}

func (s *APIServer) handleRADIUSStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]interface{}{
		"enabled":        s.bras.IsRADIUSEnabled(),
		"server_running": s.bras.GetRADIUSServerStats() != nil,
		"client_config":  s.bras.GetRADIUSClientConfig(),
	}})
}

func (s *APIServer) handleRADIUSStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	serverStats := s.bras.GetRADIUSServerStats()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: serverStats})
}

func (s *APIServer) handleRADIUSToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, APIResponse{Success: false, Error: "Invalid request body"})
		return
	}

	s.bras.SetRADIUSEnabled(body.Enabled)
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: map[string]interface{}{
		"enabled": body.Enabled,
	}})
}

func (s *APIServer) handleSessionStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	stats := s.bras.GetDurationStats()
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: stats})
}

func (s *APIServer) handleSessionRecords(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	limit := 100
	offset := 0
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	records := s.bras.GetSessionRecords(limit, offset)
	writeJSON(w, http.StatusOK, APIResponse{Success: true, Data: records})
}

func (s *APIServer) handleExportCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=bras_sessions_"+time.Now().Format("20060102_150405")+".csv")

	if err := s.bras.ExportSessionCSV(w); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *APIServer) handleExportJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, APIResponse{Success: false, Error: "Method not allowed"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=bras_sessions_"+time.Now().Format("20060102_150405")+".json")

	if err := s.bras.ExportSessionJSON(w); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func ParsePort(portStr string) int {
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 || port > 65535 {
		return 8080
	}
	return port
}

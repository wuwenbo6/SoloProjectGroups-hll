package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/lisp-mapserver/internal/lisp"
	"github.com/lisp-mapserver/internal/mapserver"
)

type APIServer struct {
	addr       string
	mapServer  *mapserver.MapServer
	httpServer *http.Server
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type StatsResponse struct {
	TotalRequests  uint64 `json:"total_requests"`
	TotalReplies   uint64 `json:"total_replies"`
	TotalRegisters uint64 `json:"total_registers"`
	CacheHits      uint64 `json:"cache_hits"`
	CacheMisses    uint64 `json:"cache_misses"`
	HitRate        string `json:"hit_rate"`
	Uptime         string `json:"uptime"`
	StartTime      string `json:"start_time"`
}

type AddMappingRequest struct {
	EID       string            `json:"eid"`
	MaskLen   uint8             `json:"mask_len"`
	TTL       uint32            `json:"ttl"`
	RLOCs     []AddRLOCRequest  `json:"rlocs"`
}

type AddRLOCRequest struct {
	IP       string `json:"ip"`
	Priority uint8  `json:"priority"`
	Weight   uint8  `json:"weight"`
}

func NewAPIServer(addr string, ms *mapserver.MapServer) *APIServer {
	return &APIServer{
		addr:      addr,
		mapServer: ms,
	}
}

func (s *APIServer) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/mappings", s.handleMappings)
	mux.HandleFunc("/api/mappings/add", s.handleAddMapping)
	mux.HandleFunc("/api/mappings/delete", s.handleDeleteMapping)
	mux.HandleFunc("/api/mappings/register", s.handleMapRegister)
	mux.HandleFunc("/api/stats", s.handleStats)
	mux.HandleFunc("/api/stats/export", s.handleStatsExport)
	mux.HandleFunc("/api/query", s.handleQuery)
	mux.HandleFunc("/api/rloc/select", s.handleRLOCSelect)

	mux.Handle("/", http.FileServer(http.Dir("./web")))

	s.httpServer = &http.Server{
		Addr:         s.addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	log.Printf("HTTP API server listening on %s", s.addr)

	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	return nil
}

func (s *APIServer) Stop() error {
	if s.httpServer != nil {
		return s.httpServer.Close()
	}
	return nil
}

func (s *APIServer) handleMappings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	mappings := s.mapServer.GetAllMappings()
	writeSuccess(w, mappings)
}

func (s *APIServer) handleAddMapping(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req AddMappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.EID == "" {
		writeError(w, http.StatusBadRequest, "EID is required")
		return
	}

	eidIP := net.ParseIP(req.EID)
	if eidIP == nil {
		writeError(w, http.StatusBadRequest, "invalid EID IP address")
		return
	}

	if req.MaskLen == 0 || req.MaskLen > 32 {
		req.MaskLen = 32
	}

	if len(req.RLOCs) == 0 {
		writeError(w, http.StatusBadRequest, "at least one RLOC is required")
		return
	}

	rlocs := make([]lisp.RLOC, 0, len(req.RLOCs))
	for _, r := range req.RLOCs {
		rlocIP := net.ParseIP(r.IP)
		if rlocIP == nil {
			writeError(w, http.StatusBadRequest, "invalid RLOC IP address: "+r.IP)
			return
		}
		if r.Priority == 0 {
			r.Priority = 1
		}
		if r.Weight == 0 {
			r.Weight = 100
		}
		rlocs = append(rlocs, lisp.NewRLOC(rlocIP, r.Priority, r.Weight))
	}

	if req.TTL == 0 {
		req.TTL = 1440
	}

	err := s.mapServer.AddMapping(eidIP, req.MaskLen, rlocs, req.TTL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	log.Printf("Added mapping: %s/%d -> %d RLOCs", req.EID, req.MaskLen, len(rlocs))
	writeSuccess(w, map[string]string{"message": "mapping added successfully"})
}

func (s *APIServer) handleDeleteMapping(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		EID     string `json:"eid"`
		MaskLen uint8  `json:"mask_len"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	eidIP := net.ParseIP(req.EID)
	if eidIP == nil {
		writeError(w, http.StatusBadRequest, "invalid EID IP address")
		return
	}

	if req.MaskLen == 0 {
		req.MaskLen = 32
	}

	deleted := s.mapServer.DeleteMapping(eidIP, req.MaskLen)
	if !deleted {
		writeError(w, http.StatusNotFound, "mapping not found")
		return
	}

	log.Printf("Deleted mapping: %s/%d", req.EID, req.MaskLen)
	writeSuccess(w, map[string]string{"message": "mapping deleted successfully"})
}

func (s *APIServer) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stats := s.mapServer.GetStats()

	hitRate := "0.00%"
	if stats.TotalRequests > 0 {
		rate := float64(stats.CacheHits) / float64(stats.TotalRequests) * 100
		hitRate = strconv.FormatFloat(rate, 'f', 2, 64) + "%"
	}

	response := StatsResponse{
		TotalRequests:  stats.TotalRequests,
		TotalReplies:   stats.TotalReplies,
		TotalRegisters: stats.TotalRegisters,
		CacheHits:      stats.CacheHits,
		CacheMisses:    stats.CacheMisses,
		HitRate:        hitRate,
		Uptime:         stats.Uptime.String(),
		StartTime:      stats.StartTime.Format(time.RFC3339),
	}

	writeSuccess(w, response)
}

func (s *APIServer) handleQuery(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	eidStr := r.URL.Query().Get("eid")
	if eidStr == "" {
		writeError(w, http.StatusBadRequest, "EID parameter is required")
		return
	}

	eidIP := net.ParseIP(eidStr)
	if eidIP == nil {
		writeError(w, http.StatusBadRequest, "invalid EID IP address")
		return
	}

	entry, found := s.mapServer.Lookup(eidIP)
	if !found {
		writeError(w, http.StatusNotFound, "no mapping found for EID")
		return
	}

	rlocInfos := make([]mapserver.RLOCInfo, 0, len(entry.RLOCs))
	for _, rloc := range entry.RLOCs {
		rlocInfos = append(rlocInfos, mapserver.RLOCInfo{
			IP:       rloc.IP.String(),
			Priority: rloc.Priority,
			Weight:   rloc.Weight,
		})
	}

	selectedRLOC, _ := s.mapServer.SelectRLOC(eidIP)

	result := mapserver.MappingInfo{
		EID:          entry.EID.String(),
		EIDMaskLen:   entry.EIDMaskLen,
		RLOCs:        rlocInfos,
		SelectedRLOC: selectedRLOC,
		TTL:          entry.TTL,
		QueryCount:   entry.QueryCount,
	}

	writeSuccess(w, result)
}

func (s *APIServer) handleRLOCSelect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	eidStr := r.URL.Query().Get("eid")
	if eidStr == "" {
		writeError(w, http.StatusBadRequest, "EID parameter is required")
		return
	}

	eidIP := net.ParseIP(eidStr)
	if eidIP == nil {
		writeError(w, http.StatusBadRequest, "invalid EID IP address")
		return
	}

	selectedRLOC, found := s.mapServer.SelectRLOC(eidIP)
	if !found {
		writeError(w, http.StatusNotFound, "no mapping found for EID")
		return
	}

	if selectedRLOC == nil {
		writeError(w, http.StatusNotFound, "no RLOC available for EID")
		return
	}

	writeSuccess(w, selectedRLOC)
}

func (s *APIServer) handleMapRegister(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req AddMappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.EID == "" {
		writeError(w, http.StatusBadRequest, "EID is required")
		return
	}

	eidIP := net.ParseIP(req.EID)
	if eidIP == nil {
		writeError(w, http.StatusBadRequest, "invalid EID IP address")
		return
	}

	if req.MaskLen == 0 || req.MaskLen > 32 {
		req.MaskLen = 32
	}

	if len(req.RLOCs) == 0 {
		writeError(w, http.StatusBadRequest, "at least one RLOC is required")
		return
	}

	rlocs := make([]lisp.RLOC, 0, len(req.RLOCs))
	for _, r := range req.RLOCs {
		rlocIP := net.ParseIP(r.IP)
		if rlocIP == nil {
			writeError(w, http.StatusBadRequest, "invalid RLOC IP address: "+r.IP)
			return
		}
		if r.Priority == 0 {
			r.Priority = 1
		}
		if r.Weight == 0 {
			r.Weight = 100
		}
		rlocs = append(rlocs, lisp.NewRLOC(rlocIP, r.Priority, r.Weight))
	}

	if req.TTL == 0 {
		req.TTL = 1440
	}

	lispReg := lisp.NewMapRegister(eidIP, req.MaskLen, rlocs, true)

	notify, err := s.mapServer.HandleMapRegister(lispReg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	log.Printf("EID %s/%d registered via API Map-Register", req.EID, req.MaskLen)

	notifyInfo := map[string]interface{}{
		"message":       "EID registered successfully via Map-Register",
		"nonce":         fmt.Sprintf("0x%x", notify.Nonce),
		"record_count":  notify.RecordCount,
		"registered_eid": req.EID,
		"mask_len":      req.MaskLen,
		"rloc_count":    len(rlocs),
	}

	writeSuccess(w, notifyInfo)
}

func (s *APIServer) handleStatsExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	export := s.mapServer.ExportStats()

	format := r.URL.Query().Get("format")
	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=lisp_mapping_stats.csv")

		fmt.Fprintf(w, "EID,MaskLen,Source,RegisteredBy,TTL,RLOCCount,QueryCount,CreatedAt,LastQueried\n")
		for _, m := range export.Mappings {
			fmt.Fprintf(w, "%s,%d,%s,%s,%d,%d,%d,%s,%s\n",
				m.EID, m.EIDMaskLen, m.Source, m.RegisteredBy, m.TTL, m.RLOCCount, m.QueryCount, m.CreatedAt, m.LastQueried)
		}
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=lisp_mapping_stats.json")
		json.NewEncoder(w).Encode(export)
	}
}

func writeSuccess(w http.ResponseWriter, data interface{}) {
	resp := APIResponse{
		Success: true,
		Data:    data,
	}
	json.NewEncoder(w).Encode(resp)
}

func writeError(w http.ResponseWriter, code int, message string) {
	w.WriteHeader(code)
	resp := APIResponse{
		Success: false,
		Error:   message,
	}
	json.NewEncoder(w).Encode(resp)
}

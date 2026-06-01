package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type API struct {
	store    *SessionStore
	client   *CoAClient
	secret   string
	notifier *NASNotifier
	logger   *AuthChangeLogger

	eventsMu sync.RWMutex
	events   []SessionUpdateEvent
}

func NewAPI(store *SessionStore, client *CoAClient, secret string, notifier *NASNotifier, logger *AuthChangeLogger) *API {
	api := &API{
		store:    store,
		client:   client,
		secret:   secret,
		notifier: notifier,
		logger:   logger,
		events:   make([]SessionUpdateEvent, 0),
	}

	if notifier != nil {
		notifier.OnSessionUpdate(func(event SessionUpdateEvent) {
			api.eventsMu.Lock()
			api.events = append(api.events, event)
			if len(api.events) > 100 {
				api.events = api.events[len(api.events)-100:]
			}
			api.eventsMu.Unlock()
			log.Printf("[Internal] Session update pushed: session=%s user=%s updates=%v", event.SessionID, event.UserName, event.Updates)
		})
	}

	return api
}

func (a *API) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/sessions", a.handleSessions)
	mux.HandleFunc("/api/sessions/", a.handleSessionAction)
	mux.HandleFunc("/api/coa", a.handleCoA)
	mux.HandleFunc("/api/disconnect", a.handleDisconnect)
	mux.HandleFunc("/api/simulate-auth", a.handleSimulateAuth)
	mux.HandleFunc("/api/internal/session-update", a.handleInternalSessionUpdate)
	mux.HandleFunc("/api/events", a.handleEvents)
	mux.HandleFunc("/api/auth-log", a.handleAuthLog)
	mux.HandleFunc("/api/auth-log/export", a.handleAuthLogExport)
	mux.HandleFunc("/api/auth-log/stats", a.handleAuthLogStats)
}

func (a *API) handleSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	sessions := a.store.List()
	json.NewEncoder(w).Encode(sessions)
}

func (a *API) handleSessionAction(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := r.URL.Path
	sessionID := ""
	if len(path) > len("/api/sessions/") {
		sessionID = path[len("/api/sessions/"):]
	}

	if sessionID == "" {
		http.Error(w, `{"error":"session_id required"}`, http.StatusBadRequest)
		return
	}

	session, found := a.store.Get(sessionID)
	if !found {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(session)
}

type CoARequest struct {
	SessionID      string `json:"session_id"`
	Username       string `json:"username"`
	TargetAddr     string `json:"target_addr"`
	BandwidthUp    uint32 `json:"bandwidth_up"`
	BandwidthDown  uint32 `json:"bandwidth_down"`
	SessionTimeout uint32 `json:"session_timeout"`
	FilterID       string `json:"filter_id"`
	Vendor         string `json:"vendor"`
	UseVendorAVP   bool   `json:"use_vendor_avp"`
}

func (a *API) handleCoA(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req CoARequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	if req.SessionID == "" {
		http.Error(w, `{"error":"session_id required"}`, http.StatusBadRequest)
		return
	}

	targetAddr := req.TargetAddr
	if targetAddr == "" {
		targetAddr = "127.0.0.1:3799"
	}

	result := a.client.SendCoARequest(
		targetAddr,
		req.SessionID,
		req.Username,
		req.BandwidthUp,
		req.BandwidthDown,
		req.SessionTimeout,
		req.FilterID,
		req.Vendor,
		req.UseVendorAVP,
	)

	log.Printf("CoA API result: %+v", result)
	json.NewEncoder(w).Encode(result)
}

type DisconnectRequest struct {
	SessionID  string `json:"session_id"`
	Username   string `json:"username"`
	TargetAddr string `json:"target_addr"`
}

func (a *API) handleDisconnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req DisconnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	if req.SessionID == "" {
		http.Error(w, `{"error":"session_id required"}`, http.StatusBadRequest)
		return
	}

	targetAddr := req.TargetAddr
	if targetAddr == "" {
		targetAddr = "127.0.0.1:3799"
	}

	result := a.client.SendDisconnectRequest(targetAddr, req.SessionID, req.Username)

	log.Printf("Disconnect API result: %+v", result)
	json.NewEncoder(w).Encode(result)
}

type SimulateAuthRequest struct {
	Username string `json:"username"`
	NASPort  uint32 `json:"nas_port"`
}

func (a *API) handleSimulateAuth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req SimulateAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %v"}`, err), http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		req.Username = "testuser"
	}
	if req.NASPort == 0 {
		req.NASPort = uint32(time.Now().UnixNano() % 65536)
	}

	sessionID := GenerateSessionID()
	session := &Session{
		SessionID:      sessionID,
		UserName:       req.Username,
		NASIP:          "127.0.0.1",
		NASPort:        req.NASPort,
		FramedIP:       "10.0.0." + strconv.Itoa(int(req.NASPort%254+1)),
		BandwidthUp:    1024,
		BandwidthDown:  2048,
		SessionTimeout: 3600,
		FilterID:       "default",
		StartTime:      time.Now(),
		Status:         StatusActive,
	}

	a.store.Add(session)

	log.Printf("Simulated auth: user=%s session=%s", req.Username, sessionID)
	json.NewEncoder(w).Encode(session)
}

func (a *API) handleInternalSessionUpdate(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var event SessionUpdateEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid event: %v"}`, err), http.StatusBadRequest)
		return
	}

	log.Printf("[Internal] Received session update from NAS: session=%s user=%s event=%s updates=%v", event.SessionID, event.UserName, event.Event, event.Updates)

	a.eventsMu.Lock()
	a.events = append(a.events, event)
	if len(a.events) > 100 {
		a.events = a.events[len(a.events)-100:]
	}
	a.eventsMu.Unlock()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (a *API) handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	a.eventsMu.RLock()
	events := make([]SessionUpdateEvent, len(a.events))
	copy(events, a.events)
	a.eventsMu.RUnlock()

	json.NewEncoder(w).Encode(events)
}

func (a *API) handleAuthLog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if a.logger == nil {
		json.NewEncoder(w).Encode([]AuthChangeLogEntry{})
		return
	}

	q := r.URL.Query()
	sessionID := q.Get("session_id")
	username := q.Get("username")
	eventType := q.Get("event_type")
	vendor := q.Get("vendor")

	entries := a.logger.Filter(sessionID, username, eventType, vendor, time.Time{}, time.Time{})
	json.NewEncoder(w).Encode(entries)
}

func (a *API) handleAuthLogExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if a.logger == nil {
		http.Error(w, `{"error":"logger not available"}`, http.StatusInternalServerError)
		return
	}

	q := r.URL.Query()
	sessionID := q.Get("session_id")
	username := q.Get("username")
	eventType := q.Get("event_type")
	vendor := q.Get("vendor")
	format := q.Get("format")
	if format == "" {
		format = "json"
	}

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="auth-changelog.csv"`)
		csvData, err := a.logger.ExportCSV(sessionID, username, eventType, vendor, time.Time{}, time.Time{})
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
			return
		}
		w.Write(csvData)
	} else {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", `attachment; filename="auth-changelog.json"`)
		jsonData, err := a.logger.ExportJSON(sessionID, username, eventType, vendor, time.Time{}, time.Time{})
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%v"}`, err), http.StatusInternalServerError)
			return
		}
		w.Write(jsonData)
	}
}

func (a *API) handleAuthLogStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if a.logger == nil {
		json.NewEncoder(w).Encode(map[string]int{"total": 0})
		return
	}

	json.NewEncoder(w).Encode(a.logger.Stats())
}

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"smb2-lease-server/internal/lease"
	"smb2-lease-server/internal/smb2"
	"strconv"
	"strings"
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

type APIHandler struct {
	smb2Server   *smb2.SMB2Server
	leaseManager   *lease.LeaseManager
	clients      map[*websocket.Conn]bool
	clientsMutex sync.RWMutex
}

type LeaseInfo struct {
	ID           string            `json:"id"`
	ClientID     string            `json:"clientId"`
	ClientName   string            `json:"clientName"`
	FileName     string            `json:"fileName"`
	Type         lease.LeaseType    `json:"type"`
	OriginalType lease.LeaseType    `json:"originalType"`
	State        lease.LeaseState   `json:"state"`
	GrantedAt    string            `json:"grantedAt"`
	ExpiresAt    string            `json:"expiresAt"`
	Downgraded   bool              `json:"downgraded"`
	RetryCount   int               `json:"retryCount"`
}

type FileInfo struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type ClientInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Connected bool   `json:"connected"`
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

func NewAPIHandler(smb2Server *smb2.SMB2Server, leaseManager *lease.LeaseManager) *APIHandler {
	handler := &APIHandler{
		smb2Server: smb2Server,
		leaseManager: leaseManager,
		clients:      make(map[*websocket.Conn]bool),
	}
	go handler.broadcastLeaseEvents()
	return handler
}

func (h *APIHandler) broadcastLeaseEvents() {
	eventChan := h.leaseManager.Subscribe()
	defer h.leaseManager.Unsubscribe(eventChan)
	for event := range eventChan {
		h.broadcastEvent(event)
	}
}

func (h *APIHandler) broadcastEvent(event lease.LeaseEvent) {
	h.clientsMutex.RLock()
	defer h.clientsMutex.RUnlock()

	message := WSMessage{
		Type:    "lease_event",
		Payload: event,
	}

	messageJSON, _ := json.Marshal(message)

	for conn := range h.clients {
		err := conn.WriteMessage(websocket.TextMessage, messageJSON)
		if err != nil {
			conn.Close()
			delete(h.clients, conn)
		}
	}
}

func (h *APIHandler) broadcastFullState() {
	leases := h.leaseManager.GetAllLeases()
	leaseInfos := make([]LeaseInfo, 0, len(leases))
	for _, l := range leases {
		leaseInfos = append(leaseInfos, h.leaseToInfo(l))
	}

	message := WSMessage{
		Type:    "full_state",
		Payload: map[string]interface{}{
			"leases":  leaseInfos,
			"clients": h.getClientsInfo(),
			"files":   h.getFilesInfo(),
		},
	}

	messageJSON, _ := json.Marshal(message)

	h.clientsMutex.RLock()
	defer h.clientsMutex.RUnlock()

	for conn := range h.clients {
		err := conn.WriteMessage(websocket.TextMessage, messageJSON)
		if err != nil {
			conn.Close()
			delete(h.clients, conn)
		}
	}
}

func (h *APIHandler) leaseToInfo(l *lease.Lease) LeaseInfo {
	clientName := l.ClientID
	for _, c := range h.smb2Server.GetClients() {
		if c.ID == l.ClientID {
			clientName = c.Name
			break
		}
	}
	expiresAt := ""
	if !l.ExpiresAt.IsZero() {
		expiresAt = l.ExpiresAt.Format("15:04:05")
	}
	return LeaseInfo{
		ID:           l.ID,
		ClientID:     l.ClientID,
		ClientName:   clientName,
		FileName:     l.FileName,
		Type:         l.Type,
		OriginalType: l.OriginalType,
		State:        l.State,
		GrantedAt:    l.GrantedAt.Format("15:04:05"),
		ExpiresAt:    expiresAt,
		Downgraded:   l.Downgraded,
		RetryCount:   l.BreakRetryCount,
	}
}

func (h *APIHandler) getClientsInfo() []ClientInfo {
	clients := h.smb2Server.GetClients()
	result := make([]ClientInfo, 0, len(clients))
	for _, c := range clients {
		result = append(result, ClientInfo{
			ID:       c.ID,
			Name:     c.Name,
			Connected: c.Connected,
		})
	}
	return result
}

func (h *APIHandler) getFilesInfo() []FileInfo {
	files := h.smb2Server.GetFiles()
	result := make([]FileInfo, 0, len(files))
	for _, f := range files {
		result = append(result, FileInfo{
			Name:     f.Name,
			Size:     f.Size,
			Modified: f.Modified.Format("15:04:05"),
		})
	}
	return result
}

func (h *APIHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	h.clientsMutex.Lock()
	h.clients[conn] = true
	h.clientsMutex.Unlock()

	defer func() {
		h.clientsMutex.Lock()
		delete(h.clients, conn)
		h.clientsMutex.Unlock()
		conn.Close()
	}()

	h.broadcastFullState()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (h *APIHandler) HandleGetLeases(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	leases := h.leaseManager.GetAllLeases()
	leaseInfos := make([]LeaseInfo, 0, len(leases))
	for _, l := range leases {
		leaseInfos = append(leaseInfos, h.leaseToInfo(l))
	}
	json.NewEncoder(w).Encode(leaseInfos)
}

func (h *APIHandler) HandleGetClients(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.getClientsInfo())
}

func (h *APIHandler) HandleGetFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.getFilesInfo())
}

func (h *APIHandler) HandleConnectClient(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientID   string `json:"clientId"`
		ClientName string `json:"clientName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err := h.smb2Server.ConnectClient(req.ClientID, req.ClientName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Client %s connected", req.ClientName),
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleDisconnectClient(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientID string `json:"clientId"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	h.smb2Server.DisconnectClient(req.ClientID)

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Client %s disconnected", req.ClientID),
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleOpenFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientID  string `json:"clientId"`
		FileName    string `json:"fileName"`
		LeaseType string `json:"leaseType"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	leaseType := lease.LeaseType(req.LeaseType)
	if leaseType == "" {
		leaseType = lease.LeaseTypeRead
	}

	smb2Req := &smb2.SMB2Request{
		Command:   smb2.SMB2Create,
		ClientID:  req.ClientID,
		FileName:  req.FileName,
		LeaseType: leaseType,
	}

	resp, err := h.smb2Server.ProcessRequest(smb2Req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": resp.Success,
		"message": resp.Message,
		"lease":   h.leaseToInfo(resp.Lease),
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleCloseFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientID string `json:"clientId"`
		FileName string `json:"fileName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	smb2Req := &smb2.SMB2Request{
		Command:  smb2.SMB2Close,
		ClientID: req.ClientID,
		FileName: req.FileName,
	}

	resp, err := h.smb2Server.ProcessRequest(smb2Req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": resp.Success,
		"message": resp.Message,
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleWriteFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientID string `json:"clientId"`
		FileName string `json:"fileName"`
		Data     string `json:"data"`
		Offset   int64  `json:"offset"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	smb2Req := &smb2.SMB2Request{
		Command:  smb2.SMB2Write,
		ClientID: req.ClientID,
		FileName: req.FileName,
		Data:     []byte(req.Data),
		Offset:   req.Offset,
	}

	resp, err := h.smb2Server.ProcessRequest(smb2Req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": resp.Success,
		"message": resp.Message,
		"fileSize": resp.FileSize,
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleReadFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	fileName := r.URL.Query().Get("file")
	if fileName == "" {
		http.Error(w, "file parameter required", http.StatusBadRequest)
		return
	}

	offsetStr := r.URL.Query().Get("offset")
	offset := int64(0)
	if offsetStr != "" {
		if o, err := strconv.ParseInt(offsetStr, 10, 64); err == nil {
			offset = o
		}
	}

	clientID := r.URL.Query().Get("clientId")

	smb2Req := &smb2.SMB2Request{
		Command:  smb2.SMB2Read,
		ClientID: clientID,
		FileName: fileName,
		Offset:   offset,
	}

	resp, err := h.smb2Server.ProcessRequest(smb2Req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  resp.Success,
		"data":    string(resp.Data),
		"fileSize": resp.FileSize,
	})
}

func (h *APIHandler) HandleSimulateClients(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		ClientCount int    `json:"clientCount"`
		FileName    string `json:"fileName"`
		LeaseType  string `json:"leaseType"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	leaseType := lease.LeaseType(req.LeaseType)
	if leaseType == "" {
		leaseType = lease.LeaseTypeBatch
	}

	for i := 0; i < req.ClientCount; i++ {
		clientID := fmt.Sprintf("sim-client-%d", i+1)
		clientName := fmt.Sprintf("Simulated Client %d", i+1)
		h.smb2Server.ConnectClient(clientID, clientName)

		smb2Req := &smb2.SMB2Request{
			Command:   smb2.SMB2Create,
			ClientID:  clientID,
			FileName:  req.FileName,
			LeaseType: leaseType,
		}
		h.smb2Server.ProcessRequest(smb2Req)
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Simulated %d clients opening %s with %s lease", req.ClientCount, req.FileName, leaseType),
	})
	go h.broadcastFullState()
}

func (h *APIHandler) HandleGetChangeLog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	sinceStr := r.URL.Query().Get("since")
	if sinceStr != "" {
		since, err := time.Parse(time.RFC3339, sinceStr)
		if err == nil {
			json.NewEncoder(w).Encode(h.leaseManager.GetChangeLogSince(since))
			return
		}
	}
	
	json.NewEncoder(w).Encode(h.leaseManager.GetChangeLog())
}

func (h *APIHandler) HandleExportChangeLog(w http.ResponseWriter, r *http.Request) {
	log := h.leaseManager.GetChangeLog()
	
	format := r.URL.Query().Get("format")
	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=lease_changelog.csv")
		
		var sb strings.Builder
		sb.WriteString("ID,LeaseID,ClientID,FileName,EventType,OldState,NewState,OldType,NewType,Reason,Timestamp\n")
		for _, entry := range log {
			sb.WriteString(fmt.Sprintf("%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
				entry.ID,
				entry.LeaseID,
				entry.ClientID,
				entry.FileName,
				entry.EventType,
				entry.OldState,
				entry.NewState,
				entry.OldType,
				entry.NewType,
				strings.ReplaceAll(entry.Reason, ",", ";"),
				entry.Timestamp.Format(time.RFC3339),
			))
		}
		w.Write([]byte(sb.String()))
		
	default:
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=lease_changelog.json")
		json.NewEncoder(w).Encode(log)
	}
}

func (h *APIHandler) HandleClearChangeLog(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	h.leaseManager.ClearChangeLog()
	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": "Change log cleared",
	})
}

func (h *APIHandler) HandleSetLeaseTTL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req struct {
		TTLSeconds int `json:"ttlSeconds"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.TTLSeconds < 1 {
		http.Error(w, "TTL must be at least 1 second", http.StatusBadRequest)
		return
	}

	ttl := time.Duration(req.TTLSeconds) * time.Second
	h.leaseManager.SetLeaseTTL(ttl)

	json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Lease TTL set to %d seconds", req.TTLSeconds),
	})
}

func (h *APIHandler) HandleGetLeaseTTL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ttl := h.leaseManager.GetLeaseTTL()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ttlSeconds": int(ttl.Seconds()),
		"ttlHuman":   ttl.String(),
	})
}

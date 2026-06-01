package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"dht-krpc-simulator/dht"
)

type Handler struct {
	Node      *dht.DHTNode
	Simulator *dht.Simulator
}

func NewHandler(node *dht.DHTNode, sim *dht.Simulator) *Handler {
	return &Handler{
		Node:      node,
		Simulator: sim,
	}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/node/status", corsMiddleware(h.handleNodeStatus))
	mux.HandleFunc("/api/node/start", corsMiddleware(h.handleNodeStart))
	mux.HandleFunc("/api/node/stop", corsMiddleware(h.handleNodeStop))
	mux.HandleFunc("/api/query/ping", corsMiddleware(h.handlePing))
	mux.HandleFunc("/api/query/find_node", corsMiddleware(h.handleFindNode))
	mux.HandleFunc("/api/query/get_peers", corsMiddleware(h.handleGetPeers))
	mux.HandleFunc("/api/query/announce_peer", corsMiddleware(h.handleAnnouncePeer))
	mux.HandleFunc("/api/routing-table", corsMiddleware(h.handleRoutingTable))
	mux.HandleFunc("/api/routing-table/export", corsMiddleware(h.handleExportRoutingTable))
	mux.HandleFunc("/api/resources", corsMiddleware(h.handleResources))
	mux.HandleFunc("/api/query/logs", corsMiddleware(h.handleLogs))
	mux.HandleFunc("/api/bootstrap", corsMiddleware(h.handleBootstrap))
	mux.HandleFunc("/api/simulated-nodes", corsMiddleware(h.handleSimulatedNodes))
}

func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func (h *Handler) handleNodeStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status := map[string]interface{}{
		"node_id":        h.Node.ID.String(),
		"address":        h.Node.Addr.String(),
		"known_nodes":    h.Node.Routing.TotalNodes(),
		"uptime_seconds": int(h.Node.Uptime().Seconds()),
		"running":        h.Node.IsRunning(),
	}

	writeJSON(w, status)
}

func (h *Handler) handleNodeStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if h.Node.IsRunning() {
		writeJSON(w, map[string]string{"status": "running"})
		return
	}

	if err := h.Node.Start(); err != nil {
		writeJSON(w, map[string]string{"status": "error", "error": err.Error()})
		return
	}

	writeJSON(w, map[string]string{"status": "running"})
}

func (h *Handler) handleNodeStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	h.Node.Stop()
	writeJSON(w, map[string]string{"status": "stopped"})
}

func (h *Handler) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		TargetAddr string `json:"target_addr"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	if req.TargetAddr == "" {
		writeJSON(w, map[string]string{"error": "target_addr is required"})
		return
	}

	result, err := h.Node.PingWithResult(req.TargetAddr)
	if err != nil {
		qlog := result.Log
		if qlog == nil {
			writeJSON(w, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, map[string]interface{}{
			"transaction_id": qlog.TransactionID,
			"node_id":        "",
			"elapsed_ms":     qlog.ElapsedMs,
			"error":          err.Error(),
		})
		return
	}

	qlog := result.Log
	errMsg := ""
	if qlog.Status != "success" {
		errMsg = qlog.ResultSummary
	}

	writeJSON(w, map[string]interface{}{
		"transaction_id": qlog.TransactionID,
		"node_id":        result.NodeID,
		"elapsed_ms":     qlog.ElapsedMs,
		"error":          errMsg,
	})
}

func (h *Handler) handleFindNode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		TargetID string `json:"target_id"`
		AskAddr  string `json:"ask_addr"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	if req.TargetID == "" || req.AskAddr == "" {
		writeJSON(w, map[string]string{"error": "target_id and ask_addr are required"})
		return
	}

	nodes, queryLog, err := h.Node.FindNodeResult(req.TargetID, req.AskAddr)
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"transaction_id": queryLog.TransactionID,
			"nodes":          []interface{}{},
			"elapsed_ms":     queryLog.ElapsedMs,
			"error":          err.Error(),
		})
		return
	}

	errMsg := ""
	if queryLog.Status != "success" {
		errMsg = queryLog.ResultSummary
	}

	writeJSON(w, map[string]interface{}{
		"transaction_id": queryLog.TransactionID,
		"nodes":          nodes,
		"elapsed_ms":     queryLog.ElapsedMs,
		"error":          errMsg,
	})
}

func (h *Handler) handleGetPeers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		InfoHash string `json:"info_hash"`
		AskAddr  string `json:"ask_addr"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	if req.InfoHash == "" || req.AskAddr == "" {
		writeJSON(w, map[string]string{"error": "info_hash and ask_addr are required"})
		return
	}

	result, queryLog, err := h.Node.GetPeersWithResult(req.InfoHash, req.AskAddr)
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"transaction_id": queryLog.TransactionID,
			"token":          "",
			"has_peers":      false,
			"peers":          []interface{}{},
			"nodes":          []interface{}{},
			"elapsed_ms":     queryLog.ElapsedMs,
			"error":          err.Error(),
		})
		return
	}

	errMsg := ""
	if queryLog.Status != "success" {
		errMsg = queryLog.ResultSummary
	}

	peersJSON := make([]map[string]interface{}, 0)
	if result != nil && result.HasPeers {
		for _, p := range result.Peers {
			peersJSON = append(peersJSON, map[string]interface{}{
				"ip":   fmt.Sprintf("%d.%d.%d.%d", p.IP[0], p.IP[1], p.IP[2], p.IP[3]),
				"port": p.Port,
			})
		}
	}

	nodesJSON := make([]interface{}, 0)
	if result != nil {
		nodesJSON = make([]interface{}, len(result.Nodes))
		for i, n := range result.Nodes {
			nodesJSON[i] = n
		}
	}

	token := ""
	if result != nil {
		token = result.Token
	}
	hasPeers := false
	if result != nil {
		hasPeers = result.HasPeers
	}

	writeJSON(w, map[string]interface{}{
		"transaction_id": queryLog.TransactionID,
		"token":          token,
		"has_peers":      hasPeers,
		"peers":          peersJSON,
		"nodes":          nodesJSON,
		"elapsed_ms":     queryLog.ElapsedMs,
		"error":          errMsg,
	})
}

func (h *Handler) handleAnnouncePeer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		InfoHash string `json:"info_hash"`
		AskAddr  string `json:"ask_addr"`
		Port     int    `json:"port"`
		Token    string `json:"token"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, map[string]string{"error": err.Error()})
		return
	}

	if req.InfoHash == "" || req.AskAddr == "" || req.Token == "" {
		writeJSON(w, map[string]string{"error": "info_hash, ask_addr, and token are required"})
		return
	}

	if req.Port <= 0 {
		req.Port = 6881
	}

	result, queryLog, err := h.Node.AnnouncePeerWithResult(req.InfoHash, req.AskAddr, req.Port, req.Token)
	if err != nil {
		writeJSON(w, map[string]interface{}{
			"transaction_id": queryLog.TransactionID,
			"success":        false,
			"elapsed_ms":     queryLog.ElapsedMs,
			"error":          err.Error(),
		})
		return
	}

	errMsg := ""
	if queryLog.Status != "success" {
		errMsg = queryLog.ResultSummary
	}

	success := false
	message := ""
	if result != nil {
		success = result.Success
		message = result.Message
	}

	writeJSON(w, map[string]interface{}{
		"transaction_id": queryLog.TransactionID,
		"success":        success,
		"message":        message,
		"elapsed_ms":     queryLog.ElapsedMs,
		"error":          errMsg,
	})
}

func (h *Handler) handleExportRoutingTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	export := h.Node.Routing.ExportRoutingTable()

	accept := r.Header.Get("Accept")
	if accept == "text/plain" || accept == "text/csv" || r.URL.Query().Get("format") == "text" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("Content-Disposition", "attachment; filename=routing-table.txt")

		fmt.Fprintf(w, "=== DHT Routing Table Export ===\n")
		fmt.Fprintf(w, "Generated At: %s\n", export.GeneratedAt)
		fmt.Fprintf(w, "Self Node ID: %s\n", export.SelfID)
		fmt.Fprintf(w, "Total Known Nodes: %d\n", export.TotalNodes)
		fmt.Fprintf(w, "Total Peers: %d\n", export.TotalPeers)
		fmt.Fprintf(w, "Total Resources: %d\n", export.Resources)
		fmt.Fprintf(w, "\n")

		fmt.Fprintf(w, "=== K-Buckets ===\n")
		for _, b := range export.Buckets {
			fmt.Fprintf(w, "\nBucket #%d (capacity: %d, nodes: %d)\n", b.BucketIndex, b.Capacity, b.NodeCount)
			fmt.Fprintf(w, "  %s\n", b.PrefixRange)
			fmt.Fprintf(w, "  Nodes:\n")
			for _, n := range b.Nodes {
				fmt.Fprintf(w, "    - %s\n", n.NodeID)
				fmt.Fprintf(w, "      Address: %s\n", n.Address)
				fmt.Fprintf(w, "      Last Seen: %s\n", n.LastSeen)
				fmt.Fprintf(w, "      Uptime: %s\n", n.Uptime)
			}
		}

		if len(export.Peers) > 0 {
			fmt.Fprintf(w, "\n=== Announced Peers ===\n")
			for _, p := range export.Peers {
				fmt.Fprintf(w, "\nInfo Hash: %s\n", p.InfoHash)
				fmt.Fprintf(w, "  Peer: %s\n", p.PeerAddr)
				fmt.Fprintf(w, "  Announced At: %s\n", p.AddedAt)
			}
		}
		return
	}

	writeJSON(w, export)
}

func (h *Handler) handleResources(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	resources := h.Node.Routing.ExportResources()
	writeJSON(w, resources)
}

func (h *Handler) handleRoutingTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	buckets := h.Node.Routing.ToJSON()
	writeJSON(w, map[string]interface{}{
		"buckets": buckets,
	})
}

func (h *Handler) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	logs := h.Node.GetLogs()
	writeJSON(w, map[string]interface{}{
		"logs": logs,
	})
}

func (h *Handler) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Count int `json:"count"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		req.Count = 5
	}

	if req.Count <= 0 {
		req.Count = 5
	}
	if req.Count > 50 {
		req.Count = 50
	}

	added := h.Simulator.SpawnNodes(req.Count, h.Node)
	writeJSON(w, map[string]interface{}{
		"added": added,
	})
}

func (h *Handler) handleSimulatedNodes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	nodes := h.Simulator.GetAllNodes()
	writeJSON(w, map[string]interface{}{
		"nodes": nodes,
	})
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	json.NewEncoder(w).Encode(data)
}

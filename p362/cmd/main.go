package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/netip"
	"strconv"
	"sync"
	"time"

	"ripng-simulator/ripng"

	"github.com/gorilla/websocket"
)

var (
	network   *ripng.Network
	upgrader  = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
	autoRun   bool
	autoStop  chan struct{}
)

func main() {
	network = ripng.NewNetwork()

	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/snapshot", handleSnapshot)
	http.HandleFunc("/api/step", handleStep)
	http.HandleFunc("/api/run", handleRun)
	http.HandleFunc("/api/stop", handleStop)
	http.HandleFunc("/api/reset", handleReset)
	http.HandleFunc("/api/preset", handlePreset)
	http.HandleFunc("/api/toggle-link", handleToggleLink)
	http.HandleFunc("/api/add-router", handleAddRouter)
	http.HandleFunc("/api/add-link", handleAddLink)
	http.HandleFunc("/api/add-static-route", handleAddStaticRoute)
	http.HandleFunc("/api/send-request", handleSendRequest)
	http.HandleFunc("/api/set-split-horizon", handleSetSplitHorizon)
	http.HandleFunc("/api/add-aggregate-route", handleAddAggregateRoute)
	http.HandleFunc("/api/remove-aggregate-route", handleRemoveAggregateRoute)
	http.HandleFunc("/api/auto-aggregate", handleAutoAggregate)
	http.HandleFunc("/api/capture/packets", handleCapturePackets)
	http.HandleFunc("/api/capture/clear", handleCaptureClear)
	http.HandleFunc("/api/capture/toggle", handleCaptureToggle)
	http.HandleFunc("/api/capture/export/json", handleCaptureExportJSON)
	http.HandleFunc("/api/capture/export/pcap", handleCaptureExportPCAP)
	http.HandleFunc("/ws", handleWebSocket)

	go subscribeToNetwork()

	log.Println("RIPng Simulator starting on http://localhost:8090")
	log.Fatal(http.ListenAndServe(":8090", nil))
}

func subscribeToNetwork() {
	ch := network.Subscribe()
	for msg := range ch {
		clientsMu.Lock()
		for client := range clients {
			err := client.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				client.Close()
				delete(clients, client)
			}
		}
		clientsMu.Unlock()
	}
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()

	snapshot := network.GetSnapshot()
	data, _ := json.Marshal(map[string]interface{}{
		"type": "init",
		"data": snapshot,
	})
	conn.WriteMessage(websocket.TextMessage, data)

	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func handleSnapshot(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(network.GetSnapshot())
}

func handleStep(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	stepsStr := r.URL.Query().Get("count")
	steps := 1
	if stepsStr != "" {
		if n, err := strconv.Atoi(stepsStr); err == nil && n > 0 {
			steps = n
		}
	}

	network.RunMultipleSteps(steps)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"step":   network.StepCount,
	})
}

func handleRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if autoRun {
		json.NewEncoder(w).Encode(map[string]string{"status": "already_running"})
		return
	}

	autoRun = true
	autoStop = make(chan struct{})

	speedStr := r.URL.Query().Get("speed")
	speed := 1000
	if speedStr != "" {
		if s, err := strconv.Atoi(speedStr); err == nil && s > 0 {
			speed = s
		}
	}

	go func() {
		ticker := time.NewTicker(time.Duration(speed) * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				network.Step()
			case <-autoStop:
				autoRun = false
				return
			}
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "running"})
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if autoRun && autoStop != nil {
		close(autoStop)
		autoRun = false
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "stopped"})
}

func handleReset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if autoRun && autoStop != nil {
		close(autoStop)
		autoRun = false
	}

	network.Reset()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "reset"})
}

func handlePreset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "Missing preset name", http.StatusBadRequest)
		return
	}

	if autoRun && autoStop != nil {
		close(autoStop)
		autoRun = false
	}

	network.LoadPreset(name)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "loaded", "preset": name})
}

func handleToggleLink(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	linkName := r.URL.Query().Get("link")
	if linkName == "" {
		http.Error(w, "Missing link name", http.StatusBadRequest)
		return
	}

	network.ToggleLink(linkName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "link": linkName})
}

func handleAddRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "Missing router id", http.StatusBadRequest)
		return
	}

	shStr := r.URL.Query().Get("split_horizon")
	sh := ripng.SplitHorizonPoisonReverse
	if shStr != "" {
		switch shStr {
		case "none":
			sh = ripng.SplitHorizonNone
		case "simple":
			sh = ripng.SplitHorizonSimple
		case "poison":
			sh = ripng.SplitHorizonPoisonReverse
		}
	}

	network.AddRouter(id, sh)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "router": id})
}

func handleAddLink(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name    string   `json:"name"`
		Routers []string `json:"routers"`
		Cost    int      `json:"cost"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Cost <= 0 {
		req.Cost = 1
	}

	err := network.AddLink(req.Name, req.Routers, req.Cost)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "link": req.Name})
}

func handleAddStaticRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routerID := r.URL.Query().Get("router")
	prefixStr := r.URL.Query().Get("prefix")

	if routerID == "" || prefixStr == "" {
		http.Error(w, "Missing router or prefix", http.StatusBadRequest)
		return
	}

	prefix, err := netip.ParsePrefix(prefixStr)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid prefix: %v", err), http.StatusBadRequest)
		return
	}

	network.AddStaticRoute(routerID, prefix)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleSendRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routerID := r.URL.Query().Get("router")
	linkName := r.URL.Query().Get("link")

	if routerID == "" || linkName == "" {
		http.Error(w, "Missing router or link", http.StatusBadRequest)
		return
	}

	network.SendRequest(routerID, linkName)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleSetSplitHorizon(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routerID := r.URL.Query().Get("router")
	modeStr := r.URL.Query().Get("mode")

	if routerID == "" || modeStr == "" {
		http.Error(w, "Missing router or mode", http.StatusBadRequest)
		return
	}

	var mode ripng.SplitHorizonMode
	switch modeStr {
	case "none":
		mode = ripng.SplitHorizonNone
	case "simple":
		mode = ripng.SplitHorizonSimple
	case "poison":
		mode = ripng.SplitHorizonPoisonReverse
	default:
		http.Error(w, "Invalid mode", http.StatusBadRequest)
		return
	}

	network.Routers[routerID].SplitHorizon = mode

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleAddAggregateRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		RouterID   string   `json:"router_id"`
		Prefix     string   `json:"prefix"`
		Aggregated []string `json:"aggregated"`
		Metric     uint8    `json:"metric"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.RouterID == "" || req.Prefix == "" {
		http.Error(w, "Missing router_id or prefix", http.StatusBadRequest)
		return
	}

	prefix, err := netip.ParsePrefix(req.Prefix)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid prefix: %v", err), http.StatusBadRequest)
		return
	}

	if req.Metric == 0 {
		req.Metric = 1
	}

	network.AddAggregateRoute(req.RouterID, prefix, req.Aggregated, req.Metric)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"router": req.RouterID,
		"prefix": prefix.String(),
	})
}

func handleRemoveAggregateRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routerID := r.URL.Query().Get("router")
	prefixStr := r.URL.Query().Get("prefix")

	if routerID == "" || prefixStr == "" {
		http.Error(w, "Missing router or prefix", http.StatusBadRequest)
		return
	}

	prefix, err := netip.ParsePrefix(prefixStr)
	if err != nil {
		http.Error(w, fmt.Sprintf("Invalid prefix: %v", err), http.StatusBadRequest)
		return
	}

	success := network.RemoveAggregateRoute(routerID, prefix)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"removed": success,
	})
}

func handleAutoAggregate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routerID := r.URL.Query().Get("router")
	minPrefixLenStr := r.URL.Query().Get("min_prefix_len")

	if routerID == "" {
		http.Error(w, "Missing router", http.StatusBadRequest)
		return
	}

	minPrefixLen := 48
	if minPrefixLenStr != "" {
		if n, err := strconv.Atoi(minPrefixLenStr); err == nil && n > 0 && n <= 128 {
			minPrefixLen = n
		}
	}

	aggregated := network.AutoAggregate(routerID, minPrefixLen)

	var result []string
	for _, p := range aggregated {
		result = append(result, p.String())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":     "ok",
		"router":     routerID,
		"aggregated": result,
		"count":      len(result),
	})
}

func handleCapturePackets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"packets": network.GetCapturePackets(),
		"count":   len(network.GetCapturePackets()),
	})
}

func handleCaptureClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	network.ClearCapture()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleCaptureToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	enabledStr := r.URL.Query().Get("enabled")
	enabled := true
	if enabledStr == "false" || enabledStr == "0" {
		enabled = false
	}

	network.SetCaptureEnabled(enabled)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "ok",
		"enabled": enabled,
	})
}

func handleCaptureExportJSON(w http.ResponseWriter, r *http.Request) {
	data, err := network.ExportCaptureJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=\"ripng_capture.json")
	w.Write(data)
}

func handleCaptureExportPCAP(w http.ResponseWriter, r *http.Request) {
	data, err := network.ExportCapturePCAP()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/vnd.tcpdump.pcap")
	w.Header().Set("Content-Disposition", "attachment; filename=\"ripng_capture.pcap\"")
	w.Write(data)
}

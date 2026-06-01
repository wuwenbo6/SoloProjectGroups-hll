package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/quic-go/quic-go"

	"quic-migration-demo/common"
)

type pathRecord struct {
	pathID      string
	localAddr   string
	state       string
	rttMs       int64
	packetsSent int64
	packetsRecv int64
	isPrimary   bool
	addedAt     time.Time
}

type ConnectionTracker struct {
	conn            quic.Connection
	originalAddress net.Addr
	currentAddress  net.Addr
	connectionID    string
	resetToken      string
	pathChanges     []common.PathChangeEvent
	challengeSeq    int
	verifiedPaths   map[string]bool
	paths           map[string]*pathRecord
	latencyRecords  []common.MigrationLatency
	mu              sync.RWMutex
}

var (
	trackers      = make(map[string]*ConnectionTracker)
	trackersMu    sync.RWMutex
	wsClients     = make(map[*websocket.Conn]bool)
	wsMu          sync.Mutex
	connIDCounter uint64
	upgrader      = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
	globalLatencyRecords []common.MigrationLatency
	globalLatencyMu      sync.Mutex
)

func generateConnID() string {
	id := atomic.AddUint64(&connIDCounter, 1)
	return fmt.Sprintf("conn-%06d", id)
}

func generateResetToken(connectionID string) string {
	hash := sha256.Sum256([]byte(connectionID + time.Now().String()))
	return hex.EncodeToString(hash[:16])
}

func generateChallengeData() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	go startQUICServer()
	go startHTTPServer()
	go startPingLoop()

	select {}
}

func startQUICServer() {
	tlsConfig := generateTLSConfig()

	quicConfig := &quic.Config{
		EnableDatagrams: true,
		MaxIdleTimeout:  5 * time.Minute,
		KeepAlivePeriod: 10 * time.Second,
	}

	addr := ":4242"
	listener, err := quic.ListenAddr(addr, tlsConfig, quicConfig)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("QUIC server listening on %s", addr)

	for {
		conn, err := listener.Accept(context.Background())
		if err != nil {
			log.Printf("Failed to accept connection: %v", err)
			continue
		}

		go handleConnection(conn)
	}
}

func handleConnection(conn quic.Connection) {
	connectionID := generateConnID()
	remoteAddr := conn.RemoteAddr()
	resetToken := generateResetToken(connectionID)

	initialPathID := "path-001"

	tracker := &ConnectionTracker{
		conn:            conn,
		originalAddress: remoteAddr,
		currentAddress:  remoteAddr,
		connectionID:    connectionID,
		resetToken:      resetToken,
		pathChanges:     []common.PathChangeEvent{},
		challengeSeq:    0,
		verifiedPaths:   make(map[string]bool),
		paths: map[string]*pathRecord{
			initialPathID: {
				pathID:    initialPathID,
				localAddr: remoteAddr.String(),
				state:     common.PathStateActive,
				isPrimary: true,
				addedAt:   time.Now(),
			},
		},
		latencyRecords: []common.MigrationLatency{},
	}
	tracker.verifiedPaths[remoteAddr.String()] = true

	trackersMu.Lock()
	trackers[connectionID] = tracker
	trackersMu.Unlock()

	log.Printf("New connection: %s from %s", connectionID, remoteAddr)
	log.Printf("Reset token for %s: %s", connectionID, resetToken)

	broadcastEvent(common.Message{
		Type:      common.MsgTypeConnectionInfo,
		Timestamp: time.Now(),
		Payload: common.ConnectionInfo{
			ConnectionID:    connectionID,
			OriginalAddress: remoteAddr.String(),
			CurrentAddress:  remoteAddr.String(),
			ResetToken:      resetToken,
			ActivePaths:     tracker.getPathInfos(),
		},
	})

	go monitorPathChanges(tracker)

	for {
		stream, err := conn.AcceptStream(context.Background())
		if err != nil {
			log.Printf("Connection %s stream error: %v", connectionID, err)
			removeTracker(connectionID)
			return
		}
		go handleStream(tracker, stream)
	}
}

func (t *ConnectionTracker) getPathInfos() []common.PathInfo {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make([]common.PathInfo, 0, len(t.paths))
	for _, p := range t.paths {
		result = append(result, common.PathInfo{
			PathID:      p.pathID,
			LocalAddr:   p.localAddr,
			RemoteAddr:  "server:4242",
			State:       p.state,
			RTTMs:       p.rttMs,
			PacketsSent: p.packetsSent,
			PacketsRecv: p.packetsRecv,
			IsPrimary:   p.isPrimary,
		})
	}
	return result
}

func handleStream(tracker *ConnectionTracker, stream quic.Stream) {
	defer stream.Close()

	buf := make([]byte, 4096)
	for {
		n, err := stream.Read(buf)
		if err != nil {
			return
		}

		var msg common.Message
		if err := json.Unmarshal(buf[:n], &msg); err != nil {
			continue
		}

		handleMessage(tracker, msg, stream)
	}
}

func handleMessage(tracker *ConnectionTracker, msg common.Message, stream quic.Stream) {
	switch msg.Type {
	case common.MsgTypeMessage:
		content, _ := msg.Payload.(string)
		broadcastEvent(common.Message{
			Type:      common.MsgTypeMessage,
			Timestamp: time.Now(),
			Payload: common.MessageEvent{
				ConnectionID: tracker.connectionID,
				Content:      content,
				FromClient:   true,
				Path:         tracker.conn.RemoteAddr().String(),
				Timestamp:    time.Now(),
			},
		})

		sendQUICMessage(tracker.conn, common.Message{
			Type:      common.MsgTypeMessage,
			Timestamp: time.Now(),
			Payload:   fmt.Sprintf("ACK: %s", content),
		})

	case common.MsgTypePathChallenge:
		handlePathChallenge(tracker, msg, stream)

	case common.MsgTypeSwitchConfirm:
		log.Printf("Client %s confirmed IP switch", tracker.connectionID)
		payload, _ := json.Marshal(msg.Payload)
		log.Printf("Switch details: %s", string(payload))

	case common.MsgTypeResetToken:
		log.Printf("Client %s requested reset token", tracker.connectionID)
		sendQUICMessage(tracker.conn, common.Message{
			Type:      common.MsgTypeResetToken,
			Timestamp: time.Now(),
			Payload:   tracker.resetToken,
		})

	case common.MsgTypeMultiPath:
		handleMultiPathEvent(tracker, msg)

	case common.MsgTypeMigrationLatency:
		handleMigrationLatency(tracker, msg)
	}
}

func handlePathChallenge(tracker *ConnectionTracker, msg common.Message, stream quic.Stream) {
	var challenge common.PathChallenge
	payloadBytes, _ := json.Marshal(msg.Payload)
	json.Unmarshal(payloadBytes, &challenge)

	tracker.mu.Lock()
	tracker.challengeSeq++
	currentSeq := tracker.challengeSeq
	currentAddr := tracker.conn.RemoteAddr().String()
	resetToken := tracker.resetToken
	tracker.verifiedPaths[currentAddr] = true

	if challenge.PathID != "" {
		if p, ok := tracker.paths[challenge.PathID]; ok {
			p.state = common.PathStateActive
		}
	}
	tracker.mu.Unlock()

	responseHash := sha256.Sum256([]byte(challenge.ChallengeData + "server-response"))
	responseData := hex.EncodeToString(responseHash[:])

	response := common.PathResponse{
		ChallengeID:   challenge.ChallengeID,
		ResponseData:  responseData,
		Sequence:      currentSeq,
		ServerAddress: currentAddr,
		ResetToken:    resetToken,
		Verified:      true,
		PathID:        challenge.PathID,
	}

	log.Printf("[PATH_CHALLENGE #%d] Received from %s (path: %s, challenge: %s)",
		currentSeq, challenge.FromAddress, challenge.PathID, challenge.ChallengeID)
	log.Printf("[PATH_RESPONSE #%d] Sending to %s (verified: true, path: %s)",
		currentSeq, currentAddr, challenge.PathID)

	broadcastEvent(common.Message{
		Type:      common.MsgTypeMigrationStatus,
		Timestamp: time.Now(),
		Payload: common.MigrationStatus{
			ConnectionID: tracker.connectionID,
			OldAddress:   challenge.FromAddress,
			NewAddress:   currentAddr,
			Status:       common.MigrationStatusVerified,
			ChallengeSeq: currentSeq,
			Verified:     true,
			ResetToken:   resetToken,
			PathID:       challenge.PathID,
		},
	})

	if stream != nil {
		respMsg := common.Message{
			Type:      common.MsgTypePathResponse,
			Timestamp: time.Now(),
			Payload:   response,
		}
		data, _ := json.Marshal(respMsg)
		stream.Write(data)
	}
}

func handleMultiPathEvent(tracker *ConnectionTracker, msg common.Message) {
	var event common.MultiPathEvent
	payloadBytes, _ := json.Marshal(msg.Payload)
	json.Unmarshal(payloadBytes, &event)

	event.ConnectionID = tracker.connectionID

	tracker.mu.Lock()
	switch event.Action {
	case common.MultiPathActionAdd:
		tracker.paths[event.Path.PathID] = &pathRecord{
			pathID:    event.Path.PathID,
			localAddr: event.Path.LocalAddr,
			state:     event.Path.State,
			isPrimary: event.Path.IsPrimary,
			addedAt:   time.Now(),
		}
		log.Printf("[MP-QUIC] Path %s added for %s (state: %s)", event.Path.PathID, tracker.connectionID, event.Path.State)
	case common.MultiPathActionRemove:
		delete(tracker.paths, event.Path.PathID)
		log.Printf("[MP-QUIC] Path %s removed for %s", event.Path.PathID, tracker.connectionID)
	case common.MultiPathActionPrimary:
		for id, p := range tracker.paths {
			p.isPrimary = (id == event.Path.PathID)
		}
		log.Printf("[MP-QUIC] Primary path set to %s for %s", event.Path.PathID, tracker.connectionID)
	}
	allPaths := tracker.getPathInfos()
	event.AllPaths = allPaths
	tracker.mu.Unlock()

	broadcastEvent(common.Message{
		Type:      common.MsgTypeMultiPath,
		Timestamp: time.Now(),
		Payload:   event,
	})

	broadcastEvent(common.Message{
		Type:      common.MsgTypeConnectionInfo,
		Timestamp: time.Now(),
		Payload: common.ConnectionInfo{
			ConnectionID:    tracker.connectionID,
			OriginalAddress: tracker.originalAddress.String(),
			CurrentAddress:  tracker.currentAddress.String(),
			ResetToken:      tracker.resetToken,
			ActivePaths:     allPaths,
		},
	})
}

func handleMigrationLatency(tracker *ConnectionTracker, msg common.Message) {
	var record common.MigrationLatency
	payloadBytes, _ := json.Marshal(msg.Payload)
	json.Unmarshal(payloadBytes, &record)

	record.ConnectionID = tracker.connectionID

	tracker.mu.Lock()
	tracker.latencyRecords = append(tracker.latencyRecords, record)
	tracker.mu.Unlock()

	globalLatencyMu.Lock()
	globalLatencyRecords = append(globalLatencyRecords, record)
	globalLatencyMu.Unlock()

	log.Printf("[LATENCY] %s migration #%d: total=%dms, socket_switch=%dμs, verified=%v",
		tracker.connectionID, record.MigrationSeq, record.TotalLatencyMs, record.SocketSwitchUs, record.Verified)

	broadcastEvent(common.Message{
		Type:      common.MsgTypeMigrationLatency,
		Timestamp: time.Now(),
		Payload:   record,
	})
}

func monitorPathChanges(tracker *ConnectionTracker) {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if tracker.conn.Context().Err() != nil {
				return
			}

			tracker.mu.RLock()
			oldAddr := tracker.currentAddress
			tracker.mu.RUnlock()

			newAddr := tracker.conn.RemoteAddr()

			if oldAddr.String() != newAddr.String() {
				tracker.mu.Lock()
				tracker.currentAddress = newAddr

				event := common.PathChangeEvent{
					ConnectionID:   tracker.connectionID,
					OldAddress:     oldAddr.String(),
					NewAddress:     newAddr.String(),
					Timestamp:      time.Now(),
					MigrationType:  "client_mobility",
					PathVerified:   false,
					ChallengeRound: 0,
				}
				tracker.pathChanges = append(tracker.pathChanges, event)
				tracker.mu.Unlock()

				log.Printf("Path change detected for %s: %s -> %s",
					tracker.connectionID, oldAddr, newAddr)

				broadcastEvent(common.Message{
					Type:      common.MsgTypePathChange,
					Timestamp: time.Now(),
					Payload:   event,
				})

				broadcastEvent(common.Message{
					Type:      common.MsgTypeMigrationStatus,
					Timestamp: time.Now(),
					Payload: common.MigrationStatus{
						ConnectionID: tracker.connectionID,
						OldAddress:   oldAddr.String(),
						NewAddress:   newAddr.String(),
						Status:       common.MigrationStatusMigrating,
						ChallengeSeq: 0,
						Verified:     false,
					},
				})

				broadcastEvent(common.Message{
					Type:      common.MsgTypeConnectionInfo,
					Timestamp: time.Now(),
					Payload: common.ConnectionInfo{
						ConnectionID:    tracker.connectionID,
						OriginalAddress: tracker.originalAddress.String(),
						CurrentAddress:  newAddr.String(),
						ResetToken:      tracker.resetToken,
						ActivePaths:     tracker.getPathInfos(),
					},
				})
			}
		}
	}
}

func sendQUICMessage(conn quic.Connection, msg common.Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}

	stream, err := conn.OpenStream()
	if err != nil {
		log.Printf("Failed to open stream: %v", err)
		return
	}
	defer stream.Close()

	if _, err := stream.Write(data); err != nil {
		log.Printf("Failed to write message: %v", err)
	}
}

func removeTracker(connectionID string) {
	trackersMu.Lock()
	delete(trackers, connectionID)
	trackersMu.Unlock()
}

func broadcastEvent(msg common.Message) {
	wsMu.Lock()
	defer wsMu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	for client := range wsClients {
		if err := client.WriteMessage(websocket.TextMessage, data); err != nil {
			client.Close()
			delete(wsClients, client)
		}
	}
}

func startHTTPServer() {
	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/api/connections", handleConnectionsAPI)
	http.HandleFunc("/api/stats", handleStatsAPI)
	http.HandleFunc("/api/stats/export", handleStatsExportAPI)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "frontend/index.html")
	})

	addr := ":8080"
	log.Printf("HTTP server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	wsMu.Lock()
	wsClients[conn] = true
	wsMu.Unlock()

	log.Printf("New WebSocket client connected")
	sendInitialState(conn)

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			wsMu.Lock()
			delete(wsClients, conn)
			wsMu.Unlock()
			log.Printf("WebSocket client disconnected")
			return
		}
	}
}

func sendInitialState(conn *websocket.Conn) {
	trackersMu.RLock()
	defer trackersMu.RUnlock()

	for _, tracker := range trackers {
		tracker.mu.RLock()

		data, _ := json.Marshal(common.Message{
			Type:      common.MsgTypeConnectionInfo,
			Timestamp: time.Now(),
			Payload: common.ConnectionInfo{
				ConnectionID:    tracker.connectionID,
				OriginalAddress: tracker.originalAddress.String(),
				CurrentAddress:  tracker.currentAddress.String(),
				ResetToken:      tracker.resetToken,
				ActivePaths:     tracker.getPathInfos(),
			},
		})
		conn.WriteMessage(websocket.TextMessage, data)

		for _, event := range tracker.pathChanges {
			data, _ := json.Marshal(common.Message{
				Type:      common.MsgTypePathChange,
				Timestamp: event.Timestamp,
				Payload:   event,
			})
			conn.WriteMessage(websocket.TextMessage, data)
		}

		for _, record := range tracker.latencyRecords {
			data, _ := json.Marshal(common.Message{
				Type:      common.MsgTypeMigrationLatency,
				Timestamp: time.Now(),
				Payload:   record,
			})
			conn.WriteMessage(websocket.TextMessage, data)
		}

		tracker.mu.RUnlock()
	}
}

func handleConnectionsAPI(w http.ResponseWriter, r *http.Request) {
	trackersMu.RLock()
	defer trackersMu.RUnlock()

	connections := make([]map[string]interface{}, 0, len(trackers))
	for _, tracker := range trackers {
		tracker.mu.RLock()
		connections = append(connections, map[string]interface{}{
			"connectionId":    tracker.connectionID,
			"originalAddress": tracker.originalAddress.String(),
			"currentAddress":  tracker.currentAddress.String(),
			"resetToken":      tracker.resetToken,
			"pathChanges":     tracker.pathChanges,
			"activePaths":     tracker.getPathInfos(),
		})
		tracker.mu.RUnlock()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(connections)
}

func computeStats(records []common.MigrationLatency) common.StatsExport {
	stats := common.StatsExport{
		Records: records,
	}

	if len(records) == 0 {
		return stats
	}

	stats.TotalMigrations = len(records)

	var totalMs int64
	var totalSocketUs int64
	var minMs int64 = 999999
	var maxMs int64

	latencies := make([]int64, len(records))
	for i, r := range records {
		totalMs += r.TotalLatencyMs
		totalSocketUs += r.SocketSwitchUs
		latencies[i] = r.TotalLatencyMs
		if r.TotalLatencyMs < minMs {
			minMs = r.TotalLatencyMs
		}
		if r.TotalLatencyMs > maxMs {
			maxMs = r.TotalLatencyMs
		}
		if r.Verified {
			stats.TotalVerified++
		}
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	stats.AvgLatencyMs = float64(totalMs) / float64(len(records))
	stats.MinLatencyMs = minMs
	stats.MaxLatencyMs = maxMs
	stats.AvgSocketSwitch = float64(totalSocketUs) / float64(len(records))

	p50Idx := len(latencies) * 50 / 100
	p95Idx := len(latencies) * 95 / 100
	p99Idx := len(latencies) * 99 / 100
	if p50Idx >= len(latencies) {
		p50Idx = len(latencies) - 1
	}
	if p95Idx >= len(latencies) {
		p95Idx = len(latencies) - 1
	}
	if p99Idx >= len(latencies) {
		p99Idx = len(latencies) - 1
	}
	stats.P50LatencyMs = latencies[p50Idx]
	stats.P95LatencyMs = latencies[p95Idx]
	stats.P99LatencyMs = latencies[p99Idx]

	return stats
}

func handleStatsAPI(w http.ResponseWriter, r *http.Request) {
	globalLatencyMu.Lock()
	records := make([]common.MigrationLatency, len(globalLatencyRecords))
	copy(records, globalLatencyRecords)
	globalLatencyMu.Unlock()

	stats := computeStats(records)

	trackersMu.RLock()
	totalPaths := 0
	for _, tracker := range trackers {
		tracker.mu.RLock()
		totalPaths += len(tracker.paths)
		tracker.mu.RUnlock()
	}
	trackersMu.RUnlock()
	stats.ActivePaths = totalPaths

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func handleStatsExportAPI(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	globalLatencyMu.Lock()
	records := make([]common.MigrationLatency, len(globalLatencyRecords))
	copy(records, globalLatencyRecords)
	globalLatencyMu.Unlock()

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=migration_stats.csv")

		cw := csv.NewWriter(w)
		defer cw.Flush()

		cw.Write([]string{"connection_id", "migration_seq", "old_address", "new_address", "path_id",
			"socket_switch_us", "challenge_sent_ms", "response_recv_ms",
			"total_latency_ms", "verified", "timestamp"})

		for _, r := range records {
			cw.Write([]string{
				r.ConnectionID,
				fmt.Sprintf("%d", r.MigrationSeq),
				r.OldAddress,
				r.NewAddress,
				r.PathID,
				fmt.Sprintf("%d", r.SocketSwitchUs),
				fmt.Sprintf("%d", r.ChallengeSentMs),
				fmt.Sprintf("%d", r.ResponseRecvMs),
				fmt.Sprintf("%d", r.TotalLatencyMs),
				fmt.Sprintf("%v", r.Verified),
				r.Timestamp,
			})
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=migration_stats.json")
	stats := computeStats(records)
	json.NewEncoder(w).Encode(stats)
}

func startPingLoop() {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		trackersMu.RLock()
		conns := make(map[string]quic.Connection, len(trackers))
		for id, tracker := range trackers {
			conns[id] = tracker.conn
		}
		trackersMu.RUnlock()

		for id, conn := range conns {
			msg := common.Message{
				Type:      common.MsgTypePing,
				Timestamp: time.Now(),
				Payload:   fmt.Sprintf("ping-%d", time.Now().UnixNano()),
			}
			data, _ := json.Marshal(msg)

			stream, err := conn.OpenStream()
			if err != nil {
				continue
			}
			stream.Write(data)
			stream.Close()
			_ = id
		}
	}
}

func generateTLSConfig() *tls.Config {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		NotBefore:    time.Now(),
		NotAfter:     time.Now().Add(time.Hour * 24 * 365),
		KeyUsage:     x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{{
			Certificate: [][]byte{certDER},
			PrivateKey:  key,
		}},
		NextProtos: []string{"quic-migration-demo"},
	}
}

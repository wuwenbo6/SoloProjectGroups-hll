package main

import (
	"context"
	cryptorand "crypto/rand"
	"crypto/tls"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	mathrand "math/rand"
	"net"
	"os"
	"os/signal"
	"sort"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/quic-go/quic-go"

	"quic-migration-demo/common"
)

type readResult struct {
	n    int
	addr net.Addr
	err  error
	data []byte
}

type pathEntry struct {
	id          string
	conn        *net.UDPConn
	localAddr   net.Addr
	state       string
	packetsSent int64
	packetsRecv int64
	rttMs       int64
	isPrimary   bool
}

type MultiPathPacketConn struct {
	mu          sync.RWMutex
	paths       map[string]*pathEntry
	primaryID   string
	readChan    chan readResult
	stopChan    chan struct{}
	stopped     bool
	scheduleIdx uint64
}

var pathIDCounter uint64

func generatePathID() string {
	id := atomic.AddUint64(&pathIDCounter, 1)
	return fmt.Sprintf("path-%03d", id)
}

func NewMultiPathPacketConn(initialConn *net.UDPConn) *MultiPathPacketConn {
	id := generatePathID()
	mpc := &MultiPathPacketConn{
		paths:     make(map[string]*pathEntry),
		readChan:  make(chan readResult, 512),
		stopChan:  make(chan struct{}),
		primaryID: id,
	}
	entry := &pathEntry{
		id:        id,
		conn:      initialConn,
		localAddr: initialConn.LocalAddr(),
		state:     common.PathStateActive,
		isPrimary: true,
	}
	mpc.paths[id] = entry
	go mpc.readLoop(id, initialConn)
	return mpc
}

func (m *MultiPathPacketConn) readLoop(pathID string, conn *net.UDPConn) {
	buf := make([]byte, 65535)
	for {
		select {
		case <-m.stopChan:
			return
		default:
		}

		n, addr, err := conn.ReadFrom(buf)
		if err != nil {
			select {
			case m.readChan <- readResult{err: err}:
			case <-m.stopChan:
			}
			return
		}

		data := make([]byte, n)
		copy(data, buf[:n])

		m.mu.RLock()
		if entry, ok := m.paths[pathID]; ok {
			atomic.AddInt64(&entry.packetsRecv, 1)
		}
		m.mu.RUnlock()

		select {
		case m.readChan <- readResult{n: n, addr: addr, data: data}:
		case <-m.stopChan:
			return
		}
	}
}

func (m *MultiPathPacketConn) ReadFrom(p []byte) (n int, addr net.Addr, err error) {
	select {
	case result := <-m.readChan:
		if result.err != nil {
			return 0, nil, result.err
		}
		copy(p, result.data)
		return result.n, result.addr, nil
	case <-m.stopChan:
		return 0, nil, net.ErrClosed
	}
}

func (m *MultiPathPacketConn) WriteTo(p []byte, addr net.Addr) (n int, err error) {
	idx := atomic.AddUint64(&m.scheduleIdx, 1)

	m.mu.RLock()
	defer m.mu.RUnlock()

	var candidates []*pathEntry
	for _, entry := range m.paths {
		if entry.state == common.PathStateActive {
			candidates = append(candidates, entry)
		}
	}

	if len(candidates) == 0 {
		return 0, fmt.Errorf("no active paths available")
	}

	var selected *pathEntry
	for _, entry := range candidates {
		if entry.isPrimary {
			selected = entry
			break
		}
	}

	if selected == nil {
		selected = candidates[int(idx)%len(candidates)]
	}

	atomic.AddInt64(&selected.packetsSent, 1)
	return selected.conn.WriteTo(p, addr)
}

func (m *MultiPathPacketConn) LocalAddr() net.Addr {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if entry, ok := m.paths[m.primaryID]; ok {
		return entry.localAddr
	}
	for _, entry := range m.paths {
		return entry.localAddr
	}
	return nil
}

func (m *MultiPathPacketConn) Close() error {
	m.mu.Lock()
	if m.stopped {
		m.mu.Unlock()
		return nil
	}
	m.stopped = true
	close(m.stopChan)
	for _, entry := range m.paths {
		entry.conn.Close()
	}
	m.mu.Unlock()
	return nil
}

func (m *MultiPathPacketConn) SetDeadline(t time.Time) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, entry := range m.paths {
		entry.conn.SetDeadline(t)
	}
	return nil
}

func (m *MultiPathPacketConn) SetReadDeadline(t time.Time) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, entry := range m.paths {
		entry.conn.SetReadDeadline(t)
	}
	return nil
}

func (m *MultiPathPacketConn) SetWriteDeadline(t time.Time) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, entry := range m.paths {
		entry.conn.SetWriteDeadline(t)
	}
	return nil
}

func (m *MultiPathPacketConn) AddPath(newIP string) (*pathEntry, error) {
	newAddr := &net.UDPAddr{
		IP:   net.ParseIP(newIP),
		Port: 0,
	}

	newConn, err := net.ListenUDP("udp", newAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to bind to %s: %w", newIP, err)
	}

	id := generatePathID()
	entry := &pathEntry{
		id:        id,
		conn:      newConn,
		localAddr: newConn.LocalAddr(),
		state:     common.PathStateValidating,
		isPrimary: false,
	}

	m.mu.Lock()
	m.paths[id] = entry
	m.mu.Unlock()

	go m.readLoop(id, newConn)

	log.Printf("[MP-QUIC] Added path %s on %s (validating)", id, newConn.LocalAddr())
	return entry, nil
}

func (m *MultiPathPacketConn) ValidatePath(pathID string) {
	m.mu.Lock()
	if entry, ok := m.paths[pathID]; ok {
		entry.state = common.PathStateActive
	}
	m.mu.Unlock()
	log.Printf("[MP-QUIC] Path %s validated and active", pathID)
}

func (m *MultiPathPacketConn) SetPrimary(pathID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	newPrimary, ok := m.paths[pathID]
	if !ok || newPrimary.state != common.PathStateActive {
		return false
	}

	if oldPrimary, ok := m.paths[m.primaryID]; ok {
		oldPrimary.isPrimary = false
	}
	newPrimary.isPrimary = true
	m.primaryID = pathID

	log.Printf("[MP-QUIC] Primary path switched to %s (%s)", pathID, newPrimary.localAddr)
	return true
}

func (m *MultiPathPacketConn) RemovePath(pathID string) {
	m.mu.Lock()
	entry, ok := m.paths[pathID]
	if !ok {
		m.mu.Unlock()
		return
	}

	if entry.isPrimary {
		for id, e := range m.paths {
			if id != pathID && e.state == common.PathStateActive {
				e.isPrimary = true
				m.primaryID = id
				break
			}
		}
	}

	delete(m.paths, pathID)
	m.mu.Unlock()

	entry.conn.Close()
	log.Printf("[MP-QUIC] Removed path %s", pathID)
}

func (m *MultiPathPacketConn) Migrate(newIP string) (string, error) {
	startTime := time.Now()

	newAddr := &net.UDPAddr{
		IP:   net.ParseIP(newIP),
		Port: 0,
	}

	newConn, err := net.ListenUDP("udp", newAddr)
	if err != nil {
		return "", fmt.Errorf("failed to bind to %s: %w", newIP, err)
	}

	id := generatePathID()
	entry := &pathEntry{
		id:        id,
		conn:      newConn,
		localAddr: newConn.LocalAddr(),
		state:     common.PathStateValidating,
		isPrimary: true,
	}

	m.mu.Lock()
	if oldPrimary, ok := m.paths[m.primaryID]; ok {
		oldPrimary.isPrimary = false
		oldPrimary.state = common.PathStateStandby
	}
	m.paths[id] = entry
	m.primaryID = id
	m.mu.Unlock()

	go m.readLoop(id, newConn)

	elapsed := time.Since(startTime)
	log.Printf("[MP-QUIC] Migrated to path %s on %s (socket switch: %dμs)", id, newConn.LocalAddr(), elapsed.Microseconds())

	return id, nil
}

func (m *MultiPathPacketConn) GetPathInfos(remoteAddr string) []common.PathInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]common.PathInfo, 0, len(m.paths))
	for _, entry := range m.paths {
		result = append(result, common.PathInfo{
			PathID:      entry.id,
			LocalAddr:   entry.localAddr.String(),
			RemoteAddr:  remoteAddr,
			State:       entry.state,
			RTTMs:       entry.rttMs,
			PacketsSent: atomic.LoadInt64(&entry.packetsSent),
			PacketsRecv: atomic.LoadInt64(&entry.packetsRecv),
			IsPrimary:   entry.isPrimary,
		})
	}
	return result
}

func (m *MultiPathPacketConn) GetPrimaryID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.primaryID
}

func (m *MultiPathPacketConn) GetPathCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.paths)
}

type pendingChallenge struct {
	challenge common.PathChallenge
	received  chan common.PathResponse
	timeout   *time.Timer
}

type Client struct {
	conn              quic.Connection
	packetConn        *MultiPathPacketConn
	availableIPs      []string
	currentIPIdx      int
	messageCount      int
	switchCount       int
	challengeCount    int
	resetToken        string
	pendingChallenges map[string]*pendingChallenge
	pendingMu         sync.Mutex
	mu                sync.Mutex
	latencyRecords    []common.MigrationLatency
	latencyMu         sync.Mutex
}

func generateChallengeID() string {
	b := make([]byte, 8)
	cryptorand.Read(b)
	return hex.EncodeToString(b)
}

func generateChallengeData() string {
	b := make([]byte, 16)
	cryptorand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	serverAddr := flag.String("server", "localhost:4242", "QUIC server address")
	flag.Parse()

	availableIPs := []string{
		"127.0.0.1",
		"127.0.0.2",
		"127.0.0.3",
		"127.0.0.4",
		"127.0.0.5",
	}

	client := &Client{
		availableIPs:      availableIPs,
		currentIPIdx:      0,
		pendingChallenges: make(map[string]*pendingChallenge),
		latencyRecords:    make([]common.MigrationLatency, 0),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	if err := client.connect(ctx, *serverAddr); err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.packetConn.Close()
	defer client.conn.CloseWithError(0, "client shutting down")

	go client.receiveMessages()
	go client.sendMessages()
	go client.simulateIPSwitch(ctx)

	fmt.Println("QUIC Multi-Path Client started (MP-QUIC Simulation)")
	fmt.Println("Available simulated IPs:", availableIPs)
	fmt.Printf("Currently using: %s\n", client.currentIP())
	fmt.Println("Commands: 'switch' = migrate IP, 'addpath' = add new path, 'stats' = show latency stats, 'export' = export stats")

	go func() {
		var input string
		for {
			fmt.Scanln(&input)
			switch input {
			case "switch":
				client.switchIP()
			case "addpath":
				client.addPath()
			case "stats":
				client.printStats()
			case "export":
				client.exportStats()
			}
		}
	}()

	<-sigChan
	client.exportStats()
	fmt.Println("\nShutting down client...")
}

func (c *Client) currentIP() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.availableIPs[c.currentIPIdx]
}

func (c *Client) connect(ctx context.Context, serverAddr string) error {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"quic-migration-demo"},
	}

	quicConfig := &quic.Config{
		EnableDatagrams: true,
		MaxIdleTimeout:  5 * time.Minute,
		KeepAlivePeriod: 10 * time.Second,
	}

	localAddr := &net.UDPAddr{
		IP:   net.ParseIP(c.availableIPs[c.currentIPIdx]),
		Port: 0,
	}

	udpConn, err := net.ListenUDP("udp", localAddr)
	if err != nil {
		return fmt.Errorf("failed to create UDP socket on %s: %w", localAddr.IP, err)
	}

	c.packetConn = NewMultiPathPacketConn(udpConn)

	log.Printf("Binding to local address: %s", udpConn.LocalAddr())

	remoteAddr, err := net.ResolveUDPAddr("udp", serverAddr)
	if err != nil {
		return fmt.Errorf("failed to resolve server address: %w", err)
	}

	conn, err := quic.Dial(ctx, c.packetConn, remoteAddr, tlsConfig, quicConfig)
	if err != nil {
		return fmt.Errorf("failed to dial QUIC: %w", err)
	}

	c.conn = conn
	log.Printf("Connected to server. Local: %s -> Remote: %s", udpConn.LocalAddr(), remoteAddr)

	return nil
}

func (c *Client) sendMessages() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if c.conn == nil || c.conn.Context().Err() != nil {
			continue
		}

		c.messageCount++
		primaryID := c.packetConn.GetPrimaryID()
		content := fmt.Sprintf("Message #%d (path: %s, IP: %s)", c.messageCount, primaryID, c.currentIP())

		msg := common.Message{
			Type:      common.MsgTypeMessage,
			Timestamp: time.Now(),
			Payload:   content,
		}

		if err := c.sendMessage(msg); err != nil {
			log.Printf("Failed to send message: %v", err)
		} else {
			log.Printf("Sent: %s", content)
		}
	}
}

func (c *Client) sendMessage(msg common.Message) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	stream, err := c.conn.OpenStream()
	if err != nil {
		return err
	}
	defer stream.Close()

	_, err = stream.Write(data)
	return err
}

func (c *Client) receiveMessages() {
	for {
		if c.conn == nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		stream, err := c.conn.AcceptStream(context.Background())
		if err != nil {
			if c.conn.Context().Err() != nil {
				log.Printf("Connection closed")
				return
			}
			log.Printf("Failed to accept stream: %v", err)
			continue
		}

		go c.handleStream(stream)
	}
}

func (c *Client) handleStream(stream quic.Stream) {
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

		switch msg.Type {
		case common.MsgTypeMessage:
			content, _ := msg.Payload.(string)
			log.Printf("Received from server: %s", content)
		case common.MsgTypePing:
			pingData, _ := msg.Payload.(string)
			log.Printf("Received ping: %s", pingData)
		case common.MsgTypePathResponse:
			c.handlePathResponse(msg)
		case common.MsgTypeResetToken:
			token, _ := msg.Payload.(string)
			c.mu.Lock()
			c.resetToken = token
			c.mu.Unlock()
			log.Printf("Received reset token: %s", token)
		}
	}
}

func (c *Client) handlePathResponse(msg common.Message) {
	var response common.PathResponse
	payloadBytes, _ := json.Marshal(msg.Payload)
	json.Unmarshal(payloadBytes, &response)

	c.pendingMu.Lock()
	pending, ok := c.pendingChallenges[response.ChallengeID]
	if ok {
		delete(c.pendingChallenges, response.ChallengeID)
	}
	c.pendingMu.Unlock()

	if !ok {
		log.Printf("[PATH_RESPONSE] Unknown challenge ID: %s", response.ChallengeID)
		return
	}

	if pending.timeout != nil {
		pending.timeout.Stop()
	}

	c.mu.Lock()
	c.resetToken = response.ResetToken
	c.mu.Unlock()

	log.Printf("[PATH_RESPONSE #%d] Challenge %s verified! (path: %s)", response.Sequence, response.ChallengeID, response.PathID)

	if response.PathID != "" {
		c.packetConn.ValidatePath(response.PathID)
	}

	pending.received <- response
}

func (c *Client) sendPathChallenge(oldAddr string, pathID string) (common.PathResponse, error) {
	challengeStart := time.Now()
	challengeID := generateChallengeID()
	challengeData := generateChallengeData()

	c.challengeCount++
	challenge := common.PathChallenge{
		ChallengeID:   challengeID,
		ChallengeData: challengeData,
		Sequence:      c.challengeCount,
		FromAddress:   oldAddr,
		PathID:        pathID,
	}

	log.Printf("[PATH_CHALLENGE #%d] Sending challenge %s for path %s",
		c.challengeCount, challengeID, pathID)

	msg := common.Message{
		Type:      common.MsgTypePathChallenge,
		Timestamp: time.Now(),
		Payload:   challenge,
	}

	responseChan := make(chan common.PathResponse, 1)

	c.pendingMu.Lock()
	c.pendingChallenges[challengeID] = &pendingChallenge{
		challenge: challenge,
		received:  responseChan,
		timeout:   time.NewTimer(5 * time.Second),
	}
	c.pendingMu.Unlock()

	go func(id string, seq int) {
		time.Sleep(5 * time.Second)
		c.pendingMu.Lock()
		_, exists := c.pendingChallenges[id]
		if exists {
			delete(c.pendingChallenges, id)
			log.Printf("[PATH_CHALLENGE #%d] Challenge %s timed out", seq, id)
			responseChan <- common.PathResponse{Verified: false}
		}
		c.pendingMu.Unlock()
	}(challengeID, c.challengeCount)

	if err := c.sendMessage(msg); err != nil {
		return common.PathResponse{}, fmt.Errorf("failed to send challenge: %w", err)
	}

	challengeSentMs := time.Since(challengeStart).Milliseconds()

	response := <-responseChan

	responseRecvMs := time.Since(challengeStart).Milliseconds()

	_ = challengeSentMs
	_ = responseRecvMs

	return response, nil
}

func (c *Client) simulateIPSwitch(ctx context.Context) {
	ticker := time.NewTicker(12 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r := mathrand.Float32()
			if r < 0.3 {
				c.addPath()
			} else if r < 0.6 {
				c.switchIP()
			}
		}
	}
}

func (c *Client) addPath() {
	c.mu.Lock()
	if len(c.availableIPs) <= c.currentIPIdx+1 {
		c.mu.Unlock()
		return
	}

	newIdx := (c.currentIPIdx + 1 + mathrand.Intn(len(c.availableIPs)-1)) % len(c.availableIPs)
	newIP := c.availableIPs[newIdx]
	c.mu.Unlock()

	log.Printf("========================================")
	log.Printf("[MP-QUIC] ADDING NEW PATH: %s", newIP)
	log.Printf("========================================")

	entry, err := c.packetConn.AddPath(newIP)
	if err != nil {
		log.Printf("Failed to add path: %v", err)
		return
	}

	pathID := entry.id

	oldAddr := c.packetConn.LocalAddr().String()
	log.Printf("[MP-QUIC] Sending PATH_CHALLENGE for new path %s...", pathID)
	response, err := c.sendPathChallenge(oldAddr, pathID)
	if err != nil {
		log.Printf("PATH_CHALLENGE failed: %v", err)
		c.packetConn.RemovePath(pathID)
		return
	}

	if response.Verified {
		c.packetConn.ValidatePath(pathID)
		log.Printf("✓ Path %s VERIFIED and active!", pathID)

		broadcastPaths := c.packetConn.GetPathInfos(c.conn.RemoteAddr().String())
		confirmMsg := common.Message{
			Type:      common.MsgTypeMultiPath,
			Timestamp: time.Now(),
			Payload: common.MultiPathEvent{
				ConnectionID: "",
				Action:       common.MultiPathActionAdd,
				Path: common.PathInfo{
					PathID:    pathID,
					LocalAddr: entry.localAddr.String(),
					State:     common.PathStateActive,
				},
				AllPaths:  broadcastPaths,
				Timestamp: time.Now(),
			},
		}
		if err := c.sendMessage(confirmMsg); err != nil {
			log.Printf("Failed to send multipath event: %v", err)
		}
	} else {
		log.Printf("✗ Path %s verification FAILED, removing", pathID)
		c.packetConn.RemovePath(pathID)
	}

	log.Printf("[MP-QUIC] Active paths: %d, Primary: %s", c.packetConn.GetPathCount(), c.packetConn.GetPrimaryID())
}

func (c *Client) switchIP() {
	c.mu.Lock()
	oldIP := c.availableIPs[c.currentIPIdx]
	oldAddr := c.packetConn.LocalAddr().String()
	c.currentIPIdx = (c.currentIPIdx + 1) % len(c.availableIPs)
	newIP := c.availableIPs[c.currentIPIdx]
	c.mu.Unlock()

	c.switchCount++

	migrationStart := time.Now()

	log.Printf("========================================")
	log.Printf("IP MIGRATION #%d", c.switchCount)
	log.Printf("Old IP: %s -> New IP: %s", oldIP, newIP)
	log.Printf("========================================")

	pathID, err := c.packetConn.Migrate(newIP)
	if err != nil {
		log.Printf("Failed to migrate: %v", err)
		return
	}

	socketSwitchUs := time.Since(migrationStart).Microseconds()

	log.Printf("Migrated to path %s on IP: %s (socket switch: %dμs)", pathID, newIP, socketSwitchUs)
	newAddr := c.packetConn.LocalAddr().String()

	log.Printf("New local address: %s", newAddr)
	log.Printf("Sending PATH_CHALLENGE to verify new path...")

	challengeStart := time.Now()
	response, err := c.sendPathChallenge(oldAddr, pathID)
	challengeRoundMs := time.Since(challengeStart).Milliseconds()

	if err != nil {
		log.Printf("PATH_CHALLENGE failed: %v", err)
	} else if response.Verified {
		c.packetConn.ValidatePath(pathID)
		log.Printf("✓ PATH_VERIFIED! New path %s is valid", pathID)
	}

	totalLatencyMs := time.Since(migrationStart).Milliseconds()

	record := common.MigrationLatency{
		ConnectionID:    "",
		MigrationSeq:    c.switchCount,
		OldAddress:      oldIP,
		NewAddress:      newIP,
		PathID:          pathID,
		SocketSwitchUs:  socketSwitchUs,
		ChallengeSentMs: challengeRoundMs,
		ResponseRecvMs:  challengeRoundMs,
		TotalLatencyMs:  totalLatencyMs,
		Verified:        response.Verified,
		Timestamp:       time.Now().Format(time.RFC3339Nano),
	}

	c.latencyMu.Lock()
	c.latencyRecords = append(c.latencyRecords, record)
	c.latencyMu.Unlock()

	log.Printf("[STATS] Migration #%d latency: total=%dms, socket_switch=%dμs, challenge_round=%dms",
		c.switchCount, totalLatencyMs, socketSwitchUs, challengeRoundMs)

	confirmMsg := common.Message{
		Type:      common.MsgTypeSwitchConfirm,
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"oldIP":       oldIP,
			"newIP":       newIP,
			"switchCount": c.switchCount,
			"verified":    response.Verified,
			"resetToken":  c.resetToken,
			"pathId":      pathID,
			"latencyMs":   totalLatencyMs,
		},
	}
	if err := c.sendMessage(confirmMsg); err != nil {
		log.Printf("Failed to send migration confirm: %v", err)
	}

	latencyMsg := common.Message{
		Type:      common.MsgTypeMigrationLatency,
		Timestamp: time.Now(),
		Payload:   record,
	}
	if err := c.sendMessage(latencyMsg); err != nil {
		log.Printf("Failed to send latency record: %v", err)
	}

	log.Printf("QUIC connection alive, local: %s -> remote: %s",
		c.packetConn.LocalAddr(), c.conn.RemoteAddr())
	log.Printf("Active paths: %d, Primary: %s", c.packetConn.GetPathCount(), c.packetConn.GetPrimaryID())
}

func (c *Client) printStats() {
	c.latencyMu.Lock()
	defer c.latencyMu.Unlock()

	if len(c.latencyRecords) == 0 {
		fmt.Println("No migration latency records yet.")
		return
	}

	fmt.Println("\n========== Migration Latency Statistics ==========")
	fmt.Printf("Total migrations: %d\n", len(c.latencyRecords))

	var totalMs int64
	var totalSocketUs int64
	var minMs int64 = 999999
	var maxMs int64
	var verified int

	latencies := make([]int64, len(c.latencyRecords))
	for i, r := range c.latencyRecords {
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
			verified++
		}
	}

	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })

	avgMs := float64(totalMs) / float64(len(c.latencyRecords))
	avgSocketUs := float64(totalSocketUs) / float64(len(c.latencyRecords))

	p50 := latencies[len(latencies)*50/100]
	p95Idx := len(latencies) * 95 / 100
	if p95Idx >= len(latencies) {
		p95Idx = len(latencies) - 1
	}
	p95 := latencies[p95Idx]
	p99Idx := len(latencies) * 99 / 100
	if p99Idx >= len(latencies) {
		p99Idx = len(latencies) - 1
	}
	p99 := latencies[p99Idx]

	fmt.Printf("Verified: %d/%d\n", verified, len(c.latencyRecords))
	fmt.Printf("Avg total latency: %.2f ms\n", avgMs)
	fmt.Printf("Avg socket switch: %.2f μs\n", avgSocketUs)
	fmt.Printf("Min latency: %d ms\n", minMs)
	fmt.Printf("Max latency: %d ms\n", maxMs)
	fmt.Printf("P50: %d ms | P95: %d ms | P99: %d ms\n", p50, p95, p99)
	fmt.Println("==================================================\n")
}

func (c *Client) exportStats() {
	c.latencyMu.Lock()
	records := make([]common.MigrationLatency, len(c.latencyRecords))
	copy(records, c.latencyRecords)
	c.latencyMu.Unlock()

	if len(records) == 0 {
		fmt.Println("No records to export.")
		return
	}

	jsonData, _ := json.MarshalIndent(records, "", "  ")
	jsonFile := fmt.Sprintf("migration_stats_%d.json", time.Now().Unix())
	os.WriteFile(jsonFile, jsonData, 0644)
	fmt.Printf("Exported JSON stats to %s\n", jsonFile)

	csvFile := fmt.Sprintf("migration_stats_%d.csv", time.Now().Unix())
	f, err := os.Create(csvFile)
	if err != nil {
		log.Printf("Failed to create CSV: %v", err)
		return
	}
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()

	w.Write([]string{"migration_seq", "old_address", "new_address", "path_id",
		"socket_switch_us", "challenge_sent_ms", "response_recv_ms",
		"total_latency_ms", "verified", "timestamp"})

	for _, r := range records {
		w.Write([]string{
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

	fmt.Printf("Exported CSV stats to %s\n", csvFile)
}

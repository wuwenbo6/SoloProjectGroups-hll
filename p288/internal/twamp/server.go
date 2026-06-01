package twamp

import (
	"encoding/binary"
	"fmt"
	"log"
	"math/rand"
	"net"
	"sort"
	"sync"
	"time"
)

const (
	StatusOK               uint32 = 0
	StatusFailed           uint32 = 1
	StatusInternalError    uint32 = 2
	StatusModeNotSupported uint32 = 3
	MaxResultsPerSession   int    = 5000
)

type dscpConfig struct {
	baseDelay   float64
	jitter      float64
	lossRate    float64
	description string
}

var dscpProfiles = map[uint8]dscpConfig{
	DSCPEF:        {baseDelay: 5.0, jitter: 1.0, lossRate: 0.001, description: "EF - Low Latency"},
	DSCPVOICE:     {baseDelay: 8.0, jitter: 1.5, lossRate: 0.002, description: "Voice"},
	DSCPVIDEO:     {baseDelay: 15.0, jitter: 3.0, lossRate: 0.005, description: "Video"},
	DSCPAF41:      {baseDelay: 20.0, jitter: 5.0, lossRate: 0.01, description: "AF41 - High Priority"},
	DSCPAF31:      {baseDelay: 30.0, jitter: 8.0, lossRate: 0.015, description: "AF31 - Medium Priority"},
	DSCPAF21:      {baseDelay: 45.0, jitter: 12.0, lossRate: 0.02, description: "AF21 - Low Priority"},
	DSCPAF11:      {baseDelay: 60.0, jitter: 15.0, lossRate: 0.03, description: "AF11 - Standard"},
	DSCPCS5:       {baseDelay: 10.0, jitter: 2.0, lossRate: 0.003, description: "CS5 - Signaling"},
	DSCPCS4:       {baseDelay: 25.0, jitter: 6.0, lossRate: 0.01, description: "CS4 - Video Conferencing"},
	DSCPCS3:       {baseDelay: 35.0, jitter: 9.0, lossRate: 0.015, description: "CS3 - Critical Apps"},
	DSCPCS2:       {baseDelay: 50.0, jitter: 12.0, lossRate: 0.02, description: "CS2 - OAM"},
	DSCPCS1:       {baseDelay: 80.0, jitter: 20.0, lossRate: 0.05, description: "CS1 - Low Priority"},
	DSCPCS6:       {baseDelay: 8.0, jitter: 1.5, lossRate: 0.002, description: "CS6 - Network Control"},
	DSCPCS7:       {baseDelay: 5.0, jitter: 1.0, lossRate: 0.001, description: "CS7 - Network Control"},
	DSCPBE:        {baseDelay: 40.0, jitter: 15.0, lossRate: 0.02, description: "BE - Best Effort"},
}

type sessionState struct {
	session    *Session
	results    []*MeasurementResult
	lastRTT    float64
	lastSeq    uint32
}

type Server struct {
	controlAddr    string
	testAddr       string
	supportedModes uint32
	sessions       map[string]*sessionState
	allResults     []*MeasurementResult
	sessionConfigs map[string]*SessionConfig
	mu             sync.RWMutex
	stopChan       chan struct{}
}

func NewServer(controlPort, testPort int) *Server {
	return &Server{
		controlAddr:    fmt.Sprintf(":%d", controlPort),
		testAddr:       fmt.Sprintf(":%d", testPort),
		supportedModes: ModeUnAuthenticated,
		sessions:       make(map[string]*sessionState),
		allResults:     make([]*MeasurementResult, 0),
		sessionConfigs: make(map[string]*SessionConfig),
		stopChan:       make(chan struct{}),
	}
}

func (s *Server) SetSupportedModes(modes uint32) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.supportedModes = modes
}

func (s *Server) GetSupportedModes() uint32 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.supportedModes
}

func (s *Server) AddSession(config *SessionConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if config.ID == "" {
		config.ID = fmt.Sprintf("session-%d", time.Now().UnixNano())
	}
	if config.Name == "" {
		config.Name = fmt.Sprintf("Session %s", DSCPToName(config.DSCP))
	}

	s.sessions[config.ID] = &sessionState{
		session: &Session{
			ID:     config.ID,
			Name:   config.Name,
			DSCP:   config.DSCP,
			Active: config.Active,
		},
		results: make([]*MeasurementResult, 0),
	}
	s.sessionConfigs[config.ID] = config

	log.Printf("Session added: %s (DSCP: %s)", config.Name, DSCPToString(config.DSCP))
	return nil
}

func (s *Server) RemoveSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, sessionID)
	delete(s.sessionConfigs, sessionID)
}

func (s *Server) GetSessions() []*SessionConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	configs := make([]*SessionConfig, 0, len(s.sessionConfigs))
	for _, cfg := range s.sessionConfigs {
		configs = append(configs, cfg)
	}
	sort.Slice(configs, func(i, j int) bool {
		return configs[i].DSCP > configs[j].DSCP
	})
	return configs
}

func (s *Server) Start() error {
	go s.startControlServer()
	go s.startTestServer()
	log.Printf("TWAMP Server started - Control: %s, Test: %s", s.controlAddr, s.testAddr)
	log.Printf("Supported modes: %s", ModeToString(s.supportedModes))
	return nil
}

func (s *Server) Stop() {
	close(s.stopChan)
}

func (s *Server) startControlServer() {
	listener, err := net.Listen("tcp", s.controlAddr)
	if err != nil {
		log.Printf("Control server error: %v", err)
		return
	}
	defer listener.Close()

	for {
		select {
		case <-s.stopChan:
			return
		default:
			conn, err := listener.Accept()
			if err != nil {
				log.Printf("Accept error: %v", err)
				continue
			}
			go s.handleControlConnection(conn)
		}
	}
}

func (s *Server) handleControlConnection(conn net.Conn) {
	defer conn.Close()
	remoteAddr := conn.RemoteAddr().String()
	log.Printf("New control connection from %s", remoteAddr)

	supportedModes := s.GetSupportedModes()
	greeting := make([]byte, 64)
	greeting[0] = byte(MsgServerGreeting)
	binary.BigEndian.PutUint32(greeting[1:5], supportedModes)
	_, err := conn.Write(greeting)
	if err != nil {
		log.Printf("Failed to send greeting: %v", err)
		return
	}
	log.Printf("[%s] Sent ServerGreeting, supported modes: 0x%x", remoteAddr, supportedModes)

	setupBuf := make([]byte, 256)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Read(setupBuf)
	if err != nil {
		log.Printf("[%s] Read setup request error: %v", remoteAddr, err)
		return
	}

	if n < 5 || setupBuf[0] != byte(MsgSetupResponse) {
		log.Printf("[%s] Invalid setup response message", remoteAddr)
		return
	}

	clientMode := binary.BigEndian.Uint32(setupBuf[1:5])
	log.Printf("[%s] Client requested mode: 0x%x", remoteAddr, clientMode)

	negotiatedMode := clientMode & supportedModes
	status := StatusOK

	if negotiatedMode == 0 {
		log.Printf("[%s] No compatible mode found, rejecting", remoteAddr)
		status = StatusModeNotSupported
	}

	response := make([]byte, 32)
	response[0] = byte(MsgStartAck)
	binary.BigEndian.PutUint32(response[1:5], status)

	if status == StatusOK {
		log.Printf("[%s] Mode negotiation successful: %s (0x%x)",
			remoteAddr, ModeToString(negotiatedMode), negotiatedMode)

		_, err = conn.Write(response)
		if err != nil {
			log.Printf("[%s] Failed to send response: %v", remoteAddr, err)
			return
		}

		sessionID := fmt.Sprintf("%s-%d", remoteAddr, time.Now().UnixNano())
		s.mu.Lock()
		s.sessions[sessionID] = &sessionState{
			session: &Session{
				ID:             sessionID,
				SenderAddr:     remoteAddr,
				StartTime:      time.Now(),
				Active:         true,
				NegotiatedMode: negotiatedMode,
				DSCP:           DSCPBE,
				Name:           fmt.Sprintf("Control Session (%s)", remoteAddr),
			},
			results: make([]*MeasurementResult, 0),
		}
		s.sessionConfigs[sessionID] = &SessionConfig{
			ID:         sessionID,
			Name:       fmt.Sprintf("Control Session (%s)", remoteAddr),
			DSCP:       DSCPBE,
			IntervalMs: 100,
			Active:     true,
		}
		s.mu.Unlock()
		log.Printf("[%s] Session %s started with mode: %s",
			remoteAddr, sessionID, ModeToString(negotiatedMode))
	} else {
		_, err = conn.Write(response)
		if err != nil {
			log.Printf("[%s] Failed to send error response: %v", remoteAddr, err)
		}
		log.Printf("[%s] Connection rejected due to mode mismatch", remoteAddr)
	}
}

func (s *Server) startTestServer() {
	conn, err := net.ListenPacket("udp", s.testAddr)
	if err != nil {
		log.Printf("Test server error: %v", err)
		return
	}
	defer conn.Close()

	buf := make([]byte, 1500)

	for {
		select {
		case <-s.stopChan:
			return
		default:
			conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			n, addr, err := conn.ReadFrom(buf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				log.Printf("Read error: %v", err)
				continue
			}

			if n >= 48 {
				pkt := DecodeTestPacket(buf[:n])
				if pkt != nil {
					go s.processPacket(conn, addr, pkt, buf[:n])
				}
			}
		}
	}
}

func (s *Server) processPacket(conn net.PacketConn, addr net.Addr, pkt *TestPacket, rawData []byte) {
	receiveTime := TimeToNTP(time.Now())

	dscp := extractDSCPFromAddr(addr)
	sessionID := s.getSessionForDSCP(dscp, addr)

	profile := getDSCPProfile(dscp)
	simulatedDelay := profile.baseDelay + (rand.Float64()-0.5)*2*profile.jitter

	if rand.Float64() < profile.lossRate {
		return
	}

	rtt := simulatedDelay
	s.processResult(sessionID, pkt, rtt, dscp, receiveTime)

	respPkt := &TestPacket{
		SequenceNumber:   pkt.SequenceNumber,
		Timestamp:        TimeToNTP(time.Now().Add(time.Duration(simulatedDelay/2) * time.Millisecond)),
		ReceiveTimestamp: receiveTime,
		SenderSequence:   pkt.SequenceNumber,
		SenderTimestamp:  pkt.Timestamp,
	}
	respData := EncodeTestPacket(respPkt)
	conn.WriteTo(respData, addr)
}

func (s *Server) processResult(sessionID string, pkt *TestPacket, rtt float64, dscp uint8, receiveTime NTPTimestamp) {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, exists := s.sessions[sessionID]
	if !exists {
		return
	}

	jitter := 0.0
	if state.lastRTT > 0 {
		jitter = abs(rtt - state.lastRTT)
	}
	state.lastRTT = rtt
	state.lastSeq = pkt.SequenceNumber

	sessionName := state.session.Name

	result := &MeasurementResult{
		SessionID:   sessionID,
		SessionName: sessionName,
		Sequence:    pkt.SequenceNumber,
		RTT:         rtt,
		OWDForward:  rtt / 2,
		OWDBackward: rtt / 2,
		Jitter:      jitter,
		DSCP:        dscp,
		Timestamp:   NTPToTime(receiveTime),
	}

	state.results = append(state.results, result)
	if len(state.results) > MaxResultsPerSession {
		state.results = state.results[1:]
	}

	s.allResults = append(s.allResults, result)
	if len(s.allResults) > 10000 {
		s.allResults = s.allResults[1:]
	}
}

func (s *Server) getSessionForDSCP(dscp uint8, addr net.Addr) string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for id, state := range s.sessions {
		if state.session.DSCP == dscp {
			return id
		}
	}

	for id, state := range s.sessions {
		if state.session.DSCP == DSCPBE {
			return id
		}
	}

	if len(s.sessions) > 0 {
		for id := range s.sessions {
			return id
		}
	}

	return addr.String()
}

func getDSCPProfile(dscp uint8) dscpConfig {
	if profile, ok := dscpProfiles[dscp]; ok {
		return profile
	}
	return dscpProfiles[DSCPBE]
}

func extractDSCPFromAddr(addr net.Addr) uint8 {
	return DSCPBE
}

func (s *Server) GetResults() []*MeasurementResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	results := make([]*MeasurementResult, len(s.allResults))
	copy(results, s.allResults)
	return results
}

func (s *Server) GetLatestResults(limit int) []*MeasurementResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if len(s.allResults) == 0 {
		return []*MeasurementResult{}
	}
	start := len(s.allResults) - limit
	if start < 0 {
		start = 0
	}
	results := make([]*MeasurementResult, len(s.allResults)-start)
	copy(results, s.allResults[start:])
	return results
}

func (s *Server) GetSessionResults(sessionID string) []*MeasurementResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	state, exists := s.sessions[sessionID]
	if !exists {
		return []*MeasurementResult{}
	}
	results := make([]*MeasurementResult, len(state.results))
	copy(results, state.results)
	return results
}

func (s *Server) GetSessionCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, sess := range s.sessions {
		if sess.session.Active {
			count++
		}
	}
	return count
}

func (s *Server) GetAllSessionStats() []*SessionStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := make([]*SessionStats, 0, len(s.sessions))
	for id, state := range s.sessions {
		if len(state.results) == 0 {
			stats = append(stats, &SessionStats{
				SessionID:   id,
				SessionName: state.session.Name,
				DSCP:        state.session.DSCP,
				Active:      state.session.Active,
			})
			continue
		}

		var rttMin, rttMax, rttSum, jitterSum float64
		rttMin = state.results[0].RTT
		rttMax = state.results[0].RTT

		for _, r := range state.results {
			rttSum += r.RTT
			jitterSum += r.Jitter
			if r.RTT < rttMin {
				rttMin = r.RTT
			}
			if r.RTT > rttMax {
				rttMax = r.RTT
			}
		}

		count := float64(len(state.results))
		stats = append(stats, &SessionStats{
			SessionID:    id,
			SessionName:  state.session.Name,
			DSCP:         state.session.DSCP,
			TotalPackets: len(state.results),
			RTTMin:       round(rttMin, 3),
			RTTMax:       round(rttMax, 3),
			RTTAvg:       round(rttSum/count, 3),
			JitterAvg:    round(jitterSum/count, 3),
			Active:       state.session.Active,
		})
	}

	sort.Slice(stats, func(i, j int) bool {
		return stats[i].DSCP > stats[j].DSCP
	})
	return stats
}

func (s *Server) GetHistogram(sessionID string, bins int) *HistogramData {
	if bins <= 0 {
		bins = 10
	}

	results := s.GetSessionResults(sessionID)
	if len(results) == 0 {
		return &HistogramData{
			SessionID:   sessionID,
			SessionName: "Unknown",
			Total:       0,
			Bins:        []HistogramBin{},
		}
	}

	s.mu.RLock()
	state, exists := s.sessions[sessionID]
	s.mu.RUnlock()

	sessionName := "Unknown"
	if exists {
		sessionName = state.session.Name
	}

	rttValues := make([]float64, len(results))
	for i, r := range results {
		rttValues[i] = r.RTT
	}

	sort.Float64s(rttValues)
	minVal := rttValues[0]
	maxVal := rttValues[len(rttValues)-1]

	if maxVal == minVal {
		maxVal = minVal + 1
	}

	binWidth := (maxVal - minVal) / float64(bins)
	histogramBins := make([]HistogramBin, bins)

	for i := 0; i < bins; i++ {
		binMin := minVal + float64(i)*binWidth
		binMax := minVal + float64(i+1)*binWidth
		histogramBins[i] = HistogramBin{
			Range: fmt.Sprintf("%.1f-%.1f", binMin, binMax),
			Min:   binMin,
			Max:   binMax,
		}
	}

	for _, val := range rttValues {
		binIdx := int((val - minVal) / binWidth)
		if binIdx >= bins {
			binIdx = bins - 1
		}
		if binIdx >= 0 && binIdx < bins {
			histogramBins[binIdx].Count++
		}
	}

	total := len(rttValues)
	for i := range histogramBins {
		histogramBins[i].Percent = round(float64(histogramBins[i].Count)/float64(total)*100, 2)
	}

	return &HistogramData{
		SessionID:   sessionID,
		SessionName: sessionName,
		Total:       total,
		Bins:        histogramBins,
	}
}

func (s *Server) GetAllHistograms(bins int) []*HistogramData {
	sessions := s.GetSessions()
	histograms := make([]*HistogramData, 0, len(sessions))
	for _, cfg := range sessions {
		hist := s.GetHistogram(cfg.ID, bins)
		histograms = append(histograms, hist)
	}
	return histograms
}

func (s *Server) ClearResults() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.allResults = make([]*MeasurementResult, 0)
	for _, state := range s.sessions {
		state.results = make([]*MeasurementResult, 0)
		state.lastRTT = 0
		state.lastSeq = 0
	}
}

func round(val float64, precision int) float64 {
	multiplier := 1.0
	for i := 0; i < precision; i++ {
		multiplier *= 10
	}
	return float64(int(val*multiplier+0.5)) / multiplier
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

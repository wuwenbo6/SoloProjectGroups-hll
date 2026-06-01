package rtsp

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"rtsp-server/internal/mp4"
	"rtsp-server/internal/rtp"
)

type SessionState int

const (
	StateInit SessionState = iota
	StateSetup
	StatePlaying
	StatePaused
	StateTeardown
)

type MediaTrack struct {
	TrackID        string
	TrackType      mp4.TrackType
	MP4Track       *mp4.Track
	Packetizer     interface{}
	RTPConn        *net.UDPConn
	RTCPConn       *net.UDPConn
	ClientRTPAddr  *net.UDPAddr
	ClientRTCPAddr *net.UDPAddr
	ServerRTPPort  int
	ServerRTCPPort int
	ClientRTPPort  int
	ClientRTCPPort int
	CurrentSample  int
	SetupComplete  bool
}

type SessionStats struct {
	PacketsSent    uint64
	BytesSent      uint64
	VideoFrames    uint64
	AudioFrames    uint64
	StartTime      time.Time
	PauseDuration  time.Duration
	LastPauseTime  time.Time
	VideoBitrate   float64
	AudioBitrate   float64
}

type Session struct {
	ID           string
	State        SessionState
	Client       *Client
	Parser       *mp4.MP4Parser
	Tracks       map[string]*MediaTrack
	mu           sync.Mutex
	stopChan     chan struct{}
	pauseChan    chan struct{}
	resumeChan   chan struct{}
	rangeStart   float64
	rangeEnd     float64
	hasRange     bool
	Stats        SessionStats
	firstFrame   bool
}

type SessionManager struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Session),
	}
}

func (sm *SessionManager) CreateSession(client *Client, parser *mp4.MP4Parser) *Session {
	sessionID := GenerateSessionID()

	session := &Session{
		ID:         sessionID,
		State:      StateInit,
		Client:     client,
		Parser:     parser,
		Tracks:     make(map[string]*MediaTrack),
		stopChan:   make(chan struct{}),
		pauseChan:  make(chan struct{}),
		resumeChan: make(chan struct{}),
		Stats: SessionStats{
			StartTime: time.Now(),
		},
	}

	videoTrack := parser.GetVideoTrack()
	if videoTrack != nil {
		vp := rtp.NewH264Packetizer()
		session.Tracks["track1"] = &MediaTrack{
			TrackID:   "track1",
			TrackType: mp4.TrackTypeVideo,
			MP4Track:  videoTrack,
			Packetizer: vp,
		}
	}

	audioTrack := parser.GetAudioTrack()
	if audioTrack != nil {
		ap := rtp.NewAACPacketizer(audioTrack.SampleRate, audioTrack.Channels)
		session.Tracks["track2"] = &MediaTrack{
			TrackID:   "track2",
			TrackType: mp4.TrackTypeAudio,
			MP4Track:  audioTrack,
			Packetizer: ap,
		}
	}

	sm.mu.Lock()
	sm.sessions[sessionID] = session
	sm.mu.Unlock()

	client.SessionID = sessionID
	return session
}

func (sm *SessionManager) GetSession(id string) *Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.sessions[id]
}

func (sm *SessionManager) RemoveSession(id string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if s, ok := sm.sessions[id]; ok {
		s.Stop()
		delete(sm.sessions, id)
	}
}

func (sm *SessionManager) GetAllSessions() []*Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sessions := make([]*Session, 0, len(sm.sessions))
	for _, s := range sm.sessions {
		sessions = append(sessions, s)
	}
	return sessions
}

func (s *Session) GetTrack(trackID string) *MediaTrack {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Tracks[trackID]
}

func (s *Session) SetupTrack(trackID, clientIP string, clientRTPPort, clientRTCPPort, serverRTPPort, serverRTCPPort int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	track, ok := s.Tracks[trackID]
	if !ok {
		return fmt.Errorf("track not found: %s", trackID)
	}

	if track.SetupComplete {
		return nil
	}

	clientHost, _, err := net.SplitHostPort(clientIP)
	if err != nil {
		clientHost = clientIP
	}

	rtpAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", serverRTPPort))
	if err != nil {
		return fmt.Errorf("resolve rtp addr: %w", err)
	}

	rtpConn, err := net.ListenUDP("udp", rtpAddr)
	if err != nil {
		return fmt.Errorf("listen rtp: %w", err)
	}

	rtcpAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", serverRTCPPort))
	if err != nil {
		rtpConn.Close()
		return fmt.Errorf("resolve rtcp addr: %w", err)
	}

	rtcpConn, err := net.ListenUDP("udp", rtcpAddr)
	if err != nil {
		rtpConn.Close()
		return fmt.Errorf("listen rtcp: %w", err)
	}

	track.RTPConn = rtpConn
	track.RTCPConn = rtcpConn
	track.ServerRTPPort = serverRTPPort
	track.ServerRTCPPort = serverRTCPPort
	track.ClientRTPPort = clientRTPPort
	track.ClientRTCPPort = clientRTCPPort
	track.ClientRTPAddr = &net.UDPAddr{
		IP:   net.ParseIP(clientHost),
		Port: clientRTPPort,
	}
	track.ClientRTCPAddr = &net.UDPAddr{
		IP:   net.ParseIP(clientHost),
		Port: clientRTCPPort,
	}
	track.SetupComplete = true

	s.State = StateSetup

	return nil
}

func (s *Session) AllTracksSetup() bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, track := range s.Tracks {
		if !track.SetupComplete {
			return false
		}
	}
	return len(s.Tracks) > 0
}

func (s *Session) Seek(npt float64) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, track := range s.Tracks {
		sampleIndex := track.MP4Track.GetSampleIndexByTime(npt)
		track.CurrentSample = sampleIndex

		if track.TrackType == mp4.TrackTypeVideo {
			if vp, ok := track.Packetizer.(*rtp.H264Packetizer); ok {
				vp.Timestamp = track.MP4Track.GetRTPTimestampAtSample(sampleIndex, 90000)
			}
		} else if track.TrackType == mp4.TrackTypeAudio {
			if ap, ok := track.Packetizer.(*rtp.AACPacketizer); ok {
				ap.Timestamp = track.MP4Track.GetRTPTimestampAtSample(sampleIndex, track.MP4Track.SampleRate)
			}
		}
	}

	s.firstFrame = true
}

func (s *Session) allTracksSetupLocked() bool {
	for _, track := range s.Tracks {
		if !track.SetupComplete {
			return false
		}
	}
	return len(s.Tracks) > 0
}

func (s *Session) PlayWithRange(npt *NPTTime) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.allTracksSetupLocked() {
		return fmt.Errorf("tracks not fully setup")
	}

	if npt != nil {
		s.rangeStart = npt.Start
		s.rangeEnd = npt.End
		s.hasRange = true

		for _, track := range s.Tracks {
			sampleIndex := track.MP4Track.GetSampleIndexByTime(npt.Start)
			track.CurrentSample = sampleIndex

			if track.TrackType == mp4.TrackTypeVideo {
				if vp, ok := track.Packetizer.(*rtp.H264Packetizer); ok {
					vp.Timestamp = track.MP4Track.GetRTPTimestampAtSample(sampleIndex, 90000)
				}
			} else if track.TrackType == mp4.TrackTypeAudio {
				if ap, ok := track.Packetizer.(*rtp.AACPacketizer); ok {
					ap.Timestamp = track.MP4Track.GetRTPTimestampAtSample(sampleIndex, track.MP4Track.SampleRate)
				}
			}
		}
	} else {
		s.hasRange = false
	}

	if s.State == StatePlaying {
		return nil
	}

	if s.State == StatePaused {
		s.Stats.PauseDuration += time.Since(s.Stats.LastPauseTime)
		select {
		case s.resumeChan <- struct{}{}:
		default:
		}
		s.State = StatePlaying
		s.Client.IsPaused = false
		s.Client.IsPlaying = true
		return nil
	}

	s.State = StatePlaying
	s.Client.IsPlaying = true
	s.Client.IsPaused = false
	s.firstFrame = true
	s.Stats.StartTime = time.Now()

	go s.streamLoop()

	return nil
}

func (s *Session) Play() error {
	return s.PlayWithRange(nil)
}

func (s *Session) Pause() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.State != StatePlaying {
		return nil
	}

	s.State = StatePaused
	s.Client.IsPaused = true
	s.Stats.LastPauseTime = time.Now()

	select {
	case s.pauseChan <- struct{}{}:
	default:
	}

	return nil
}

func (s *Session) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.State == StateTeardown {
		return
	}

	s.State = StateTeardown
	s.Client.IsPlaying = false
	s.Client.IsPaused = false

	select {
	case s.stopChan <- struct{}{}:
	default:
	}

	for _, track := range s.Tracks {
		if track.RTPConn != nil {
			track.RTPConn.Close()
		}
		if track.RTCPConn != nil {
			track.RTCPConn.Close()
		}
	}
}

func (s *Session) streamLoop() {
	s.mu.Lock()
	videoTrack := s.Tracks["track1"]
	audioTrack := s.Tracks["track2"]
	s.mu.Unlock()

	var wg sync.WaitGroup

	if videoTrack != nil && videoTrack.SetupComplete {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.videoStreamLoop(videoTrack)
		}()
	}

	if audioTrack != nil && audioTrack.SetupComplete {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.audioStreamLoop(audioTrack)
		}()
	}

	wg.Wait()
}

func (s *Session) videoStreamLoop(track *MediaTrack) {
	ticker := time.NewTicker(track.MP4Track.GetSampleDuration())
	defer ticker.Stop()

	sendVideoNALU := func(nalu []byte, tsInc uint32) {
		if vp, ok := track.Packetizer.(*rtp.H264Packetizer); ok {
			packets := vp.Packetize(nalu, tsInc)
			for _, pkt := range packets {
				if track.RTPConn == nil {
					return
				}
				_, err := track.RTPConn.WriteToUDP(pkt, track.ClientRTPAddr)
				if err != nil {
					return
				}
				atomic.AddUint64(&s.Stats.PacketsSent, 1)
				atomic.AddUint64(&s.Stats.BytesSent, uint64(len(pkt)))
			}
		}
	}

	firstFrame := true
	paused := false

	for {
		select {
		case <-s.stopChan:
			return
		case <-s.pauseChan:
			paused = true
			select {
			case <-s.resumeChan:
				paused = false
				firstFrame = true
			case <-s.stopChan:
				return
			}
		case <-ticker.C:
			if paused {
				continue
			}

			if track.CurrentSample >= len(track.MP4Track.Samples) {
				if s.hasRange && s.rangeEnd > 0 {
					continue
				}
				track.CurrentSample = 0
				firstFrame = true
			}

			if s.hasRange && s.rangeEnd > 0 {
				currentTime := float64(track.MP4Track.GetRTPTimestampAtSample(track.CurrentSample, 90000)) / 90000.0
				if currentTime >= s.rangeEnd {
					continue
				}
			}

			if firstFrame {
				sendVideoNALU(track.MP4Track.SPS, 0)
				sendVideoNALU(track.MP4Track.PPS, 0)
				firstFrame = false
			}

			sample := track.MP4Track.Samples[track.CurrentSample]
			sampleIndex := track.CurrentSample
			track.CurrentSample++

			timestampInc := track.MP4Track.GetSampleTimestampIncrement(sampleIndex, 90000)

			nalus := track.MP4Track.ExtractNALUs(sample.Data)

			for i, nalu := range nalus {
				tsInc := uint32(0)
				if i == 0 {
					tsInc = timestampInc
				}
				sendVideoNALU(nalu, tsInc)
			}

			atomic.AddUint64(&s.Stats.VideoFrames, 1)
		}
	}
}

func (s *Session) audioStreamLoop(track *MediaTrack) {
	ticker := time.NewTicker(track.MP4Track.GetSampleDuration())
	defer ticker.Stop()

	sendAudioFrame := func(frame []byte, tsInc uint32) {
		if ap, ok := track.Packetizer.(*rtp.AACPacketizer); ok {
			packets := ap.Packetize(frame, tsInc)
			for _, pkt := range packets {
				if track.RTPConn == nil {
					return
				}
				_, err := track.RTPConn.WriteToUDP(pkt, track.ClientRTPAddr)
				if err != nil {
					return
				}
				atomic.AddUint64(&s.Stats.PacketsSent, 1)
				atomic.AddUint64(&s.Stats.BytesSent, uint64(len(pkt)))
			}
		}
	}

	paused := false

	for {
		select {
		case <-s.stopChan:
			return
		case <-s.pauseChan:
			paused = true
			select {
			case <-s.resumeChan:
				paused = false
			case <-s.stopChan:
				return
			}
		case <-ticker.C:
			if paused {
				continue
			}

			if track.CurrentSample >= len(track.MP4Track.Samples) {
				if s.hasRange && s.rangeEnd > 0 {
					continue
				}
				track.CurrentSample = 0
			}

			sample := track.MP4Track.Samples[track.CurrentSample]
			sampleIndex := track.CurrentSample
			track.CurrentSample++

			timestampInc := track.MP4Track.GetSampleTimestampIncrement(sampleIndex, track.MP4Track.SampleRate)

			sendAudioFrame(sample.Data, timestampInc)

			atomic.AddUint64(&s.Stats.AudioFrames, 1)
		}
	}
}

func (s *Session) GetStats() SessionStats {
	s.mu.Lock()
	defer s.mu.Unlock()

	stats := s.Stats

	if stats.PacketsSent > 0 {
		elapsed := time.Since(stats.StartTime) - stats.PauseDuration
		if elapsed > 0 {
			stats.VideoBitrate = float64(stats.BytesSent*8) / elapsed.Seconds() / 1000
		}
	}

	return stats
}

func (s *Session) GetTransportHeader(trackID string) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	track, ok := s.Tracks[trackID]
	if !ok {
		return ""
	}

	return fmt.Sprintf("RTP/AVP;unicast;client_port=%d-%d;server_port=%d-%d",
		track.ClientRTPPort, track.ClientRTCPPort,
		track.ServerRTPPort, track.ServerRTCPPort)
}

func (s *Session) GetRangeHeader() string {
	if s.hasRange {
		npt := &NPTTime{
			Start:  s.rangeStart,
			End:    s.rangeEnd,
			HasEnd: s.rangeEnd > 0,
		}
		return npt.String()
	}
	return "npt=0.000-"
}

type NPTTime struct {
	Start  float64
	End    float64
	HasEnd bool
}

func ParseRangeHeader(rangeStr string) (*NPTTime, error) {
	if rangeStr == "" {
		return nil, nil
	}

	parts := strings.SplitN(rangeStr, "=", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid range format: %s", rangeStr)
	}

	rangeType := strings.TrimSpace(parts[0])
	if strings.ToLower(rangeType) != "npt" {
		return nil, fmt.Errorf("unsupported range type: %s", rangeType)
	}

	timeParts := strings.SplitN(strings.TrimSpace(parts[1]), "-", 2)
	if len(timeParts) == 0 {
		return nil, fmt.Errorf("invalid npt format: %s", parts[1])
	}

	npt := &NPTTime{}

	startStr := strings.TrimSpace(timeParts[0])
	if startStr == "" {
		npt.Start = 0
	} else {
		start, err := parseNPTTime(startStr)
		if err != nil {
			return nil, fmt.Errorf("parse npt start: %w", err)
		}
		npt.Start = start
	}

	if len(timeParts) == 2 {
		endStr := strings.TrimSpace(timeParts[1])
		if endStr != "" {
			end, err := parseNPTTime(endStr)
			if err != nil {
				return nil, fmt.Errorf("parse npt end: %w", err)
			}
			npt.End = end
			npt.HasEnd = true
		}
	}

	return npt, nil
}

func parseNPTTime(timeStr string) (float64, error) {
	timeStr = strings.TrimSpace(timeStr)

	if strings.HasPrefix(timeStr, "npt=") {
		timeStr = timeStr[4:]
	}

	if n, err := strconv.ParseFloat(timeStr, 64); err == nil {
		return n, nil
	}

	if strings.Contains(timeStr, ":") {
		return parseNPTTimeFormat(timeStr)
	}

	return 0, fmt.Errorf("invalid npt time format: %s", timeStr)
}

func parseNPTTimeFormat(timeStr string) (float64, error) {
	parts := strings.Split(timeStr, ":")
	var hours, minutes, seconds float64
	var err error

	if len(parts) == 3 {
		hours, err = strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, err
		}
		minutes, err = strconv.ParseFloat(parts[1], 64)
		if err != nil {
			return 0, err
		}
		seconds, err = strconv.ParseFloat(parts[2], 64)
		if err != nil {
			return 0, err
		}
	} else if len(parts) == 2 {
		minutes, err = strconv.ParseFloat(parts[0], 64)
		if err != nil {
			return 0, err
		}
		seconds, err = strconv.ParseFloat(parts[1], 64)
		if err != nil {
			return 0, err
		}
	} else {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}

	return hours*3600 + minutes*60 + seconds, nil
}

func (n *NPTTime) String() string {
	if n.HasEnd {
		return fmt.Sprintf("npt=%.3f-%.3f", n.Start, n.End)
	}
	return fmt.Sprintf("npt=%.3f-", n.Start)
}

func FindAvailableUDPPortPair() (int, int, error) {
	conn1, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("0.0.0.0"), Port: 0})
	if err != nil {
		return 0, 0, err
	}
	defer conn1.Close()

	port1 := conn1.LocalAddr().(*net.UDPAddr).Port

	conn2, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("0.0.0.0"), Port: 0})
	if err != nil {
		return 0, 0, err
	}
	defer conn2.Close()

	port2 := conn2.LocalAddr().(*net.UDPAddr).Port

	if port2 == port1+1 {
		return port1, port2, nil
	}

	return port1, port2, nil
}

func ParseCSeq(headers map[string]string) int {
	if cseq, ok := headers["CSeq"]; ok {
		if n, err := strconv.Atoi(cseq); err == nil {
			return n
		}
	}
	if cseq, ok := headers["cseq"]; ok {
		if n, err := strconv.Atoi(cseq); err == nil {
			return n
		}
	}
	return 0
}

func (s *SessionStats) String() string {
	elapsed := time.Since(s.StartTime) - s.PauseDuration
	return fmt.Sprintf(
		"PacketsSent: %d, BytesSent: %d, VideoFrames: %d, AudioFrames: %d, Elapsed: %v, Bitrate: %.2f kbps",
		s.PacketsSent, s.BytesSent, s.VideoFrames, s.AudioFrames,
		elapsed.Round(time.Second), s.VideoBitrate,
	)
}

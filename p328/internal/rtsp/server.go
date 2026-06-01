package rtsp

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"rtsp-server/internal/mp4"
	"rtsp-server/internal/rtp"
	"rtsp-server/internal/sdp"
)

type Server struct {
	Addr           string
	VideoFile      string
	listener       net.Listener
	sessionManager *SessionManager
	parser         *mp4.MP4Parser
}

func NewServer(addr, videoFile string) (*Server, error) {
	parser, err := mp4.NewMP4Parser(videoFile)
	if err != nil {
		return nil, fmt.Errorf("parse video file: %w", err)
	}

	log.Printf("Video file loaded: %s", videoFile)

	videoTrack := parser.GetVideoTrack()
	if videoTrack != nil {
		log.Printf("  Video: %dx%d, %.2f FPS, %d samples, %d kHz",
			videoTrack.Width, videoTrack.Height, videoTrack.FPS,
			len(videoTrack.Samples), videoTrack.Timescale/1000)
	}

	audioTrack := parser.GetAudioTrack()
	if audioTrack != nil {
		log.Printf("  Audio: %d channels, %d kHz, %d samples",
			audioTrack.Channels, audioTrack.SampleRate, len(audioTrack.Samples))
	}

	return &Server{
		Addr:           addr,
		VideoFile:      videoFile,
		sessionManager: NewSessionManager(),
		parser:         parser,
	}, nil
}

func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.Addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	s.listener = listener

	log.Printf("RTSP Server listening on %s", s.Addr)
	log.Printf("Stream URL: rtsp://%s/live", s.Addr)
	log.Printf("Stats URL: rtsp://%s/stats", s.Addr)

	go s.printStatsPeriodically()

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}

		go s.handleClient(conn)
	}
}

func (s *Server) Stop() error {
	if s.listener != nil {
		return s.listener.Close()
	}
	if s.parser != nil {
		s.parser.Close()
	}
	return nil
}

func (s *Server) handleClient(conn net.Conn) {
	client := NewClient(conn)
	defer conn.Close()

	log.Printf("New client connected: %s", conn.RemoteAddr())

	var session *Session

	for {
		req, err := client.ReadRequest()
		if err != nil {
			log.Printf("Read request error from %s: %v", conn.RemoteAddr(), err)
			if session != nil {
				s.sessionManager.RemoveSession(session.ID)
			}
			return
		}

		log.Printf("[%s] %s %s", conn.RemoteAddr(), req.Method, req.URL)

		if strings.Contains(req.URL, "/stats") {
			resp := s.handleStats(req, client)
			if resp != nil {
				if _, ok := resp.Headers["CSeq"]; !ok {
					resp.Headers["CSeq"] = strconv.Itoa(ParseCSeq(req.Headers))
				}
				client.SendResponse(resp)
			}
			continue
		}

		var resp *Response

		switch req.Method {
		case MethodOptions:
			resp = s.handleOptions(req, client, session)
		case MethodDescribe:
			resp = s.handleDescribe(req, client)
		case MethodSetup:
			resp, session = s.handleSetup(req, client, session)
		case MethodPlay:
			resp = s.handlePlay(req, client, session)
		case MethodPause:
			resp = s.handlePause(req, client, session)
		case MethodTeardown:
			resp = s.handleTeardown(req, client, session)
			if err := client.SendResponse(resp); err == nil {
				if session != nil {
					s.sessionManager.RemoveSession(session.ID)
				}
				return
			}
		case MethodGetParam:
			resp = s.handleGetParameter(req, client, session)
		default:
			resp = NewResponse(501, "Not Implemented")
			resp.Headers["CSeq"] = strconv.Itoa(ParseCSeq(req.Headers))
		}

		if resp != nil {
			if _, ok := resp.Headers["CSeq"]; !ok {
				resp.Headers["CSeq"] = strconv.Itoa(ParseCSeq(req.Headers))
			}

			if err := client.SendResponse(resp); err != nil {
				log.Printf("Send response error to %s: %v", conn.RemoteAddr(), err)
				if session != nil {
					s.sessionManager.RemoveSession(session.ID)
				}
				return
			}
		}
	}
}

func (s *Server) handleOptions(req *Request, client *Client, session *Session) *Response {
	resp := NewResponse(200, "OK")
	resp.Headers["Public"] = "OPTIONS, DESCRIBE, SETUP, PLAY, PAUSE, TEARDOWN, GET_PARAMETER"
	return resp
}

func (s *Server) handleDescribe(req *Request, client *Client) *Response {
	var sdpContent string

	videoTrack := s.parser.GetVideoTrack()
	audioTrack := s.parser.GetAudioTrack()

	if videoTrack != nil && audioTrack != nil {
		sdpContent = sdp.BuildAudioVideoSDP(
			videoTrack.SPS, videoTrack.PPS,
			audioTrack.ASC,
			int(audioTrack.SampleRate),
			int(audioTrack.Channels),
		)
	} else if videoTrack != nil {
		sdpContent = sdp.BuildVideoSDP(videoTrack.SPS, videoTrack.PPS, "track1")
	}

	resp := NewResponse(200, "OK")
	resp.Headers["Content-Type"] = "application/sdp"
	resp.Body = []byte(sdpContent)
	return resp
}

func (s *Server) handleSetup(req *Request, client *Client, session *Session) (*Response, *Session) {
	clientRTPPort, clientRTCPPort, _, _ := ParseTransport(req.Transport)

	if clientRTPPort == 0 {
		resp := NewResponse(400, "Bad Request")
		return resp, session
	}

	trackID := "track1"
	urlParts := strings.Split(req.URL, "/")
	if len(urlParts) > 0 {
		lastPart := urlParts[len(urlParts)-1]
		if strings.HasPrefix(lastPart, "track") {
			trackID = lastPart
		}
	}

	if session == nil {
		session = s.sessionManager.CreateSession(client, s.parser)
	}

	serverRTPPort, serverRTCPPort, err := FindAvailableUDPPortPair()
	if err != nil {
		resp := NewResponse(500, "Internal Server Error")
		return resp, session
	}

	clientIP := client.Conn.RemoteAddr().String()

	err = session.SetupTrack(trackID, clientIP, clientRTPPort, clientRTCPPort, serverRTPPort, serverRTCPPort)
	if err != nil {
		log.Printf("Setup error for %s: %v", trackID, err)
		resp := NewResponse(500, "Internal Server Error")
		return resp, session
	}

	resp := NewResponse(200, "OK")
	resp.Headers["Transport"] = session.GetTransportHeader(trackID)
	resp.Headers["Session"] = session.ID

	log.Printf("Setup %s for client %s: client_port=%d-%d, server_port=%d-%d",
		trackID, clientIP, clientRTPPort, clientRTCPPort, serverRTPPort, serverRTCPPort)

	return resp, session
}

func (s *Server) handlePlay(req *Request, client *Client, session *Session) *Response {
	if session == nil {
		resp := NewResponse(454, "Session Not Found")
		return resp
	}

	if !session.AllTracksSetup() {
		resp := NewResponse(400, "Bad Request")
		resp.Body = []byte("Not all tracks are setup")
		return resp
	}

	var npt *NPTTime
	var err error

	rangeHeader := req.Headers["Range"]
	if rangeHeader == "" {
		rangeHeader = req.Headers["range"]
	}

	if rangeHeader != "" {
		npt, err = ParseRangeHeader(rangeHeader)
		if err != nil {
			log.Printf("Parse Range header error: %v", err)
			resp := NewResponse(400, "Bad Request")
			return resp
		}
	}

	err = session.PlayWithRange(npt)
	if err != nil {
		log.Printf("Play error: %v", err)
		resp := NewResponse(500, "Internal Server Error")
		return resp
	}

	if npt != nil {
		log.Printf("Client %s started playing from %.3fs", client.Conn.RemoteAddr(), npt.Start)
	} else {
		log.Printf("Client %s started playing", client.Conn.RemoteAddr())
	}

	resp := NewResponse(200, "OK")
	resp.Headers["Range"] = session.GetRangeHeader()
	resp.Headers["Session"] = session.ID

	rtpInfo := s.buildRTPInfo(session)
	if rtpInfo != "" {
		resp.Headers["RTP-Info"] = rtpInfo
	}

	return resp
}

func (s *Server) buildRTPInfo(session *Session) string {
	var parts []string

	for trackID, track := range session.Tracks {
		if !track.SetupComplete {
			continue
		}

		var seq uint16
		var ts uint32

		if track.TrackType == mp4.TrackTypeVideo {
			if vp, ok := track.Packetizer.(*rtp.H264Packetizer); ok {
				seq = vp.SequenceNum
				ts = vp.Timestamp
			}
		} else if track.TrackType == mp4.TrackTypeAudio {
			if ap, ok := track.Packetizer.(*rtp.AACPacketizer); ok {
				seq = ap.SequenceNum
				ts = ap.Timestamp
			}
		}

		part := fmt.Sprintf("url=rtsp://%s/live/%s;seq=%d;rtptime=%d",
			s.Addr, trackID, seq, ts)
		parts = append(parts, part)
	}

	return strings.Join(parts, ",")
}

func (s *Server) handlePause(req *Request, client *Client, session *Session) *Response {
	if session == nil {
		resp := NewResponse(454, "Session Not Found")
		return resp
	}

	err := session.Pause()
	if err != nil {
		log.Printf("Pause error: %v", err)
		resp := NewResponse(500, "Internal Server Error")
		return resp
	}

	log.Printf("Client %s paused", client.Conn.RemoteAddr())

	resp := NewResponse(200, "OK")
	resp.Headers["Session"] = session.ID
	return resp
}

func (s *Server) handleTeardown(req *Request, client *Client, session *Session) *Response {
	if session != nil {
		stats := session.GetStats()
		log.Printf("Client %s teardown session. Stats: %s", client.Conn.RemoteAddr(), stats.String())
		session.Stop()
	}

	resp := NewResponse(200, "OK")
	if session != nil {
		resp.Headers["Session"] = session.ID
	}
	return resp
}

func (s *Server) handleGetParameter(req *Request, client *Client, session *Session) *Response {
	if session == nil {
		resp := NewResponse(454, "Session Not Found")
		return resp
	}

	stats := session.GetStats()

	resp := NewResponse(200, "OK")
	resp.Headers["Content-Type"] = "text/plain"
	resp.Body = []byte(fmt.Sprintf("packets_sent=%d\r\n"+
		"bytes_sent=%d\r\n"+
		"video_frames=%d\r\n"+
		"audio_frames=%d\r\n"+
		"bitrate_kbps=%.2f\r\n",
		stats.PacketsSent, stats.BytesSent,
		stats.VideoFrames, stats.AudioFrames,
		stats.VideoBitrate))

	return resp
}

type StatsResponse struct {
	Server struct {
		Address     string `json:"address"`
		VideoFile   string `json:"video_file"`
		TotalSessions int `json:"total_sessions"`
	} `json:"server"`

	Sessions []SessionStatsInfo `json:"sessions"`
}

type SessionStatsInfo struct {
	ID             string  `json:"id"`
	Client         string  `json:"client"`
	State          string  `json:"state"`
	PacketsSent    uint64  `json:"packets_sent"`
	BytesSent      uint64  `json:"bytes_sent"`
	VideoFrames    uint64  `json:"video_frames"`
	AudioFrames    uint64  `json:"audio_frames"`
	ElapsedSeconds float64 `json:"elapsed_seconds"`
	BitrateKbps    float64 `json:"bitrate_kbps"`
	ActiveTracks   int     `json:"active_tracks"`
}

func (s *Server) handleStats(req *Request, client *Client) *Response {
	allSessions := s.sessionManager.GetAllSessions()

	statsResp := StatsResponse{}
	statsResp.Server.Address = s.Addr
	statsResp.Server.VideoFile = filepath.Base(s.VideoFile)
	statsResp.Server.TotalSessions = len(allSessions)

	statsResp.Sessions = make([]SessionStatsInfo, 0, len(allSessions))

	for _, sess := range allSessions {
		stats := sess.GetStats()

		elapsed := time.Since(stats.StartTime) - stats.PauseDuration

		activeTracks := 0
		for _, t := range sess.Tracks {
			if t.SetupComplete {
				activeTracks++
			}
		}

		stateStr := "UNKNOWN"
		switch sess.State {
		case StateInit:
			stateStr = "INIT"
		case StateSetup:
			stateStr = "SETUP"
		case StatePlaying:
			stateStr = "PLAYING"
		case StatePaused:
			stateStr = "PAUSED"
		case StateTeardown:
			stateStr = "TEARDOWN"
		}

		info := SessionStatsInfo{
			ID:             sess.ID,
			Client:         client.Conn.RemoteAddr().String(),
			State:          stateStr,
			PacketsSent:    stats.PacketsSent,
			BytesSent:      stats.BytesSent,
			VideoFrames:    stats.VideoFrames,
			AudioFrames:    stats.AudioFrames,
			ElapsedSeconds: elapsed.Seconds(),
			BitrateKbps:    stats.VideoBitrate,
			ActiveTracks:   activeTracks,
		}
		statsResp.Sessions = append(statsResp.Sessions, info)
	}

	jsonData, err := json.MarshalIndent(statsResp, "", "  ")
	if err != nil {
		resp := NewResponse(500, "Internal Server Error")
		return resp
	}

	resp := NewResponse(200, "OK")
	resp.Headers["Content-Type"] = "application/json"
	resp.Body = jsonData

	return resp
}

func (s *Server) printStatsPeriodically() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		allSessions := s.sessionManager.GetAllSessions()
		if len(allSessions) == 0 {
			continue
		}

		log.Printf("=== Server Stats ===")
		log.Printf("Total sessions: %d", len(allSessions))

		for _, sess := range allSessions {
			stats := sess.GetStats()
			log.Printf("Session %s: %s", sess.ID, stats.String())
		}
		log.Printf("===================")
	}
}

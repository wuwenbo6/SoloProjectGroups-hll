package coa

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
	"time"

	"radius-coa-server/internal/audit"
	"radius-coa-server/internal/radius"
	"radius-coa-server/internal/session"
)

type Server struct {
	conn       net.PacketConn
	sessionMgr *session.Manager
	secret     string
	addr       string
}

type CoARequest struct {
	SessionID     string `json:"session_id"`
	Username      string `json:"username"`
	NASIP         string `json:"nas_ip"`
	UploadSpeed   int64  `json:"upload_speed"`
	DownloadSpeed int64  `json:"download_speed"`
}

type CoAResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func extractIP(addr string) string {
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}

func NewServer(secret, addr string, sessionMgr *session.Manager) *Server {
	return &Server{
		secret:     secret,
		addr:       addr,
		sessionMgr: sessionMgr,
	}
}

func (s *Server) Start(ctx context.Context) error {
	conn, err := net.ListenPacket("udp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", s.addr, err)
	}
	s.conn = conn

	log.Printf("RADIUS CoA server starting on %s", s.addr)

	go func() {
		<-ctx.Done()
		_ = s.conn.Close()
	}()

	buf := make([]byte, 4096)
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
			_ = s.conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			n, remoteAddr, err := s.conn.ReadFrom(buf)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue
				}
				if ctx.Err() != nil {
					return nil
				}
				return fmt.Errorf("read error: %w", err)
			}

			packet, err := radius.ParsePacket(buf[:n])
			if err != nil {
				log.Printf("Failed to parse CoA packet from %s: %v", remoteAddr, err)
				continue
			}

			req := &radius.Request{
				Packet:     packet,
				RemoteAddr: remoteAddr,
				LocalAddr:  s.conn.LocalAddr(),
			}

			w := radius.NewResponseWriter(s.conn, remoteAddr, req, []byte(s.secret))

			go s.handleCoA(w, req)
		}
	}
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.conn != nil {
		return s.conn.Close()
	}
	return nil
}

func (s *Server) handleCoA(w *radius.ResponseWriter, r *radius.Request) {
	code := r.Packet.Code
	log.Printf("CoA request: code=%d, from=%s", code, r.RemoteAddr)

	switch code {
	case radius.CodeDisconnectRequest:
		s.handleDisconnect(w, r)
	case radius.CodeCoARequest:
		s.handleCoAUpdate(w, r)
	default:
		log.Printf("Unsupported CoA code: %d", code)
		resp := radius.NewPacket(radius.CodeAccessReject, []byte(s.secret))
		_ = w.Write(resp)
	}
}

func (s *Server) handleDisconnect(w *radius.ResponseWriter, r *radius.Request) {
	sessionID := r.Packet.GetString(radius.AttrAcctSessionID)
	username := r.Packet.GetString(radius.AttrUserName)
	nasIP := r.Packet.GetIP(radius.AttrNASIPAddress).String()
	operatorIP := extractIP(r.RemoteAddr.String())

	log.Printf("Disconnect request: session=%s, username=%s, nas_ip=%s, from=%s", sessionID, username, nasIP, operatorIP)

	var targetSessions []*session.Session

	if username != "" && sessionID != "" {
		if ses, ok := s.sessionMgr.GetByUsernameAndSessionID(username, sessionID); ok {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			} else {
				log.Printf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP)
				audit.GetLogger().LogDisconnect(username, sessionID, nasIP, operatorIP, "NAS IP mismatch", false,
					fmt.Sprintf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP))
			}
		}
	} else if sessionID != "" {
		if ses, ok := s.sessionMgr.Get(sessionID); ok {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			} else {
				log.Printf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP)
				audit.GetLogger().LogDisconnect(ses.Username, sessionID, nasIP, operatorIP, "NAS IP mismatch", false,
					fmt.Sprintf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP))
			}
		}
	} else if username != "" {
		sessions := s.sessionMgr.GetByUsername(username)
		for _, ses := range sessions {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			}
		}
	}

	if len(targetSessions) == 0 {
		log.Printf("Session not found or NAS IP mismatch for disconnect")
		audit.GetLogger().LogDisconnect(username, sessionID, nasIP, operatorIP, "Session not found", false,
			"Session not found or NAS IP mismatch")
		resp := radius.NewPacket(radius.CodeDisconnectNAK, []byte(s.secret))
		resp.AddUint32(radius.AttrErrorCause, 503)
		_ = w.Write(resp)
		return
	}

	for _, ses := range targetSessions {
		s.sessionMgr.UpdateStatus(ses.ID, "disconnected")
		log.Printf("Disconnected session: %s", ses.ID)
		audit.GetLogger().LogDisconnect(ses.Username, ses.ID, ses.NASIP, operatorIP, "CoA Disconnect-Request", true,
			"Session disconnected via CoA")
	}

	_ = w.Write(radius.NewPacket(radius.CodeDisconnectACK, []byte(s.secret)))
}

func (s *Server) handleCoAUpdate(w *radius.ResponseWriter, r *radius.Request) {
	sessionID := r.Packet.GetString(radius.AttrAcctSessionID)
	username := r.Packet.GetString(radius.AttrUserName)
	nasIP := r.Packet.GetIP(radius.AttrNASIPAddress).String()
	filterID := r.Packet.GetString(radius.AttrFilterID)
	operatorIP := extractIP(r.RemoteAddr.String())

	log.Printf("CoA update request: session=%s, username=%s, nas_ip=%s, filter=%s, from=%s", sessionID, username, nasIP, filterID, operatorIP)

	var targetSessions []*session.Session

	if username != "" && sessionID != "" {
		if ses, ok := s.sessionMgr.GetByUsernameAndSessionID(username, sessionID); ok {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			} else {
				log.Printf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP)
				audit.GetLogger().LogPolicyUpdate(username, sessionID, nasIP, operatorIP,
					ses.Policy, parseFilterID(filterID), false,
					fmt.Sprintf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP))
			}
		}
	} else if sessionID != "" {
		if ses, ok := s.sessionMgr.Get(sessionID); ok {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			} else {
				log.Printf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP)
				audit.GetLogger().LogPolicyUpdate(ses.Username, sessionID, nasIP, operatorIP,
					ses.Policy, parseFilterID(filterID), false,
					fmt.Sprintf("NAS IP mismatch: request=%s, session=%s", nasIP, ses.NASIP))
			}
		}
	} else if username != "" {
		sessions := s.sessionMgr.GetByUsername(username)
		for _, ses := range sessions {
			if nasIP == "" || ses.NASIP == nasIP {
				targetSessions = append(targetSessions, ses)
			}
		}
	}

	if len(targetSessions) == 0 {
		log.Printf("Session not found or NAS IP mismatch for CoA update")
		newPolicy := parseFilterID(filterID)
		audit.GetLogger().LogPolicyUpdate(username, sessionID, nasIP, operatorIP,
			session.Policy{}, newPolicy, false, "Session not found or NAS IP mismatch")
		resp := radius.NewPacket(radius.CodeCoANAK, []byte(s.secret))
		resp.AddUint32(radius.AttrErrorCause, 503)
		_ = w.Write(resp)
		return
	}

	newPolicy := parseFilterID(filterID)

	for _, ses := range targetSessions {
		oldPolicy := ses.Policy
		updated := s.sessionMgr.UpdatePolicy(ses.ID, newPolicy)
		if updated {
			log.Printf("Updated policy for session %s: up=%d, down=%d", ses.ID, newPolicy.UploadSpeed, newPolicy.DownloadSpeed)
			audit.GetLogger().LogPolicyUpdate(ses.Username, ses.ID, ses.NASIP, operatorIP,
				oldPolicy, newPolicy, true, "Policy updated via CoA")
		}
	}

	_ = w.Write(radius.NewPacket(radius.CodeCoAACK, []byte(s.secret)))
}

func parseFilterID(filterID string) session.Policy {
	policy := session.Policy{
		UploadSpeed:   10 * 1024 * 1024,
		DownloadSpeed: 50 * 1024 * 1024,
	}

	if filterID == "" {
		return policy
	}

	_, err := fmt.Sscanf(filterID, "Rate-Limit:up=%d,down=%d", &policy.UploadSpeed, &policy.DownloadSpeed)
	if err != nil {
		return policy
	}

	policy.UploadSpeed *= 1024
	policy.DownloadSpeed *= 1024

	return policy
}

func (s *Server) SendCoA(req CoARequest) (*CoAResult, error) {
	ses, ok := s.sessionMgr.Get(req.SessionID)
	if !ok {
		return &CoAResult{Success: false, Message: "Session not found"}, nil
	}

	packet := radius.NewPacket(radius.CodeCoARequest, []byte(s.secret))
	packet.AddString(radius.AttrUserName, ses.Username)
	packet.AddString(radius.AttrAcctSessionID, ses.ID)

	filterID := fmt.Sprintf("Rate-Limit:up=%d,down=%d", req.UploadSpeed/1024, req.DownloadSpeed/1024)
	packet.AddString(radius.AttrFilterID, filterID)

	_ = s.sessionMgr.UpdatePolicy(req.SessionID, session.Policy{
		UploadSpeed:   req.UploadSpeed,
		DownloadSpeed: req.DownloadSpeed,
	})

	nasAddr := fmt.Sprintf("%s:3799", ses.NASIP)
	log.Printf("Sending CoA request to %s for session %s", nasAddr, req.SessionID)

	conn, err := net.DialTimeout("udp", nasAddr, 3*time.Second)
	if err != nil {
		log.Printf("CoA connect failed: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Policy updated locally, NAS notification failed: " + err.Error(),
		}, nil
	}
	defer conn.Close()

	data, err := packet.Encode()
	if err != nil {
		return nil, err
	}

	_, err = conn.Write(data)
	if err != nil {
		log.Printf("CoA send failed: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Policy updated locally, NAS notification failed: " + err.Error(),
		}, nil
	}

	buf := make([]byte, 4096)
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, err := conn.Read(buf)
	if err != nil {
		log.Printf("CoA response timeout: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Policy updated locally, NAS response timeout",
		}, nil
	}

	resp, err := radius.ParsePacket(buf[:n])
	if err != nil {
		log.Printf("CoA response parse failed: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Policy updated locally, NAS response invalid",
		}, nil
	}

	if resp.Code == radius.CodeCoAACK {
		return &CoAResult{
			Success: true,
			Message: "Policy updated successfully",
		}, nil
	}

	return &CoAResult{
		Success: false,
		Message: fmt.Sprintf("NAS rejected CoA request: code=%d", resp.Code),
	}, nil
}

func (s *Server) SendDisconnect(sessionID string) (*CoAResult, error) {
	ses, ok := s.sessionMgr.Get(sessionID)
	if !ok {
		return &CoAResult{Success: false, Message: "Session not found"}, nil
	}

	s.sessionMgr.UpdateStatus(sessionID, "disconnected")

	packet := radius.NewPacket(radius.CodeDisconnectRequest, []byte(s.secret))
	packet.AddString(radius.AttrUserName, ses.Username)
	packet.AddString(radius.AttrAcctSessionID, sessionID)

	nasAddr := fmt.Sprintf("%s:3799", ses.NASIP)
	log.Printf("Sending Disconnect request to %s for session %s", nasAddr, sessionID)

	conn, err := net.DialTimeout("udp", nasAddr, 3*time.Second)
	if err != nil {
		log.Printf("Disconnect connect failed: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Session disconnected locally, NAS notification failed: " + err.Error(),
		}, nil
	}
	defer conn.Close()

	data, _ := packet.Encode()
	_, _ = conn.Write(data)

	buf := make([]byte, 4096)
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, err := conn.Read(buf)
	if err != nil {
		log.Printf("Disconnect response timeout: %v", err)
		return &CoAResult{
			Success: true,
			Message: "Session disconnected locally",
		}, nil
	}

	resp, err := radius.ParsePacket(buf[:n])
	if err != nil || resp.Code != radius.CodeDisconnectACK {
		return &CoAResult{
			Success: true,
			Message: "Session disconnected locally",
		}, nil
	}

	return &CoAResult{
		Success: true,
		Message: "Session disconnected successfully",
	}, nil
}

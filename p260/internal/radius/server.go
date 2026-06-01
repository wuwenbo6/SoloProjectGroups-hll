package radius

import (
	"context"
	"crypto/md5"
	"crypto/rand"
	"fmt"
	"log"
	"net"
	"time"

	"radius-coa-server/internal/audit"
	"radius-coa-server/internal/session"
)

type Handler func(w *ResponseWriter, r *Request)

type Request struct {
	Packet      *Packet
	RemoteAddr  net.Addr
	LocalAddr   net.Addr
}

type ResponseWriter struct {
	conn       net.PacketConn
	remoteAddr net.Addr
	request    *Request
	secret     []byte
}

func NewResponseWriter(conn net.PacketConn, remoteAddr net.Addr, request *Request, secret []byte) *ResponseWriter {
	return &ResponseWriter{
		conn:       conn,
		remoteAddr: remoteAddr,
		request:    request,
		secret:     secret,
	}
}

func (w *ResponseWriter) Write(p *Packet) error {
	p.Identifier = w.request.Packet.Identifier

	attrData := encodeAttributes(p.Attributes)
	p.Length = uint16(20 + len(attrData))

	hash := md5.New()
	hash.Write([]byte{p.Code, p.Identifier})
	lenBytes := make([]byte, 2)
	lenBytes[0] = byte(p.Length >> 8)
	lenBytes[1] = byte(p.Length)
	hash.Write(lenBytes)
	hash.Write(w.request.Packet.Authenticator[:])
	hash.Write(attrData)
	hash.Write(w.secret)
	copy(p.Authenticator[:], hash.Sum(nil))

	data, err := p.Encode()
	if err != nil {
		return err
	}

	_, err = w.conn.WriteTo(data, w.remoteAddr)
	return err
}

type Server struct {
	conn       net.PacketConn
	handler    Handler
	sessionMgr *session.Manager
	secret     string
	addr       string
	serverType string
}

func NewServer(secret, addr string, sessionMgr *session.Manager, serverType string) *Server {
	return &Server{
		secret:     secret,
		addr:       addr,
		sessionMgr: sessionMgr,
		serverType: serverType,
	}
}

func (s *Server) Start(ctx context.Context) error {
	conn, err := net.ListenPacket("udp", s.addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", s.addr, err)
	}
	s.conn = conn

	if s.serverType == "auth" {
		s.handler = s.handleAuth
	} else if s.serverType == "acct" {
		s.handler = s.handleAcct
	}

	log.Printf("RADIUS %s server starting on %s", s.serverType, s.addr)

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

			packet, err := ParsePacket(buf[:n])
			if err != nil {
				log.Printf("Failed to parse packet from %s: %v", remoteAddr, err)
				continue
			}

			req := &Request{
				Packet:     packet,
				RemoteAddr: remoteAddr,
				LocalAddr:  s.conn.LocalAddr(),
			}

			w := &ResponseWriter{
				conn:       s.conn,
				remoteAddr: remoteAddr,
				request:    req,
				secret:     []byte(s.secret),
			}

			go s.handler(w, req)
		}
	}
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.conn != nil {
		return s.conn.Close()
	}
	return nil
}

func (s *Server) handleAuth(w *ResponseWriter, r *Request) {
	username := r.Packet.GetString(AttrUserName)
	passwordAttr := r.Packet.Get(AttrUserPassword)
	nasIP := r.Packet.GetIP(AttrNASIPAddress).String()
	nasPort := fmt.Sprintf("%d", r.Packet.GetUint32(AttrNASPort))
	callingStID := r.Packet.GetString(AttrCallingStationID)

	password := ""
	if passwordAttr != nil {
		password = DecryptPassword(passwordAttr.Value, []byte(s.secret), r.Packet.Authenticator[:])
	}

	log.Printf("Auth request: username=%s, nas=%s, calling=%s", username, nasIP, callingStID)

	if !authenticateUser(username, password) {
		log.Printf("Auth rejected for user %s", username)
		audit.GetLogger().LogAuth(username, nasIP, false, "Invalid credentials")
		resp := NewPacket(CodeAccessReject, []byte(s.secret))
		_ = w.Write(resp)
		return
	}

	sessionID := generateSessionID(username, nasIP, nasPort)

	policy := getDefaultPolicy()

	ses := &session.Session{
		ID:          sessionID,
		Username:    username,
		NASIP:       nasIP,
		NASPort:     nasPort,
		CallingStID: callingStID,
		Policy:      policy,
		StartTime:   time.Now(),
		LastUpdate:  time.Now(),
		Status:      "authorizing",
	}
	s.sessionMgr.Add(ses)

	audit.GetLogger().LogAuth(username, nasIP, true, "Authentication successful")

	response := NewPacket(CodeAccessAccept, []byte(s.secret))
	response.AddString(AttrAcctSessionID, sessionID)

	addFilterID(response, policy)
	addRateLimit(response, policy)

	log.Printf("Auth accepted for user %s, session=%s", username, sessionID)
	_ = w.Write(response)
}

func (s *Server) handleAcct(w *ResponseWriter, r *Request) {
	acctStatusType := r.Packet.GetUint32(AttrAcctStatusType)
	username := r.Packet.GetString(AttrUserName)
	sessionID := r.Packet.GetString(AttrAcctSessionID)
	nasIP := r.Packet.GetIP(AttrNASIPAddress).String()
	framedIP := r.Packet.GetIP(AttrFramedIPAddress).String()

	log.Printf("Acct request: type=%d, username=%s, session=%s, nas=%s", acctStatusType, username, sessionID, nasIP)

	switch acctStatusType {
	case AcctStatusTypeStart:
		ses := &session.Session{
			ID:         sessionID,
			Username:   username,
			NASIP:      nasIP,
			FramedIP:   framedIP,
			Policy:     getDefaultPolicy(),
			StartTime:  time.Now(),
			LastUpdate: time.Now(),
			Status:     "online",
		}
		if existing, ok := s.sessionMgr.Get(sessionID); ok {
			ses.Policy = existing.Policy
		}
		s.sessionMgr.Add(ses)
		log.Printf("Session started: %s for user %s", sessionID, username)
		audit.GetLogger().LogSessionStart(username, sessionID, nasIP, framedIP)

	case AcctStatusTypeInterimUpdate:
		if ses, ok := s.sessionMgr.Get(sessionID); ok {
			ses.LastUpdate = time.Now()
			ses.FramedIP = framedIP
		}

	case AcctStatusTypeStop:
		s.sessionMgr.UpdateStatus(sessionID, "offline")
		log.Printf("Session stopped: %s for user %s", sessionID, username)
		audit.GetLogger().LogSessionStop(username, sessionID, nasIP)

	case AcctStatusTypeAccountingOn, AcctStatusTypeAccountingOff:
		statusText := map[uint32]string{
			AcctStatusTypeAccountingOn:  "on",
			AcctStatusTypeAccountingOff: "off",
		}[acctStatusType]
		log.Printf("NAS %s accounting %s", nasIP, statusText)
	}

	response := NewPacket(CodeAccountingResponse, []byte(s.secret))
	_ = w.Write(response)
}

func authenticateUser(username, password string) bool {
	return username != "" && password != ""
}

func getDefaultPolicy() session.Policy {
	return session.Policy{
		UploadSpeed:   10 * 1024 * 1024,
		DownloadSpeed: 50 * 1024 * 1024,
	}
}

func generateSessionID(username, nasIP, nasPort string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s-%s-%s-%x", username, nasIP, nasPort, b)
}

func addFilterID(p *Packet, policy session.Policy) {
	filterID := fmt.Sprintf("Rate-Limit:up=%d,down=%d", policy.UploadSpeed/1024, policy.DownloadSpeed/1024)
	p.AddString(AttrFilterID, filterID)
}

func addRateLimit(p *Packet, policy session.Policy) {
	vendorID := uint32(9)
	vendorData := make([]byte, 8)
	vendorData[0] = byte(vendorID >> 24)
	vendorData[1] = byte(vendorID >> 16)
	vendorData[2] = byte(vendorID >> 8)
	vendorData[3] = byte(vendorID)
	vendorData[4] = 1
	vendorData[5] = 6
	downKbps := uint16(policy.DownloadSpeed / 1024)
	vendorData[6] = byte(downKbps >> 8)
	vendorData[7] = byte(downKbps)
	p.Add(AttrVendorSpecific, vendorData)

	vendorData2 := make([]byte, 8)
	vendorData2[0] = byte(vendorID >> 24)
	vendorData2[1] = byte(vendorID >> 16)
	vendorData2[2] = byte(vendorID >> 8)
	vendorData2[3] = byte(vendorID)
	vendorData2[4] = 2
	vendorData2[5] = 6
	upKbps := uint16(policy.UploadSpeed / 1024)
	vendorData2[6] = byte(upKbps >> 8)
	vendorData2[7] = byte(upKbps)
	p.Add(AttrVendorSpecific, vendorData2)
}

func encodeAttributes(attrs []*Attribute) []byte {
	result := make([]byte, 0)
	for _, attr := range attrs {
		result = append(result, attr.Type)
		result = append(result, attr.Length)
		result = append(result, attr.Value...)
	}
	return result
}

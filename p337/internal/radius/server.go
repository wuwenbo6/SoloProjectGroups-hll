package radius

import (
	"crypto/md5"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

type ServerConfig struct {
	AuthPort int    `json:"auth_port"`
	AcctPort int    `json:"acct_port"`
	Secret   string `json:"secret"`
	Host     string `json:"host"`
}

func DefaultServerConfig() *ServerConfig {
	return &ServerConfig{
		AuthPort: 1812,
		AcctPort: 1813,
		Secret:   "testing123",
		Host:     "127.0.0.1",
	}
}

type UserRecord struct {
	Username       string
	Password       string
	FramedIP       string
	SessionTimeout uint32
	IdleTimeout    uint32
	VLAN           string
}

type RADIUSServer struct {
	mu       sync.RWMutex
	config   *ServerConfig
	users    map[string]*UserRecord
	authConn *net.UDPConn
	acctConn *net.UDPConn
	running  bool
	stats    *ServerStats
}

type ServerStats struct {
	mu                sync.RWMutex
	AuthRequests      int64     `json:"auth_requests"`
	AuthAccepts       int64     `json:"auth_accepts"`
	AuthRejects       int64     `json:"auth_rejects"`
	AcctRequests      int64     `json:"acct_requests"`
	AcctStarts        int64     `json:"acct_starts"`
	AcctStops         int64     `json:"acct_stops"`
	AcctInterims      int64     `json:"acct_interims"`
	AcctResponses     int64     `json:"acct_responses"`
	BadAuthenticators int64     `json:"bad_authenticators"`
	DroppedPackets    int64     `json:"dropped_packets"`
	StartTime         time.Time `json:"start_time"`
}

func NewRADIUSServer(config *ServerConfig) *RADIUSServer {
	s := &RADIUSServer{
		config: config,
		users:  make(map[string]*UserRecord),
		stats:  &ServerStats{StartTime: time.Now()},
	}

	s.AddUser("user001", "password001", "10.1.0.1", 86400, 0, "100")
	s.AddUser("user002", "password002", "10.1.0.2", 86400, 0, "101")
	s.AddUser("user003", "password003", "10.2.0.1", 28800, 3600, "200")
	s.AddUser("admin", "admin123", "10.0.0.1", 3600, 600, "999")
	s.AddUser("testuser", "test123", "10.1.0.3", 86400, 0, "102")

	return s
}

func (s *RADIUSServer) AddUser(username, password, framedIP string, sessionTimeout, idleTimeout uint32, vlan string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[username] = &UserRecord{
		Username:       username,
		Password:       password,
		FramedIP:       framedIP,
		SessionTimeout: sessionTimeout,
		IdleTimeout:    idleTimeout,
		VLAN:           vlan,
	}
}

func (s *RADIUSServer) GetUser(username string) (*UserRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[username]
	if !ok {
		return nil, false
	}
	return &UserRecord{
		Username:       u.Username,
		Password:       u.Password,
		FramedIP:       u.FramedIP,
		SessionTimeout: u.SessionTimeout,
		IdleTimeout:    u.IdleTimeout,
		VLAN:           u.VLAN,
	}, true
}

func (s *RADIUSServer) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("RADIUS server already running")
	}

	authAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", s.config.Host, s.config.AuthPort))
	if err != nil {
		return fmt.Errorf("resolve auth address: %v", err)
	}

	s.authConn, err = net.ListenUDP("udp", authAddr)
	if err != nil {
		return fmt.Errorf("listen auth: %v", err)
	}

	acctAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", s.config.Host, s.config.AcctPort))
	if err != nil {
		s.authConn.Close()
		return fmt.Errorf("resolve acct address: %v", err)
	}

	s.acctConn, err = net.ListenUDP("udp", acctAddr)
	if err != nil {
		s.authConn.Close()
		return fmt.Errorf("listen acct: %v", err)
	}

	s.running = true
	s.stats.StartTime = time.Now()

	go s.serveAuth()
	go s.serveAcct()

	log.Printf("RADIUS server started: auth=%s:%d, acct=%s:%d",
		s.config.Host, s.config.AuthPort, s.config.Host, s.config.AcctPort)

	return nil
}

func (s *RADIUSServer) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.running = false
	if s.authConn != nil {
		s.authConn.Close()
	}
	if s.acctConn != nil {
		s.acctConn.Close()
	}
}

func (s *RADIUSServer) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

func (s *RADIUSServer) GetStats() *ServerStats {
	s.stats.mu.RLock()
	defer s.stats.mu.RUnlock()
	return &ServerStats{
		AuthRequests:      s.stats.AuthRequests,
		AuthAccepts:       s.stats.AuthAccepts,
		AuthRejects:       s.stats.AuthRejects,
		AcctRequests:      s.stats.AcctRequests,
		AcctStarts:        s.stats.AcctStarts,
		AcctStops:         s.stats.AcctStops,
		AcctInterims:      s.stats.AcctInterims,
		AcctResponses:     s.stats.AcctResponses,
		BadAuthenticators: s.stats.BadAuthenticators,
		DroppedPackets:    s.stats.DroppedPackets,
		StartTime:         s.stats.StartTime,
	}
}

func (s *RADIUSServer) serveAuth() {
	buf := make([]byte, 4096)
	for {
		n, remoteAddr, err := s.authConn.ReadFromUDP(buf)
		if err != nil {
			if s.IsRunning() {
				log.Printf("RADIUS auth read error: %v", err)
			}
			return
		}

		pkt, err := DecodePacket(buf[:n], s.config.Secret)
		if err != nil {
			s.stats.mu.Lock()
			s.stats.DroppedPackets++
			s.stats.mu.Unlock()
			continue
		}

		if pkt.Code != CodeAccessRequest {
			continue
		}

		s.stats.mu.Lock()
		s.stats.AuthRequests++
		s.stats.mu.Unlock()

		reply := s.handleAccessRequest(pkt, remoteAddr)
		replyData, _ := reply.Encode()

		s.authConn.WriteToUDP(replyData, remoteAddr)
	}
}

func (s *RADIUSServer) serveAcct() {
	buf := make([]byte, 4096)
	for {
		n, remoteAddr, err := s.acctConn.ReadFromUDP(buf)
		if err != nil {
			if s.IsRunning() {
				log.Printf("RADIUS acct read error: %v", err)
			}
			return
		}

		pkt, err := DecodePacket(buf[:n], s.config.Secret)
		if err != nil {
			s.stats.mu.Lock()
			s.stats.DroppedPackets++
			s.stats.mu.Unlock()
			continue
		}

		if pkt.Code != CodeAccountingRequest {
			continue
		}

		s.stats.mu.Lock()
		s.stats.AcctRequests++
		s.stats.mu.Unlock()

		s.handleAccountingRequest(pkt)

		reply := NewPacket(CodeAccountingResponse, pkt.Identifier, s.config.Secret)
		copy(reply.Authenticator[:], pkt.Authenticator[:])
		replyData, _ := reply.Encode()

		s.acctConn.WriteToUDP(replyData, remoteAddr)

		s.stats.mu.Lock()
		s.stats.AcctResponses++
		s.stats.mu.Unlock()
	}
}

func (s *RADIUSServer) handleAccessRequest(pkt *Packet, remoteAddr *net.UDPAddr) *Packet {
	var username string
	if attr := pkt.GetAttribute(AttrUserName); attr != nil {
		username = string(attr.Value)
	}

	user, ok := s.GetUser(username)
	if !ok {
		s.stats.mu.Lock()
		s.stats.AuthRejects++
		s.stats.mu.Unlock()

		reply := NewPacket(CodeAccessReject, pkt.Identifier, s.config.Secret)
		reply.AddAttribute(StringAttribute(AttrReplyMessage, fmt.Sprintf("User '%s' not found", username)))
		return reply
	}

	var authenticated bool

	if pwdAttr := pkt.GetAttribute(AttrUserPassword); pwdAttr != nil {
		decrypted := decryptUserPassword(pwdAttr.Value, pkt.Authenticator, []byte(s.config.Secret))
		if string(decrypted) == user.Password {
			authenticated = true
		}
	} else if chapAttr := pkt.GetAttribute(AttrCHAPPassword); chapAttr != nil && len(chapAttr.Value) >= 17 {
		chapID := chapAttr.Value[0]
		chapResponse := chapAttr.Value[1:]

		chapChallenge := pkt.Authenticator[:]
		if chapChallengeAttr := pkt.GetAttribute(60); chapChallengeAttr != nil && len(chapChallengeAttr.Value) > 0 {
			chapChallenge = chapChallengeAttr.Value
		}

		input := make([]byte, 0, 1+len(user.Password)+len(chapChallenge))
		input = append(input, chapID)
		input = append(input, []byte(user.Password)...)
		input = append(input, chapChallenge...)

		h := md5.New()
		h.Write(input)
		expected := h.Sum(nil)

		if len(chapResponse) >= 16 && len(expected) >= 16 {
			match := true
			for i := 0; i < 16; i++ {
				if chapResponse[i] != expected[i] {
					match = false
					break
				}
			}
			authenticated = match
		}
	}

	if !authenticated {
		s.stats.mu.Lock()
		s.stats.AuthRejects++
		s.stats.mu.Unlock()

		reply := NewPacket(CodeAccessReject, pkt.Identifier, s.config.Secret)
		reply.AddAttribute(StringAttribute(AttrReplyMessage, "Authentication failed"))
		return reply
	}

	s.stats.mu.Lock()
	s.stats.AuthAccepts++
	s.stats.mu.Unlock()

	reply := NewPacket(CodeAccessAccept, pkt.Identifier, s.config.Secret)

	if user.FramedIP != "" {
		reply.AddAttribute(IPAttribute(AttrFramedIPAddress, net.ParseIP(user.FramedIP)))
	}
	if user.SessionTimeout > 0 {
		reply.AddAttribute(Uint32Attribute(AttrSessionTimeout, user.SessionTimeout))
	}
	if user.IdleTimeout > 0 {
		reply.AddAttribute(Uint32Attribute(AttrIdleTimeout, user.IdleTimeout))
	}
	if user.VLAN != "" {
		reply.AddAttribute(StringAttribute(AttrTunnelPrivateGroupID, user.VLAN))
	}
	reply.AddAttribute(Uint32Attribute(AttrFramedProtocol, 1))
	reply.AddAttribute(StringAttribute(AttrReplyMessage, "RADIUS: Access-Accept"))

	return reply
}

func (s *RADIUSServer) handleAccountingRequest(pkt *Packet) {
	var statusType uint32
	if attr := pkt.GetAttribute(AttrAcctStatusType); attr != nil && len(attr.Value) >= 4 {
		statusType = binary.BigEndian.Uint32(attr.Value)
	}

	s.stats.mu.Lock()
	switch AccountingStatusType(statusType) {
	case AcctStatusStart:
		s.stats.AcctStarts++
	case AcctStatusStop:
		s.stats.AcctStops++
	case AcctStatusInterim:
		s.stats.AcctInterims++
	}
	s.stats.mu.Unlock()
}

func decryptUserPassword(encrypted []byte, authenticator [16]byte, secret []byte) []byte {
	result := make([]byte, 0, len(encrypted))
	last := authenticator[:]

	for i := 0; i < len(encrypted); i += 16 {
		h := md5.New()
		h.Write(secret)
		h.Write(last)
		hash := h.Sum(nil)

		for j := 0; j < 16 && i+j < len(encrypted); j++ {
			result = append(result, encrypted[i+j]^hash[j])
		}
		last = encrypted[i : i+16]
	}

	for i := len(result) - 1; i >= 0; i-- {
		if result[i] != 0 {
			return result[:i+1]
		}
	}
	return result
}

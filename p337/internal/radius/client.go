package radius

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net"
	"sync"
	"time"
)

type ClientConfig struct {
	ServerHost    string        `json:"server_host"`
	AuthPort      int           `json:"auth_port"`
	AcctPort      int           `json:"acct_port"`
	Secret        string        `json:"secret"`
	NASIdentifier string        `json:"nas_identifier"`
	NASIPAddress  string        `json:"nas_ip_address"`
	Timeout       time.Duration `json:"timeout"`
	MaxRetries    int           `json:"max_retries"`
}

func DefaultClientConfig() *ClientConfig {
	return &ClientConfig{
		ServerHost:    "127.0.0.1",
		AuthPort:      1812,
		AcctPort:      1813,
		Secret:        "testing123",
		NASIdentifier: "BRAS-SIM-01",
		NASIPAddress:  "10.0.0.1",
		Timeout:       5 * time.Second,
		MaxRetries:    3,
	}
}

type RADIUSClient struct {
	mu      sync.RWMutex
	config  *ClientConfig
	conn    *net.UDPConn
	counter uint8
	enabled bool
}

type AuthResponse struct {
	Accepted       bool          `json:"accepted"`
	Code           PacketCode    `json:"code"`
	Username       string        `json:"username"`
	FramedIP       string        `json:"framed_ip,omitempty"`
	SessionTimeout uint32        `json:"session_timeout,omitempty"`
	IdleTimeout    uint32        `json:"idle_timeout,omitempty"`
	ReplyMessage   string        `json:"reply_message,omitempty"`
	VLAN           string        `json:"vlan,omitempty"`
	State          string        `json:"state,omitempty"`
	Class          string        `json:"class,omitempty"`
	Duration       time.Duration `json:"duration"`
	Retries        int           `json:"retries"`
}

type AcctResponse struct {
	Success  bool          `json:"success"`
	Code     PacketCode    `json:"code"`
	Duration time.Duration `json:"duration"`
	Retries  int           `json:"retries"`
}

func NewRADIUSClient(config *ClientConfig) *RADIUSClient {
	return &RADIUSClient{
		config:  config,
		enabled: config != nil,
	}
}

func (c *RADIUSClient) nextIdentifier() uint8 {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counter++
	return c.counter
}

func (c *RADIUSClient) IsEnabled() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.enabled
}

func (c *RADIUSClient) SetEnabled(enabled bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.enabled = enabled
}

func (c *RADIUSClient) GetConfig() *ClientConfig {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.config
}

func (c *RADIUSClient) AuthenticatePAP(username, password, sessionID, macAddress string) *AuthResponse {
	start := time.Now()
	resp := &AuthResponse{
		Username: username,
	}

	if !c.IsEnabled() {
		resp.Accepted = false
		resp.ReplyMessage = "RADIUS proxy disabled"
		resp.Duration = time.Since(start)
		return resp
	}

	pkt := NewPacket(CodeAccessRequest, c.nextIdentifier(), c.config.Secret)
	pkt.AddAttribute(StringAttribute(AttrUserName, username))

	encryptedPwd := encryptUserPassword(password, pkt.Authenticator, []byte(c.config.Secret))
	pkt.AddAttribute(&Attribute{Type: AttrUserPassword, Value: encryptedPwd})

	pkt.AddAttribute(StringAttribute(AttrNASIdentifier, c.config.NASIdentifier))
	pkt.AddAttribute(IPAttribute(AttrNASIPAddress, net.ParseIP(c.config.NASIPAddress)))
	pkt.AddAttribute(Uint32Attribute(AttrNASPort, 0))
	pkt.AddAttribute(Uint32Attribute(AttrNASPortType, 5)) // Virtual
	pkt.AddAttribute(StringAttribute(AttrCallingStationId, macAddress))
	pkt.AddAttribute(StringAttribute(AttrCalledStationId, c.config.NASIdentifier))
	pkt.AddAttribute(Uint32Attribute(AttrServiceType, 2))    // Framed-User
	pkt.AddAttribute(Uint32Attribute(AttrFramedProtocol, 1)) // PPP
	pkt.AddAttribute(StringAttribute(AttrAcctSessionId, sessionID))

	reply, retries, err := c.sendAndReceive(pkt, c.config.AuthPort)
	if err != nil {
		resp.Accepted = false
		resp.ReplyMessage = fmt.Sprintf("RADIUS proxy error: %v", err)
		resp.Duration = time.Since(start)
		resp.Retries = retries
		return resp
	}

	resp.Code = reply.Code
	resp.Retries = retries

	switch reply.Code {
	case CodeAccessAccept:
		resp.Accepted = true
		resp.ReplyMessage = "RADIUS Access-Accept"
		if attr := reply.GetAttribute(AttrFramedIPAddress); attr != nil && len(attr.Value) >= 4 {
			resp.FramedIP = net.IP(attr.Value).String()
		}
		if attr := reply.GetAttribute(AttrSessionTimeout); attr != nil && len(attr.Value) >= 4 {
			resp.SessionTimeout = binary.BigEndian.Uint32(attr.Value)
		}
		if attr := reply.GetAttribute(AttrIdleTimeout); attr != nil && len(attr.Value) >= 4 {
			resp.IdleTimeout = binary.BigEndian.Uint32(attr.Value)
		}
		if attr := reply.GetAttribute(AttrReplyMessage); attr != nil {
			resp.ReplyMessage = string(attr.Value)
		}
		if attr := reply.GetAttribute(AttrTunnelPrivateGroupID); attr != nil {
			resp.VLAN = string(attr.Value)
		}
		if attr := reply.GetAttribute(AttrState); attr != nil {
			resp.State = fmt.Sprintf("%x", attr.Value)
		}
		if attr := reply.GetAttribute(AttrClass); attr != nil {
			resp.Class = string(attr.Value)
		}

	case CodeAccessReject:
		resp.Accepted = false
		if attr := reply.GetAttribute(AttrReplyMessage); attr != nil {
			resp.ReplyMessage = string(attr.Value)
		} else {
			resp.ReplyMessage = "RADIUS Access-Reject"
		}

	case CodeAccessChallenge:
		resp.Accepted = false
		if attr := reply.GetAttribute(AttrReplyMessage); attr != nil {
			resp.ReplyMessage = string(attr.Value)
		} else {
			resp.ReplyMessage = "RADIUS Access-Challenge"
		}
		if attr := reply.GetAttribute(AttrState); attr != nil {
			resp.State = fmt.Sprintf("%x", attr.Value)
		}

	default:
		resp.Accepted = false
		resp.ReplyMessage = fmt.Sprintf("Unexpected RADIUS response: %s", reply.Code)
	}

	resp.Duration = time.Since(start)
	return resp
}

func (c *RADIUSClient) AuthenticateCHAP(username string, chapID uint8, chapChallenge, chapResponse []byte, sessionID, macAddress string) *AuthResponse {
	start := time.Now()
	resp := &AuthResponse{
		Username: username,
	}

	if !c.IsEnabled() {
		resp.Accepted = false
		resp.ReplyMessage = "RADIUS proxy disabled"
		resp.Duration = time.Since(start)
		return resp
	}

	pkt := NewPacket(CodeAccessRequest, c.nextIdentifier(), c.config.Secret)
	pkt.AddAttribute(StringAttribute(AttrUserName, username))

	chapValue := make([]byte, 1+len(chapResponse))
	chapValue[0] = chapID
	copy(chapValue[1:], chapResponse)

	pkt.AddAttribute(&Attribute{Type: AttrCHAPPassword, Value: chapValue})
	pkt.AddAttribute(&Attribute{Type: 60, Value: chapChallenge})

	pkt.AddAttribute(StringAttribute(AttrNASIdentifier, c.config.NASIdentifier))
	pkt.AddAttribute(IPAttribute(AttrNASIPAddress, net.ParseIP(c.config.NASIPAddress)))
	pkt.AddAttribute(Uint32Attribute(AttrNASPortType, 5))
	pkt.AddAttribute(StringAttribute(AttrCallingStationId, macAddress))
	pkt.AddAttribute(StringAttribute(AttrCalledStationId, c.config.NASIdentifier))
	pkt.AddAttribute(Uint32Attribute(AttrServiceType, 2))
	pkt.AddAttribute(Uint32Attribute(AttrFramedProtocol, 1))
	pkt.AddAttribute(StringAttribute(AttrAcctSessionId, sessionID))

	reply, retries, err := c.sendAndReceive(pkt, c.config.AuthPort)
	if err != nil {
		resp.Accepted = false
		resp.ReplyMessage = fmt.Sprintf("RADIUS proxy error: %v", err)
		resp.Duration = time.Since(start)
		resp.Retries = retries
		return resp
	}

	resp.Code = reply.Code
	resp.Retries = retries
	resp.Accepted = reply.Code == CodeAccessAccept

	if attr := reply.GetAttribute(AttrFramedIPAddress); attr != nil && len(attr.Value) >= 4 {
		resp.FramedIP = net.IP(attr.Value).String()
	}
	if attr := reply.GetAttribute(AttrReplyMessage); attr != nil {
		resp.ReplyMessage = string(attr.Value)
	}
	if attr := reply.GetAttribute(AttrTunnelPrivateGroupID); attr != nil {
		resp.VLAN = string(attr.Value)
	}

	resp.Duration = time.Since(start)
	return resp
}

func (c *RADIUSClient) SendAccountingStart(sessionID, username, macAddress, framedIP string, vlanID int) *AcctResponse {
	return c.sendAccounting(AcctStatusStart, sessionID, username, macAddress, framedIP, vlanID, 0, 0, 0, 0)
}

func (c *RADIUSClient) SendAccountingStop(sessionID, username, macAddress, framedIP string, vlanID int, sessionTime uint32, inputOctets, outputOctets uint64, cause TerminationCause) *AcctResponse {
	return c.sendAccounting(AcctStatusStop, sessionID, username, macAddress, framedIP, vlanID, sessionTime, inputOctets, outputOctets, cause)
}

func (c *RADIUSClient) SendAccountingInterim(sessionID, username, macAddress, framedIP string, vlanID int, sessionTime uint32, inputOctets, outputOctets uint64) *AcctResponse {
	return c.sendAccounting(AcctStatusInterim, sessionID, username, macAddress, framedIP, vlanID, sessionTime, inputOctets, outputOctets, 0)
}

func (c *RADIUSClient) sendAccounting(statusType AccountingStatusType, sessionID, username, macAddress, framedIP string, vlanID int, sessionTime uint32, inputOctets, outputOctets uint64, cause TerminationCause) *AcctResponse {
	start := time.Now()
	resp := &AcctResponse{}

	if !c.IsEnabled() {
		resp.Success = false
		resp.Duration = time.Since(start)
		return resp
	}

	pkt := NewPacket(CodeAccountingRequest, c.nextIdentifier(), c.config.Secret)
	pkt.AddAttribute(Uint32Attribute(AttrAcctStatusType, uint32(statusType)))
	pkt.AddAttribute(StringAttribute(AttrAcctSessionId, sessionID))
	pkt.AddAttribute(StringAttribute(AttrUserName, username))
	pkt.AddAttribute(StringAttribute(AttrNASIdentifier, c.config.NASIdentifier))
	pkt.AddAttribute(IPAttribute(AttrNASIPAddress, net.ParseIP(c.config.NASIPAddress)))
	pkt.AddAttribute(StringAttribute(AttrCallingStationId, macAddress))

	if framedIP != "" {
		pkt.AddAttribute(IPAttribute(AttrFramedIPAddress, net.ParseIP(framedIP)))
	}
	if vlanID > 0 {
		pkt.AddAttribute(StringAttribute(AttrTunnelPrivateGroupID, fmt.Sprintf("%d", vlanID)))
	}

	if sessionTime > 0 {
		pkt.AddAttribute(Uint32Attribute(AttrAcctSessionTime, sessionTime))
	}
	if inputOctets > 0 {
		pkt.AddAttribute(Uint32Attribute(AttrAcctInputOctets, uint32(inputOctets)))
	}
	if outputOctets > 0 {
		pkt.AddAttribute(Uint32Attribute(AttrAcctOutputOctets, uint32(outputOctets)))
	}
	if cause != 0 {
		pkt.AddAttribute(Uint32Attribute(AttrAcctTerminateCause, uint32(cause)))
	}

	reply, retries, err := c.sendAndReceive(pkt, c.config.AcctPort)
	if err != nil {
		resp.Success = false
		resp.Duration = time.Since(start)
		resp.Retries = retries
		return resp
	}

	resp.Success = reply.Code == CodeAccountingResponse
	resp.Code = reply.Code
	resp.Duration = time.Since(start)
	resp.Retries = retries
	return resp
}

func (c *RADIUSClient) sendAndReceive(pkt *Packet, port int) (*Packet, int, error) {
	data, err := pkt.Encode()
	if err != nil {
		return nil, 0, fmt.Errorf("encode error: %v", err)
	}

	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", c.config.ServerHost, port))
	if err != nil {
		return nil, 0, fmt.Errorf("resolve error: %v", err)
	}

	var lastErr error
	retries := 0

	for attempt := 0; attempt <= c.config.MaxRetries; attempt++ {
		if attempt > 0 {
			retries++
			time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
		}

		conn, err := net.DialUDP("udp", nil, addr)
		if err != nil {
			lastErr = fmt.Errorf("dial error: %v", err)
			continue
		}

		conn.SetDeadline(time.Now().Add(c.config.Timeout))

		_, err = conn.Write(data)
		if err != nil {
			conn.Close()
			lastErr = fmt.Errorf("write error: %v", err)
			continue
		}

		buf := make([]byte, 4096)
		n, err := conn.Read(buf)
		conn.Close()

		if err != nil {
			lastErr = fmt.Errorf("read error: %v", err)
			continue
		}

		reply, err := DecodePacket(buf[:n], c.config.Secret)
		if err != nil {
			lastErr = fmt.Errorf("decode error: %v", err)
			continue
		}

		if reply.Identifier != pkt.Identifier {
			lastErr = fmt.Errorf("identifier mismatch")
			continue
		}

		return reply, retries, nil
	}

	return nil, retries, fmt.Errorf("max retries exceeded: %v", lastErr)
}

func encryptUserPassword(password string, authenticator [16]byte, secret []byte) []byte {
	pwd := []byte(password)
	if len(pwd)%16 != 0 {
		padded := make([]byte, (len(pwd)/16+1)*16)
		copy(padded, pwd)
		pwd = padded
	}

	result := make([]byte, 0, len(pwd))
	last := authenticator[:]

	for i := 0; i < len(pwd); i += 16 {
		h := md5.New()
		h.Write(secret)
		h.Write(last)
		hash := h.Sum(nil)

		chunk := make([]byte, 16)
		for j := 0; j < 16 && i+j < len(pwd); j++ {
			chunk[j] = pwd[i+j] ^ hash[j]
		}
		result = append(result, chunk...)
		last = chunk
	}

	return result
}

func generateAuthenticator() [16]byte {
	var auth [16]byte
	rand.Read(auth[:])
	return auth
}

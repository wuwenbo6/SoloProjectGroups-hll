//go:build linux

package l2tp

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sync"

	"l2tpv3-manager/frame"
	"l2tpv3-manager/ipsec"

	l2tplib "github.com/katalix/go-l2tp/l2tp"
)

type linuxManager struct {
	mu         sync.RWMutex
	ctx        *l2tplib.Context
	tunnels    map[string]*linuxTunnel
	dispatcher *frame.PseudowireDispatcher
	stats      *StatsManager
	useNullDP  bool
}

type linuxTunnel struct {
	config   *l2tplib.TunnelConfig
	tunnel   l2tplib.Tunnel
	sessions map[string]*linuxSession
}

type linuxSession struct {
	config  *l2tplib.SessionConfig
	session l2tplib.Session
}

func newManagerImpl(useNullDataPlane bool) (ManagerImpl, error) {
	var dp l2tplib.DataPlane
	if useNullDataPlane {
		dp = nil
	} else {
		dp = l2tplib.LinuxNetlinkDataPlane
	}

	ctx, err := l2tplib.NewContext(dp, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create L2TP context: %w", err)
	}

	return &linuxManager{
		ctx:        ctx,
		tunnels:    make(map[string]*linuxTunnel),
		dispatcher: frame.NewPseudowireDispatcher(),
		stats:      NewStatsManager(),
		useNullDP:  useNullDataPlane,
	}, nil
}

func (m *linuxManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.ctx.Close()
	m.tunnels = make(map[string]*linuxTunnel)
	m.dispatcher = frame.NewPseudowireDispatcher()
	m.stats = NewStatsManager()
}

func (m *linuxManager) IsNullDataPlane() bool {
	return m.useNullDP
}

func (m *linuxManager) CreateTunnel(name, localAddr, peerAddr string, tunnelID, peerTunnelID uint32, encapType string) (*TunnelInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.tunnels[name]; exists {
		return nil, fmt.Errorf("tunnel %q already exists", name)
	}

	var encap l2tplib.EncapType
	switch encapType {
	case "udp", "UDP":
		encap = l2tplib.EncapTypeUDP
	case "ip", "IP":
		encap = l2tplib.EncapTypeIP
	default:
		encap = l2tplib.EncapTypeUDP
	}

	tcfg := &l2tplib.TunnelConfig{
		Local:        localAddr,
		Peer:         peerAddr,
		TunnelID:     l2tplib.ControlConnID(tunnelID),
		PeerTunnelID: l2tplib.ControlConnID(peerTunnelID),
		Encap:        encap,
		Version:      l2tplib.ProtocolVersion3,
		FramingCaps:  l2tplib.FramingCapSync | l2tplib.FramingCapAsync,
	}

	tunl, err := m.ctx.NewStaticTunnel(name, tcfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create tunnel %q: %w", name, err)
	}

	m.tunnels[name] = &linuxTunnel{
		config:   tcfg,
		tunnel:   tunl,
		sessions: make(map[string]*linuxSession),
	}

	m.stats.AddTunnel(name, tunnelID)

	info := &TunnelInfo{
		Name:         name,
		LocalAddr:    localAddr,
		PeerAddr:     peerAddr,
		TunnelID:     tunnelID,
		PeerTunnelID: peerTunnelID,
		Encap:        encapType,
		Version:      "l2tpv3",
		Status:       "up",
	}
	return info, nil
}

func (m *linuxManager) DeleteTunnel(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	te, exists := m.tunnels[name]
	if !exists {
		return fmt.Errorf("tunnel %q not found", name)
	}

	if len(te.sessions) > 0 {
		return fmt.Errorf("tunnel %q has active sessions, delete sessions first", name)
	}

	te.tunnel.Close()
	m.stats.RemoveTunnel(name)
	delete(m.tunnels, name)
	return nil
}

func (m *linuxManager) CreateSession(tunnelName, sessionName string, sessionID, peerSessionID uint32, cookie, peerCookie string) (*SessionInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	if _, exists := te.sessions[sessionName]; exists {
		return nil, fmt.Errorf("session %q already exists in tunnel %q", sessionName, tunnelName)
	}

	scfg := &l2tplib.SessionConfig{
		SessionID:     l2tplib.ControlConnID(sessionID),
		PeerSessionID: l2tplib.ControlConnID(peerSessionID),
		Pseudowire:    l2tplib.PseudowireTypeEth,
		L2SpecType:    l2tplib.L2SpecTypeDefault,
	}

	if cookie != "" {
		cookieBytes, err := hex.DecodeString(cookie)
		if err != nil {
			return nil, fmt.Errorf("invalid cookie hex %q: %w", cookie, err)
		}
		scfg.Cookie = cookieBytes
	}

	if peerCookie != "" {
		peerCookieBytes, err := hex.DecodeString(peerCookie)
		if err != nil {
			return nil, fmt.Errorf("invalid peer_cookie hex %q: %w", peerCookie, err)
		}
		scfg.PeerCookie = peerCookieBytes
	}

	sess, err := te.tunnel.NewSession(sessionName, scfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create session %q: %w", sessionName, err)
	}

	te.sessions[sessionName] = &linuxSession{
		config:  scfg,
		session: sess,
	}

	var ifaceName string
	if sdp, ok := sess.(l2tplib.SessionDataPlane); ok {
		if name, err := sdp.GetInterfaceName(); err == nil {
			ifaceName = name
		}
	}

	info := &SessionInfo{
		Name:          sessionName,
		TunnelName:    tunnelName,
		SessionID:     sessionID,
		PeerSessionID: peerSessionID,
		Pseudowire:    "eth",
		Cookie:        cookie,
		PeerCookie:    peerCookie,
		InterfaceName: ifaceName,
		Status:        "up",
	}

	m.dispatcher.AddSession(sessionID, peerSessionID, scfg.Cookie, scfg.PeerCookie, sessionName, tunnelName)
	m.stats.AddSession(tunnelName, sessionName, sessionID)

	return info, nil
}

func (m *linuxManager) DeleteSession(tunnelName, sessionName string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return fmt.Errorf("tunnel %q not found", tunnelName)
	}

	se, exists := te.sessions[sessionName]
	if !exists {
		return fmt.Errorf("session %q not found in tunnel %q", sessionName, tunnelName)
	}

	se.session.Close()
	m.dispatcher.RemoveSession(uint32(se.config.SessionID))
	m.stats.RemoveSession(tunnelName, sessionName)
	delete(te.sessions, sessionName)
	return nil
}

func (m *linuxManager) ListTunnels() []*TunnelInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*TunnelInfo, 0, len(m.tunnels))
	for name, te := range m.tunnels {
		encapStr := "udp"
		if te.config.Encap == l2tplib.EncapTypeIP {
			encapStr = "ip"
		}
		info := &TunnelInfo{
			Name:         name,
			LocalAddr:    te.config.Local,
			PeerAddr:     te.config.Peer,
			TunnelID:     uint32(te.config.TunnelID),
			PeerTunnelID: uint32(te.config.PeerTunnelID),
			Encap:        encapStr,
			Version:      "l2tpv3",
			Status:       "up",
		}
		result = append(result, info)
	}
	return result
}

func (m *linuxManager) ListSessions(tunnelName string) ([]*SessionInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	result := make([]*SessionInfo, 0, len(te.sessions))
	for name, se := range te.sessions {
		info := &SessionInfo{
			Name:          name,
			TunnelName:    tunnelName,
			SessionID:     uint32(se.config.SessionID),
			PeerSessionID: uint32(se.config.PeerSessionID),
			Pseudowire:    "eth",
			Cookie:        hex.EncodeToString(se.config.Cookie),
			PeerCookie:    hex.EncodeToString(se.config.PeerCookie),
			Status:        "up",
		}
		result = append(result, info)
	}
	return result, nil
}

func (m *linuxManager) GetTunnel(name string) (*TunnelInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[name]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", name)
	}

	encapStr := "udp"
	if te.config.Encap == l2tplib.EncapTypeIP {
		encapStr = "ip"
	}
	return &TunnelInfo{
		Name:         name,
		LocalAddr:    te.config.Local,
		PeerAddr:     te.config.Peer,
		TunnelID:     uint32(te.config.TunnelID),
		PeerTunnelID: uint32(te.config.PeerTunnelID),
		Encap:        encapStr,
		Version:      "l2tpv3",
		Status:       "up",
	}, nil
}

func (m *linuxManager) GetSession(tunnelName, sessionName string) (*SessionInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	se, exists := te.sessions[sessionName]
	if !exists {
		return nil, fmt.Errorf("session %q not found in tunnel %q", sessionName, tunnelName)
	}

	return &SessionInfo{
		Name:          sessionName,
		TunnelName:    tunnelName,
		SessionID:     uint32(se.config.SessionID),
		PeerSessionID: uint32(se.config.PeerSessionID),
		Pseudowire:    "eth",
		Cookie:        hex.EncodeToString(se.config.Cookie),
		PeerCookie:    hex.EncodeToString(se.config.PeerCookie),
		Status:        "up",
	}, nil
}

func (m *linuxManager) DispatchPacket(packet []byte, cookieLen int) (*DispatchPacketResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := m.dispatcher.DispatchPacket(packet, cookieLen)

	response := &DispatchPacketResult{
		SessionID:      result.SessionID,
		SessionName:    result.SessionName,
		TunnelName:     result.TunnelName,
		Pseudowire:     result.Pseudowire,
		Cookie:         hex.EncodeToString(result.Cookie),
		ExpectedCookie: hex.EncodeToString(result.ExpectedCookie),
		Validation:     result.Validation.String(),
		PayloadHex:     hex.EncodeToString(result.Payload),
	}

	if result.Validation == frame.PacketValid && result.SessionName != "" {
		m.stats.RecordSessionInbound(result.TunnelName, result.SessionName, len(packet))
	} else if result.SessionName != "" {
		m.stats.RecordSessionErrorIn(result.TunnelName, result.SessionName, len(packet))
	}

	if result.EthFrame != nil {
		response.EthInfo = result.EthFrame.String()
		response.DstMAC = frame.MACToString(result.EthFrame.DstMAC)
		response.SrcMAC = frame.MACToString(result.EthFrame.SrcMAC)
		response.EtherType = frame.EtherTypeToString(result.EthFrame.EtherType)
	}

	return response, nil
}

func (m *linuxManager) GenerateAVPForSession(sessionName string, tunnelName string) ([]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	se, exists := te.sessions[sessionName]
	if !exists {
		return nil, fmt.Errorf("session %q not found in tunnel %q", sessionName, tunnelName)
	}

	var avps []string

	sessionIDBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(sessionIDBytes, uint32(se.config.SessionID))
	sessionIDAVP := frame.NewSessionIDAVP(uint32(se.config.SessionID), true)
	avps = append(avps, sessionIDAVP.String()+" | Hex: "+hex.EncodeToString(sessionIDAVP.Marshal()))

	if len(se.config.Cookie) > 0 {
		cookieAVP := frame.NewCookieAVP(se.config.Cookie, true)
		avps = append(avps, cookieAVP.String()+" | Hex: "+hex.EncodeToString(cookieAVP.Marshal()))
	}

	if len(se.config.PeerCookie) > 0 {
		peerCookieAVP := frame.NewPeerCookieAVP(se.config.PeerCookie, true)
		avps = append(avps, peerCookieAVP.String()+" | Hex: "+hex.EncodeToString(peerCookieAVP.Marshal()))
	}

	return avps, nil
}

func (m *linuxManager) GetTunnelStats(tunnelName string) (*TunnelStats, bool) {
	return m.stats.GetTunnelStats(tunnelName)
}

func (m *linuxManager) GetSessionStats(tunnelName, sessionName string) (*SessionStats, bool) {
	return m.stats.GetSessionStats(tunnelName, sessionName)
}

func (m *linuxManager) GetAllTunnelStats() []*TunnelStats {
	return m.stats.GetAllTunnelStats()
}

func (m *linuxManager) ResetTunnelStats(tunnelName string) bool {
	return m.stats.ResetTunnelStats(tunnelName)
}

func (m *linuxManager) EncryptIPsec(plaintext []byte, spi uint32, keyHex string, seqNum uint32, nextHeader uint8) ([]byte, error) {
	cfg, err := ipsec.NewESPConfig(spi, keyHex, true)
	if err != nil {
		return nil, err
	}

	ciphertext, err := ipsec.EncryptESP(plaintext, cfg, seqNum, nextHeader)
	if err != nil {
		return nil, err
	}

	return ciphertext, nil
}

func (m *linuxManager) DecryptIPsec(ciphertext []byte, spi uint32, keyHex string) ([]byte, uint8, error) {
	cfg, err := ipsec.NewESPConfig(spi, keyHex, true)
	if err != nil {
		return nil, 0, err
	}

	plaintext, nextHeader, _, err := ipsec.DecryptESP(ciphertext, cfg)
	if err != nil {
		return nil, 0, err
	}

	return plaintext, nextHeader, nil
}

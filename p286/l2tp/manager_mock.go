//go:build !linux

package l2tp

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"sync"

	"l2tpv3-manager/frame"
	"l2tpv3-manager/ipsec"
)

type mockManager struct {
	mu         sync.RWMutex
	tunnels    map[string]*mockTunnel
	dispatcher *frame.PseudowireDispatcher
	stats      *StatsManager
	useNull    bool
}

type mockTunnel struct {
	info     *TunnelInfo
	sessions map[string]*mockSession
}

type mockSession struct {
	info *SessionInfo
}

func newManagerImpl(useNullDataPlane bool) (ManagerImpl, error) {
	return &mockManager{
		tunnels:    make(map[string]*mockTunnel),
		dispatcher: frame.NewPseudowireDispatcher(),
		stats:      NewStatsManager(),
		useNull:    true,
	}, nil
}

func (m *mockManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tunnels = make(map[string]*mockTunnel)
	m.dispatcher = frame.NewPseudowireDispatcher()
	m.stats = NewStatsManager()
}

func (m *mockManager) IsNullDataPlane() bool {
	return m.useNull
}

func (m *mockManager) CreateTunnel(name, localAddr, peerAddr string, tunnelID, peerTunnelID uint32, encapType string) (*TunnelInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.tunnels[name]; exists {
		return nil, fmt.Errorf("tunnel %q already exists", name)
	}

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

	m.tunnels[name] = &mockTunnel{
		info:     info,
		sessions: make(map[string]*mockSession),
	}

	m.stats.AddTunnel(name, tunnelID)

	return info, nil
}

func (m *mockManager) DeleteTunnel(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	te, exists := m.tunnels[name]
	if !exists {
		return fmt.Errorf("tunnel %q not found", name)
	}

	if len(te.sessions) > 0 {
		return fmt.Errorf("tunnel %q has active sessions, delete sessions first", name)
	}

	m.stats.RemoveTunnel(name)
	delete(m.tunnels, name)
	return nil
}

func (m *mockManager) CreateSession(tunnelName, sessionName string, sessionID, peerSessionID uint32, cookie, peerCookie string) (*SessionInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	if _, exists := te.sessions[sessionName]; exists {
		return nil, fmt.Errorf("session %q already exists in tunnel %q", sessionName, tunnelName)
	}

	if cookie != "" {
		if _, err := hex.DecodeString(cookie); err != nil {
			return nil, fmt.Errorf("invalid cookie hex %q: %w", cookie, err)
		}
	}

	if peerCookie != "" {
		if _, err := hex.DecodeString(peerCookie); err != nil {
			return nil, fmt.Errorf("invalid peer_cookie hex %q: %w", peerCookie, err)
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
		InterfaceName: fmt.Sprintf("l2tpeth%d", sessionID%1000),
		Status:        "up",
	}

	te.sessions[sessionName] = &mockSession{info: info}

	var cookieBytes []byte
	if cookie != "" {
		cookieBytes, _ = hex.DecodeString(cookie)
	}
	var peerCookieBytes []byte
	if peerCookie != "" {
		peerCookieBytes, _ = hex.DecodeString(peerCookie)
	}

	m.dispatcher.AddSession(sessionID, peerSessionID, cookieBytes, peerCookieBytes, sessionName, tunnelName)
	m.stats.AddSession(tunnelName, sessionName, sessionID)

	return info, nil
}

func (m *mockManager) DeleteSession(tunnelName, sessionName string) error {
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

	m.dispatcher.RemoveSession(se.info.SessionID)
	m.stats.RemoveSession(tunnelName, sessionName)

	delete(te.sessions, sessionName)
	return nil
}

func (m *mockManager) ListTunnels() []*TunnelInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*TunnelInfo, 0, len(m.tunnels))
	for _, te := range m.tunnels {
		result = append(result, te.info)
	}
	return result
}

func (m *mockManager) ListSessions(tunnelName string) ([]*SessionInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[tunnelName]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", tunnelName)
	}

	result := make([]*SessionInfo, 0, len(te.sessions))
	for _, se := range te.sessions {
		result = append(result, se.info)
	}
	return result, nil
}

func (m *mockManager) GetTunnel(name string) (*TunnelInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	te, exists := m.tunnels[name]
	if !exists {
		return nil, fmt.Errorf("tunnel %q not found", name)
	}
	return te.info, nil
}

func (m *mockManager) GetSession(tunnelName, sessionName string) (*SessionInfo, error) {
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
	return se.info, nil
}

func (m *mockManager) DispatchPacket(packet []byte, cookieLen int) (*DispatchPacketResult, error) {
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

func (m *mockManager) GenerateAVPForSession(sessionName string, tunnelName string) ([]string, error) {
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
	binary.BigEndian.PutUint32(sessionIDBytes, se.info.SessionID)
	sessionIDAVP := frame.NewSessionIDAVP(se.info.SessionID, true)
	avps = append(avps, sessionIDAVP.String()+" | Hex: "+hex.EncodeToString(sessionIDAVP.Marshal()))

	if se.info.Cookie != "" {
		cookieBytes, _ := hex.DecodeString(se.info.Cookie)
		cookieAVP := frame.NewCookieAVP(cookieBytes, true)
		avps = append(avps, cookieAVP.String()+" | Hex: "+hex.EncodeToString(cookieAVP.Marshal()))
	}

	if se.info.PeerCookie != "" {
		peerCookieBytes, _ := hex.DecodeString(se.info.PeerCookie)
		peerCookieAVP := frame.NewPeerCookieAVP(peerCookieBytes, true)
		avps = append(avps, peerCookieAVP.String()+" | Hex: "+hex.EncodeToString(peerCookieAVP.Marshal()))
	}

	return avps, nil
}

func (m *mockManager) GetTunnelStats(tunnelName string) (*TunnelStats, bool) {
	return m.stats.GetTunnelStats(tunnelName)
}

func (m *mockManager) GetSessionStats(tunnelName, sessionName string) (*SessionStats, bool) {
	return m.stats.GetSessionStats(tunnelName, sessionName)
}

func (m *mockManager) GetAllTunnelStats() []*TunnelStats {
	return m.stats.GetAllTunnelStats()
}

func (m *mockManager) ResetTunnelStats(tunnelName string) bool {
	return m.stats.ResetTunnelStats(tunnelName)
}

func (m *mockManager) EncryptIPsec(plaintext []byte, spi uint32, keyHex string, seqNum uint32, nextHeader uint8) ([]byte, error) {
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

func (m *mockManager) DecryptIPsec(ciphertext []byte, spi uint32, keyHex string) ([]byte, uint8, error) {
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

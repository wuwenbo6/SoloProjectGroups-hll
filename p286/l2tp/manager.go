package l2tp

type TunnelInfo struct {
	Name         string `json:"name"`
	LocalAddr    string `json:"local_addr"`
	PeerAddr     string `json:"peer_addr"`
	TunnelID     uint32 `json:"tunnel_id"`
	PeerTunnelID uint32 `json:"peer_tunnel_id"`
	Encap        string `json:"encap"`
	Version      string `json:"version"`
	Status       string `json:"status"`
}

type SessionInfo struct {
	Name          string `json:"name"`
	TunnelName    string `json:"tunnel_name"`
	SessionID     uint32 `json:"session_id"`
	PeerSessionID uint32 `json:"peer_session_id"`
	Pseudowire    string `json:"pseudowire"`
	Cookie        string `json:"cookie"`
	PeerCookie    string `json:"peer_cookie"`
	InterfaceName string `json:"interface_name"`
	Status        string `json:"status"`
}

type DispatchPacketResult struct {
	SessionID      uint32 `json:"session_id"`
	SessionName    string `json:"session_name"`
	TunnelName     string `json:"tunnel_name"`
	Pseudowire     string `json:"pseudowire"`
	Cookie         string `json:"cookie"`
	ExpectedCookie string `json:"expected_cookie"`
	Validation     string `json:"validation"`
	EthInfo        string `json:"eth_info,omitempty"`
	DstMAC         string `json:"dst_mac,omitempty"`
	SrcMAC         string `json:"src_mac,omitempty"`
	EtherType      string `json:"ether_type,omitempty"`
	PayloadHex     string `json:"payload_hex,omitempty"`
}

type ManagerImpl interface {
	Close()
	CreateTunnel(name, localAddr, peerAddr string, tunnelID, peerTunnelID uint32, encapType string) (*TunnelInfo, error)
	DeleteTunnel(name string) error
	CreateSession(tunnelName, sessionName string, sessionID, peerSessionID uint32, cookie, peerCookie string) (*SessionInfo, error)
	DeleteSession(tunnelName, sessionName string) error
	ListTunnels() []*TunnelInfo
	ListSessions(tunnelName string) ([]*SessionInfo, error)
	GetTunnel(name string) (*TunnelInfo, error)
	GetSession(tunnelName, sessionName string) (*SessionInfo, error)
	IsNullDataPlane() bool
	DispatchPacket(packet []byte, cookieLen int) (*DispatchPacketResult, error)
	GenerateAVPForSession(sessionName string, tunnelName string) ([]string, error)
	GetTunnelStats(tunnelName string) (*TunnelStats, bool)
	GetSessionStats(tunnelName, sessionName string) (*SessionStats, bool)
	GetAllTunnelStats() []*TunnelStats
	ResetTunnelStats(tunnelName string) bool
	EncryptIPsec(plaintext []byte, spi uint32, keyHex string, seqNum uint32, nextHeader uint8) ([]byte, error)
	DecryptIPsec(ciphertext []byte, spi uint32, keyHex string) ([]byte, uint8, error)
}

type Manager struct {
	impl ManagerImpl
}

func NewManager(useNullDataPlane bool) (*Manager, error) {
	impl, err := newManagerImpl(useNullDataPlane)
	if err != nil {
		return nil, err
	}
	return &Manager{impl: impl}, nil
}

func (m *Manager) Close() { m.impl.Close() }

func (m *Manager) IsNullDataPlane() bool { return m.impl.IsNullDataPlane() }

func (m *Manager) CreateTunnel(name, localAddr, peerAddr string, tunnelID, peerTunnelID uint32, encapType string) (*TunnelInfo, error) {
	return m.impl.CreateTunnel(name, localAddr, peerAddr, tunnelID, peerTunnelID, encapType)
}

func (m *Manager) DeleteTunnel(name string) error { return m.impl.DeleteTunnel(name) }

func (m *Manager) CreateSession(tunnelName, sessionName string, sessionID, peerSessionID uint32, cookie, peerCookie string) (*SessionInfo, error) {
	return m.impl.CreateSession(tunnelName, sessionName, sessionID, peerSessionID, cookie, peerCookie)
}

func (m *Manager) DeleteSession(tunnelName, sessionName string) error {
	return m.impl.DeleteSession(tunnelName, sessionName)
}

func (m *Manager) ListTunnels() []*TunnelInfo { return m.impl.ListTunnels() }

func (m *Manager) ListSessions(tunnelName string) ([]*SessionInfo, error) {
	return m.impl.ListSessions(tunnelName)
}

func (m *Manager) GetTunnel(name string) (*TunnelInfo, error) { return m.impl.GetTunnel(name) }

func (m *Manager) GetSession(tunnelName, sessionName string) (*SessionInfo, error) {
	return m.impl.GetSession(tunnelName, sessionName)
}

func (m *Manager) DispatchPacket(packet []byte, cookieLen int) (*DispatchPacketResult, error) {
	return m.impl.DispatchPacket(packet, cookieLen)
}

func (m *Manager) GenerateAVPForSession(sessionName string, tunnelName string) ([]string, error) {
	return m.impl.GenerateAVPForSession(sessionName, tunnelName)
}

func (m *Manager) GetTunnelStats(tunnelName string) (*TunnelStats, bool) {
	return m.impl.GetTunnelStats(tunnelName)
}

func (m *Manager) GetSessionStats(tunnelName, sessionName string) (*SessionStats, bool) {
	return m.impl.GetSessionStats(tunnelName, sessionName)
}

func (m *Manager) GetAllTunnelStats() []*TunnelStats {
	return m.impl.GetAllTunnelStats()
}

func (m *Manager) ResetTunnelStats(tunnelName string) bool {
	return m.impl.ResetTunnelStats(tunnelName)
}

func (m *Manager) EncryptIPsec(plaintext []byte, spi uint32, keyHex string, seqNum uint32, nextHeader uint8) ([]byte, error) {
	return m.impl.EncryptIPsec(plaintext, spi, keyHex, seqNum, nextHeader)
}

func (m *Manager) DecryptIPsec(ciphertext []byte, spi uint32, keyHex string) ([]byte, uint8, error) {
	return m.impl.DecryptIPsec(ciphertext, spi, keyHex)
}

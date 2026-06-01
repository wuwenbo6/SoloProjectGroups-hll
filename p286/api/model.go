package api

type CreateTunnelRequest struct {
	Name         string `json:"name"`
	LocalAddr    string `json:"local_addr"`
	PeerAddr     string `json:"peer_addr"`
	TunnelID     uint32 `json:"tunnel_id"`
	PeerTunnelID uint32 `json:"peer_tunnel_id"`
	Encap        string `json:"encap"`
}

type CreateSessionRequest struct {
	Name          string `json:"name"`
	TunnelName    string `json:"tunnel_name"`
	SessionID     uint32 `json:"session_id"`
	PeerSessionID uint32 `json:"peer_session_id"`
	Cookie        string `json:"cookie"`
	PeerCookie    string `json:"peer_cookie"`
}

type EncapsulateRequest struct {
	SessionID uint32 `json:"session_id"`
	Cookie    string `json:"cookie"`
	DstMAC    string `json:"dst_mac"`
	SrcMAC    string `json:"src_mac"`
	VLANID    uint16 `json:"vlan_id"`
	EtherType uint16 `json:"ether_type"`
	Payload   string `json:"payload"`
}

type DecapsulateRequest struct {
	Data      string `json:"data"`
	CookieLen int    `json:"cookie_len"`
}

type DispatchPacketRequest struct {
	Data      string `json:"data"`
	CookieLen int    `json:"cookie_len"`
}

type GenerateAVPRequest struct {
	TunnelName  string `json:"tunnel_name"`
	SessionName string `json:"session_name"`
}

type IPsecEncryptRequest struct {
	Data       string `json:"data"`
	SPI        uint32 `json:"spi"`
	Key        string `json:"key"`
	SeqNum     uint32 `json:"seq_num"`
	NextHeader uint8  `json:"next_header"`
}

type IPsecDecryptRequest struct {
	Data string `json:"data"`
	SPI  uint32 `json:"spi"`
	Key  string `json:"key"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type StatusResponse struct {
	Status       string `json:"status"`
	DataPlane    string `json:"data_plane"`
	TunnelCount  int    `json:"tunnel_count"`
	SessionCount int    `json:"session_count"`
}

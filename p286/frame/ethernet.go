package frame

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
)

const (
	EtherTypeIPv4 uint16 = 0x0800
	EtherTypeIPv6 uint16 = 0x86DD
	EtherTypeARP  uint16 = 0x0806
	EtherTypeVLAN uint16 = 0x8100

	EthernetHeaderLen = 14
	VLANHeaderLen     = 4

	AVPHdrLen = 6
)

type AVPType uint16

const (
	AVPMessageType       AVPType = 0
	AVPResultCode        AVPType = 1
	AVPProtocolVersion   AVPType = 2
	AVPFramingCap        AVPType = 3
	AVPTunnelID          AVPType = 54
	AVPSessionID         AVPType = 55
	AVPCookie            AVPType = 59
	AVPPeerCookie        AVPType = 60
	AVPTunnelAssignedID  AVPType = 61
	AVPSessionAssignedID AVPType = 62
	AVPL2SpecType        AVPType = 65
)

type AVP struct {
	Type      AVPType
	Length    uint16
	VendorID  uint32
	Value     []byte
	Mandatory bool
	Hidden    bool
}

type L2TPv3ControlMessage struct {
	ControlFlags  uint16
	Version       uint8
	MessageType   uint8
	Length        uint16
	ControlConnID uint32
	Ns            uint16
	Nr            uint16
	AVPs          []*AVP
}

func NewAVP(avpType AVPType, value []byte, mandatory, hidden bool, vendorID uint32) *AVP {
	length := uint16(AVPHdrLen + len(value))
	return &AVP{
		Type:      avpType,
		Length:    length,
		VendorID:  vendorID,
		Value:     value,
		Mandatory: mandatory,
		Hidden:    hidden,
	}
}

func NewCookieAVP(cookie []byte, mandatory bool) *AVP {
	return NewAVP(AVPCookie, cookie, mandatory, false, 0)
}

func NewPeerCookieAVP(cookie []byte, mandatory bool) *AVP {
	return NewAVP(AVPPeerCookie, cookie, mandatory, false, 0)
}

func NewSessionIDAVP(sessionID uint32, mandatory bool) *AVP {
	value := make([]byte, 4)
	binary.BigEndian.PutUint32(value, sessionID)
	return NewAVP(AVPSessionID, value, mandatory, false, 0)
}

func (a *AVP) Marshal() []byte {
	buf := make([]byte, a.Length)
	flags := uint16(0)
	if a.Mandatory {
		flags |= 0x8000
	}
	if a.Hidden {
		flags |= 0x4000
	}
	if a.VendorID != 0 {
		flags |= 0x2000
	}

	binary.BigEndian.PutUint16(buf[0:2], flags|(uint16(a.Type)&0x03FF))
	binary.BigEndian.PutUint16(buf[2:4], a.Length)

	offset := 4
	if a.VendorID != 0 {
		binary.BigEndian.PutUint32(buf[4:8], a.VendorID)
		offset = 8
	}
	copy(buf[offset:], a.Value)
	return buf
}

func (a *AVP) String() string {
	return fmt.Sprintf("AVP(Type=%d, Len=%d, VendorID=%d, ValueHex=%s, Mandatory=%v, Hidden=%v)",
		a.Type, a.Length, a.VendorID, hex.EncodeToString(a.Value), a.Mandatory, a.Hidden)
}

type PacketValidationResult int

const (
	PacketValid PacketValidationResult = iota
	PacketInvalidSessionID
	PacketInvalidCookie
	PacketTooShort
	PacketNoSession
)

func (r PacketValidationResult) String() string {
	switch r {
	case PacketValid:
		return "VALID"
	case PacketInvalidSessionID:
		return "INVALID_SESSION_ID"
	case PacketInvalidCookie:
		return "INVALID_COOKIE"
	case PacketTooShort:
		return "PACKET_TOO_SHORT"
	case PacketNoSession:
		return "NO_SESSION"
	default:
		return "UNKNOWN"
	}
}

type SessionInfo struct {
	SessionID     uint32
	PeerSessionID uint32
	Cookie        []byte
	PeerCookie    []byte
	Name          string
	TunnelName    string
	Pseudowire    string
}

type DispatchResult struct {
	SessionID      uint32
	Cookie         []byte
	ExpectedCookie []byte
	Payload        []byte
	EthFrame       *EthernetFrame
	Validation     PacketValidationResult
	SessionName    string
	TunnelName     string
	Pseudowire     string
}

type PseudowireDispatcher struct {
	sessions map[uint32]*SessionInfo
}

func NewPseudowireDispatcher() *PseudowireDispatcher {
	return &PseudowireDispatcher{
		sessions: make(map[uint32]*SessionInfo),
	}
}

func (d *PseudowireDispatcher) AddSession(sessionID, peerSessionID uint32, cookie, peerCookie []byte, name, tunnelName string) {
	d.sessions[sessionID] = &SessionInfo{
		SessionID:     sessionID,
		PeerSessionID: peerSessionID,
		Cookie:        cookie,
		PeerCookie:    peerCookie,
		Name:          name,
		TunnelName:    tunnelName,
		Pseudowire:    "eth",
	}
}

func (d *PseudowireDispatcher) RemoveSession(sessionID uint32) {
	delete(d.sessions, sessionID)
}

func (d *PseudowireDispatcher) GetSession(sessionID uint32) (*SessionInfo, bool) {
	info, ok := d.sessions[sessionID]
	return info, ok
}

func (d *PseudowireDispatcher) ListSessions() []*SessionInfo {
	result := make([]*SessionInfo, 0, len(d.sessions))
	for _, s := range d.sessions {
		result = append(result, s)
	}
	return result
}

func (d *PseudowireDispatcher) DispatchPacket(packet []byte, cookieLen int) *DispatchResult {
	result := &DispatchResult{
		Validation: PacketValid,
	}

	if len(packet) < 4+cookieLen {
		result.Validation = PacketTooShort
		return result
	}

	sessionID := binary.BigEndian.Uint32(packet[0:4])
	result.SessionID = sessionID

	offset := 4
	if cookieLen > 0 {
		result.Cookie = make([]byte, cookieLen)
		copy(result.Cookie, packet[offset:offset+cookieLen])
		offset += cookieLen
	}

	session, ok := d.sessions[sessionID]
	if !ok {
		result.Validation = PacketNoSession
		result.Payload = packet[offset:]
		return result
	}

	result.SessionName = session.Name
	result.TunnelName = session.TunnelName
	result.Pseudowire = session.Pseudowire
	result.ExpectedCookie = session.PeerCookie

	if len(session.PeerCookie) > 0 {
		if len(result.Cookie) != len(session.PeerCookie) {
			result.Validation = PacketInvalidCookie
			result.Payload = packet[offset:]
			return result
		}
		if !ValidateCookie(result.Cookie, session.PeerCookie) {
			result.Validation = PacketInvalidCookie
			result.Payload = packet[offset:]
			return result
		}
	}

	result.Payload = packet[offset:]

	ethFrame, err := ParseEthernetFrame(result.Payload)
	if err == nil {
		result.EthFrame = ethFrame
	}

	return result
}

func (d *PseudowireDispatcher) DispatchAndForward(packet []byte, cookieLen int, forwardFunc func(*DispatchResult) error) error {
	result := d.DispatchPacket(packet, cookieLen)
	if result.Validation != PacketValid {
		return fmt.Errorf("packet validation failed: %s", result.Validation)
	}
	return forwardFunc(result)
}

type EthernetFrame struct {
	DstMAC    [6]byte
	SrcMAC    [6]byte
	VLANID    uint16
	IsVLAN    bool
	EtherType uint16
	Payload   []byte
}

func ParseEthernetFrame(data []byte) (*EthernetFrame, error) {
	if len(data) < EthernetHeaderLen {
		return nil, fmt.Errorf("frame too short: %d bytes, minimum %d", len(data), EthernetHeaderLen)
	}

	f := &EthernetFrame{}
	copy(f.DstMAC[:], data[0:6])
	copy(f.SrcMAC[:], data[6:12])

	offset := 12
	etherType := binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	if etherType == EtherTypeVLAN {
		if len(data) < EthernetHeaderLen+VLANHeaderLen {
			return nil, fmt.Errorf("VLAN frame too short: %d bytes", len(data))
		}
		f.IsVLAN = true
		vlanTCI := binary.BigEndian.Uint16(data[offset : offset+2])
		f.VLANID = vlanTCI & 0x0FFF
		offset += 2
		f.EtherType = binary.BigEndian.Uint16(data[offset : offset+2])
		offset += 2
	} else {
		f.EtherType = etherType
	}

	f.Payload = data[offset:]
	return f, nil
}

func (f *EthernetFrame) Marshal() ([]byte, error) {
	var buf []byte

	if f.IsVLAN {
		buf = make([]byte, 0, EthernetHeaderLen+VLANHeaderLen+len(f.Payload))
		buf = append(buf, f.DstMAC[:]...)
		buf = append(buf, f.SrcMAC[:]...)

		vlanHeader := make([]byte, 4)
		binary.BigEndian.PutUint16(vlanHeader[0:2], EtherTypeVLAN)
		binary.BigEndian.PutUint16(vlanHeader[2:4], f.VLANID&0x0FFF)
		buf = append(buf, vlanHeader...)

		et := make([]byte, 2)
		binary.BigEndian.PutUint16(et, f.EtherType)
		buf = append(buf, et...)
	} else {
		buf = make([]byte, 0, EthernetHeaderLen+len(f.Payload))
		buf = append(buf, f.DstMAC[:]...)
		buf = append(buf, f.SrcMAC[:]...)

		et := make([]byte, 2)
		binary.BigEndian.PutUint16(et, f.EtherType)
		buf = append(buf, et...)
	}

	buf = append(buf, f.Payload...)
	return buf, nil
}

func (f *EthernetFrame) String() string {
	vlanStr := ""
	if f.IsVLAN {
		vlanStr = fmt.Sprintf(" VLAN=%d", f.VLANID)
	}
	return fmt.Sprintf("DstMAC=%s SrcMAC=%s EtherType=0x%04x%s PayloadLen=%d",
		MACToString(f.DstMAC),
		MACToString(f.SrcMAC),
		f.EtherType,
		vlanStr,
		len(f.Payload),
	)
}

func MACToString(mac [6]byte) string {
	return fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x",
		mac[0], mac[1], mac[2], mac[3], mac[4], mac[5])
}

func StringToMAC(s string) ([6]byte, error) {
	var mac [6]byte
	n, err := fmt.Sscanf(s, "%02x:%02x:%02x:%02x:%02x:%02x",
		&mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5])
	if err != nil || n != 6 {
		return mac, fmt.Errorf("invalid MAC address %q", s)
	}
	return mac, nil
}

func EtherTypeToString(et uint16) string {
	switch et {
	case EtherTypeIPv4:
		return "IPv4"
	case EtherTypeIPv6:
		return "IPv6"
	case EtherTypeARP:
		return "ARP"
	case EtherTypeVLAN:
		return "VLAN"
	default:
		return fmt.Sprintf("0x%04x", et)
	}
}

type L2TPv3Header struct {
	SessionID uint32
	Cookie    []byte
	L2Spec    []byte
	HasCookie bool
	CookieLen int
}

func BuildL2TPv3OverIPHeader(sessionID uint32, cookie []byte, l2SpecType uint8) []byte {
	headerLen := 4
	if len(cookie) > 0 {
		headerLen += len(cookie)
	}
	if l2SpecType != 0 {
		headerLen += 4
	}

	buf := make([]byte, headerLen)
	binary.BigEndian.PutUint32(buf[0:4], sessionID)

	offset := 4
	if len(cookie) > 0 {
		copy(buf[offset:], cookie)
		offset += len(cookie)
	}

	return buf
}

func BuildL2TPv3OverUDPHeader(sessionID uint32, cookie []byte, l2SpecType uint8) []byte {
	return BuildL2TPv3OverIPHeader(sessionID, cookie, l2SpecType)
}

func EncapsulateL2TPv3(sessionID uint32, cookie []byte, ethFrame []byte) []byte {
	l2tpHeader := BuildL2TPv3OverIPHeader(sessionID, cookie, 0)
	encap := make([]byte, 0, len(l2tpHeader)+len(ethFrame))
	encap = append(encap, l2tpHeader...)
	encap = append(encap, ethFrame...)
	return encap
}

func DecapsulateL2TPv3(data []byte, cookieLen int) (uint32, []byte, []byte, error) {
	minLen := 4 + cookieLen
	if len(data) < minLen {
		return 0, nil, nil, fmt.Errorf("packet too short for L2TPv3 header: %d bytes", len(data))
	}

	sessionID := binary.BigEndian.Uint32(data[0:4])
	offset := 4

	var cookie []byte
	if cookieLen > 0 {
		cookie = make([]byte, cookieLen)
		copy(cookie, data[offset:offset+cookieLen])
		offset += cookieLen
	}

	payload := data[offset:]
	return sessionID, cookie, payload, nil
}

func ValidateCookie(received, expected []byte) bool {
	if len(received) != len(expected) {
		return false
	}
	for i := range received {
		if received[i] != expected[i] {
			return false
		}
	}
	return true
}

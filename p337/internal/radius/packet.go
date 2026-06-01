package radius

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
	"net"
	"time"
)

type PacketCode uint8

const (
	CodeAccessRequest      PacketCode = 1
	CodeAccessAccept       PacketCode = 2
	CodeAccessReject       PacketCode = 3
	CodeAccountingRequest  PacketCode = 4
	CodeAccountingResponse PacketCode = 5
	CodeAccessChallenge    PacketCode = 11
	CodeDisconnectRequest  PacketCode = 40
	CodeDisconnectACK      PacketCode = 41
	CodeDisconnectNAK      PacketCode = 42
	CodeCoARequest         PacketCode = 43
	CodeCoAACK             PacketCode = 44
	CodeCoANAK             PacketCode = 45
)

func (c PacketCode) String() string {
	names := map[PacketCode]string{
		CodeAccessRequest:      "Access-Request",
		CodeAccessAccept:       "Access-Accept",
		CodeAccessReject:       "Access-Reject",
		CodeAccountingRequest:  "Accounting-Request",
		CodeAccountingResponse: "Accounting-Response",
		CodeAccessChallenge:    "Access-Challenge",
		CodeDisconnectRequest:  "Disconnect-Request",
		CodeDisconnectACK:      "Disconnect-ACK",
		CodeDisconnectNAK:      "Disconnect-NAK",
		CodeCoARequest:         "CoA-Request",
		CodeCoAACK:             "CoA-ACK",
		CodeCoANAK:             "CoA-NAK",
	}
	if name, ok := names[c]; ok {
		return name
	}
	return fmt.Sprintf("Unknown(%d)", c)
}

type AttributeType uint8

const (
	AttrUserName               AttributeType = 1
	AttrUserPassword           AttributeType = 2
	AttrCHAPPassword           AttributeType = 3
	AttrNASIPAddress           AttributeType = 4
	AttrNASPort                AttributeType = 5
	AttrServiceType            AttributeType = 6
	AttrFramedProtocol         AttributeType = 7
	AttrFramedIPAddress        AttributeType = 8
	AttrFramedIPNetmask        AttributeType = 9
	AttrFramedRouting          AttributeType = 10
	AttrFilterId               AttributeType = 11
	AttrFramedMTU              AttributeType = 12
	AttrFramedCompression      AttributeType = 13
	AttrLoginIPHost            AttributeType = 14
	AttrLoginService           AttributeType = 15
	AttrLoginTCPPort           AttributeType = 16
	AttrReplyMessage           AttributeType = 18
	AttrCallbackNumber         AttributeType = 19
	AttrCallbackId             AttributeType = 20
	AttrFramedRoute            AttributeType = 22
	AttrFramedIPXNetwork       AttributeType = 23
	AttrState                  AttributeType = 24
	AttrClass                  AttributeType = 25
	AttrVendorSpecific         AttributeType = 26
	AttrSessionTimeout         AttributeType = 27
	AttrIdleTimeout            AttributeType = 28
	AttrTerminationAction      AttributeType = 29
	AttrCalledStationId        AttributeType = 30
	AttrCallingStationId       AttributeType = 31
	AttrNASIdentifier          AttributeType = 32
	AttrProxyState             AttributeType = 33
	AttrLoginLATService        AttributeType = 34
	AttrLoginLATNode           AttributeType = 35
	AttrLoginLATGroup          AttributeType = 36
	AttrFramedAppleTalkLink    AttributeType = 37
	AttrFramedAppleTalkNetwork AttributeType = 38
	AttrFramedAppleTalkZone    AttributeType = 39
	AttrAcctStatusType         AttributeType = 40
	AttrAcctDelayTime          AttributeType = 41
	AttrAcctInputOctets        AttributeType = 42
	AttrAcctOutputOctets       AttributeType = 43
	AttrAcctSessionId          AttributeType = 44
	AttrAcctAuthentic          AttributeType = 45
	AttrAcctSessionTime        AttributeType = 46
	AttrAcctInputPackets       AttributeType = 47
	AttrAcctOutputPackets      AttributeType = 48
	AttrAcctTerminateCause     AttributeType = 49
	AttrNASPortType            AttributeType = 61
	AttrTunnelType             AttributeType = 64
	AttrTunnelMediumType       AttributeType = 65
	AttrTunnelPrivateGroupID   AttributeType = 81
)

func (a AttributeType) String() string {
	names := map[AttributeType]string{
		AttrUserName:             "User-Name",
		AttrUserPassword:         "User-Password",
		AttrCHAPPassword:         "CHAP-Password",
		AttrNASIPAddress:         "NAS-IP-Address",
		AttrNASPort:              "NAS-Port",
		AttrServiceType:          "Service-Type",
		AttrFramedProtocol:       "Framed-Protocol",
		AttrFramedIPAddress:      "Framed-IP-Address",
		AttrReplyMessage:         "Reply-Message",
		AttrState:                "State",
		AttrSessionTimeout:       "Session-Timeout",
		AttrIdleTimeout:          "Idle-Timeout",
		AttrNASIdentifier:        "NAS-Identifier",
		AttrCalledStationId:      "Called-Station-Id",
		AttrCallingStationId:     "Calling-Station-Id",
		AttrAcctStatusType:       "Acct-Status-Type",
		AttrAcctSessionId:        "Acct-Session-Id",
		AttrAcctSessionTime:      "Acct-Session-Time",
		AttrAcctInputOctets:      "Acct-Input-Octets",
		AttrAcctOutputOctets:     "Acct-Output-Octets",
		AttrAcctTerminateCause:   "Acct-Terminate-Cause",
		AttrNASPortType:          "NAS-Port-Type",
		AttrTunnelPrivateGroupID: "Tunnel-Private-Group-ID",
	}
	if name, ok := names[a]; ok {
		return name
	}
	return fmt.Sprintf("Attr(%d)", a)
}

type Attribute struct {
	Type  AttributeType
	Value []byte
}

func (a *Attribute) Encode() []byte {
	buf := make([]byte, 2+len(a.Value))
	buf[0] = uint8(a.Type)
	buf[1] = uint8(2 + len(a.Value))
	copy(buf[2:], a.Value)
	return buf
}

func DecodeAttribute(data []byte) (*Attribute, int, error) {
	if len(data) < 2 {
		return nil, 0, fmt.Errorf("attribute too short")
	}
	length := int(data[1])
	if length < 2 || length > len(data) {
		return nil, 0, fmt.Errorf("invalid attribute length %d", length)
	}
	return &Attribute{
		Type:  AttributeType(data[0]),
		Value: data[2:length],
	}, length, nil
}

func StringAttribute(attrType AttributeType, value string) *Attribute {
	return &Attribute{Type: attrType, Value: []byte(value)}
}

func IPAttribute(attrType AttributeType, ip net.IP) *Attribute {
	ip4 := ip.To4()
	if ip4 == nil {
		ip4 = net.ParseIP("0.0.0.0").To4()
	}
	return &Attribute{Type: attrType, Value: ip4}
}

func Uint32Attribute(attrType AttributeType, value uint32) *Attribute {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, value)
	return &Attribute{Type: attrType, Value: buf}
}

type Packet struct {
	Code          PacketCode
	Identifier    uint8
	Length        uint16
	Authenticator [16]byte
	Attributes    []*Attribute
	Secret        string
}

func NewPacket(code PacketCode, identifier uint8, secret string) *Packet {
	p := &Packet{
		Code:       code,
		Identifier: identifier,
		Secret:     secret,
		Attributes: make([]*Attribute, 0),
	}
	rand.Read(p.Authenticator[:])
	return p
}

func (p *Packet) AddAttribute(attr *Attribute) {
	p.Attributes = append(p.Attributes, attr)
}

func (p *Packet) GetAttribute(attrType AttributeType) *Attribute {
	for _, a := range p.Attributes {
		if a.Type == attrType {
			return a
		}
	}
	return nil
}

func (p *Packet) GetAttributes(attrType AttributeType) []*Attribute {
	var result []*Attribute
	for _, a := range p.Attributes {
		if a.Type == attrType {
			result = append(result, a)
		}
	}
	return result
}

func (p *Packet) Encode() ([]byte, error) {
	attrData := make([]byte, 0)
	for _, a := range p.Attributes {
		attrData = append(attrData, a.Encode()...)
	}

	p.Length = uint16(20 + len(attrData))
	if p.Length > 4096 {
		return nil, fmt.Errorf("packet too large: %d", p.Length)
	}

	buf := make([]byte, p.Length)
	buf[0] = uint8(p.Code)
	buf[1] = p.Identifier
	binary.BigEndian.PutUint16(buf[2:4], p.Length)

	if p.Code == CodeAccessRequest || p.Code == CodeAccountingRequest {
		copy(buf[4:20], p.Authenticator[:])
	} else {
		copy(buf[4:20], p.Authenticator[:])
	}

	copy(buf[20:], attrData)

	return buf, nil
}

func DecodePacket(data []byte, secret string) (*Packet, error) {
	if len(data) < 20 {
		return nil, fmt.Errorf("packet too short: %d bytes", len(data))
	}

	p := &Packet{
		Code:       PacketCode(data[0]),
		Identifier: data[1],
		Length:     binary.BigEndian.Uint16(data[2:4]),
		Secret:     secret,
	}
	copy(p.Authenticator[:], data[4:20])

	if int(p.Length) > len(data) {
		return nil, fmt.Errorf("packet length mismatch: header says %d, got %d", p.Length, len(data))
	}

	offset := 20
	for offset < int(p.Length) {
		attr, attrLen, err := DecodeAttribute(data[offset:])
		if err != nil {
			return nil, fmt.Errorf("error decoding attribute at offset %d: %v", offset, err)
		}
		p.Attributes = append(p.Attributes, attr)
		offset += attrLen
	}

	return p, nil
}

func (p *Packet) Summary() map[string]interface{} {
	attrs := make([]map[string]interface{}, 0, len(p.Attributes))
	for _, a := range p.Attributes {
		attrInfo := map[string]interface{}{
			"type":    a.Type.String(),
			"type_id": int(a.Type),
			"length":  len(a.Value),
		}

		switch a.Type {
		case AttrUserName, AttrReplyMessage, AttrNASIdentifier, AttrCalledStationId,
			AttrCallingStationId, AttrAcctSessionId, AttrTunnelPrivateGroupID:
			attrInfo["value"] = string(a.Value)
		case AttrNASIPAddress, AttrFramedIPAddress:
			if len(a.Value) >= 4 {
				attrInfo["value"] = net.IP(a.Value).String()
			}
		case AttrSessionTimeout, AttrIdleTimeout, AttrAcctStatusType, AttrAcctSessionTime,
			AttrAcctInputOctets, AttrAcctOutputOctets, AttrNASPort, AttrServiceType,
			AttrFramedProtocol, AttrAcctTerminateCause, AttrNASPortType:
			if len(a.Value) >= 4 {
				attrInfo["value"] = binary.BigEndian.Uint32(a.Value)
			}
		default:
			attrInfo["value"] = fmt.Sprintf("%x", a.Value)
		}
		attrs = append(attrs, attrInfo)
	}

	return map[string]interface{}{
		"code":          p.Code.String(),
		"code_id":       int(p.Code),
		"identifier":    int(p.Identifier),
		"length":        int(p.Length),
		"authenticator": fmt.Sprintf("%x", p.Authenticator[:8]),
		"attributes":    attrs,
	}
}

type AccountingStatusType uint32

const (
	AcctStatusStart   AccountingStatusType = 1
	AcctStatusStop    AccountingStatusType = 2
	AcctStatusInterim AccountingStatusType = 3
	AcctStatusOn      AccountingStatusType = 7
	AcctStatusOff     AccountingStatusType = 8
)

type TerminationCause uint32

const (
	TerminateUserRequest        TerminationCause = 1
	TerminateLostCarrier        TerminationCause = 2
	TerminateLostService        TerminationCause = 3
	TerminateIdleTimeout        TerminationCause = 4
	TerminateSessionTimeout     TerminationCause = 5
	TerminateAdminReset         TerminationCause = 6
	TerminateAdminReboot        TerminationCause = 7
	TerminatePortError          TerminationCause = 8
	TerminateNASError           TerminationCause = 9
	TerminateNASRequest         TerminationCause = 10
	TerminateNASReboot          TerminationCause = 11
	TerminatePortUnneeded       TerminationCause = 12
	TerminatePortPreempted      TerminationCause = 13
	TerminatePortSuspended      TerminationCause = 14
	TerminateServiceUnavailable TerminationCause = 15
	TerminateCallback           TerminationCause = 16
	TerminateUserError          TerminationCause = 17
	TerminateHostRequest        TerminationCause = 18
)

func (t TerminationCause) String() string {
	names := map[TerminationCause]string{
		TerminateUserRequest:        "User-Request",
		TerminateLostCarrier:        "Lost-Carrier",
		TerminateLostService:        "Lost-Service",
		TerminateIdleTimeout:        "Idle-Timeout",
		TerminateSessionTimeout:     "Session-Timeout",
		TerminateAdminReset:         "Admin-Reset",
		TerminateAdminReboot:        "Admin-Reboot",
		TerminatePortError:          "Port-Error",
		TerminateNASError:           "NAS-Error",
		TerminateNASRequest:         "NAS-Request",
		TerminateNASReboot:          "NAS-Reboot",
		TerminatePortUnneeded:       "Port-Unneeded",
		TerminatePortPreempted:      "Port-Preempted",
		TerminatePortSuspended:      "Port-Suspended",
		TerminateServiceUnavailable: "Service-Unavailable",
		TerminateCallback:           "Callback",
		TerminateUserError:          "User-Error",
		TerminateHostRequest:        "Host-Request",
	}
	if name, ok := names[t]; ok {
		return name
	}
	return fmt.Sprintf("Unknown(%d)", t)
}

type RADIUSTime time.Time

func NowRADIUSTime() uint32 {
	return uint32(time.Now().Unix())
}

package radius

import (
	"crypto/md5"
	"encoding/binary"
	"errors"
	"net"
)

const (
	CodeAccessRequest      = 1
	CodeAccessAccept       = 2
	CodeAccessReject       = 3
	CodeAccountingRequest  = 4
	CodeAccountingResponse = 5
	CodeDisconnectRequest  = 40
	CodeDisconnectACK      = 41
	CodeDisconnectNAK      = 42
	CodeCoARequest         = 43
	CodeCoAACK             = 44
	CodeCoANAK             = 45
)

const (
	AttrUserName           = 1
	AttrUserPassword       = 2
	AttrNASIPAddress       = 4
	AttrNASPort            = 5
	AttrServiceType        = 6
	AttrFramedProtocol     = 7
	AttrFramedIPAddress    = 8
	AttrFilterID           = 11
	AttrFramedMTU          = 12
	AttrCallingStationID   = 31
	AttrNASIdentifier      = 32
	AttrAcctStatusType     = 40
	AttrAcctDelayTime      = 41
	AttrAcctInputOctets    = 42
	AttrAcctOutputOctets   = 43
	AttrAcctSessionID      = 44
	AttrAcctAuthentic      = 45
	AttrAcctSessionTime    = 46
	AttrAcctInputPackets   = 47
	AttrAcctOutputPackets  = 48
	AttrAcctTerminateCause = 49
	AttrErrorCause         = 101
	AttrVendorSpecific     = 26
)

const (
	AcctStatusTypeStart         = 1
	AcctStatusTypeStop          = 2
	AcctStatusTypeInterimUpdate = 3
	AcctStatusTypeAccountingOn  = 7
	AcctStatusTypeAccountingOff = 8
)

type Packet struct {
	Code          uint8
	Identifier    uint8
	Length        uint16
	Authenticator [16]byte
	Attributes    []*Attribute
}

type Attribute struct {
	Type   uint8
	Length uint8
	Value  []byte
}

func NewPacket(code uint8, secret []byte) *Packet {
	return &Packet{
		Code:       code,
		Identifier: uint8(0),
		Attributes: make([]*Attribute, 0),
	}
}

func ParsePacket(data []byte) (*Packet, error) {
	if len(data) < 20 {
		return nil, errors.New("packet too short")
	}

	p := &Packet{
		Code:       data[0],
		Identifier: data[1],
		Length:     binary.BigEndian.Uint16(data[2:4]),
	}

	if int(p.Length) > len(data) {
		return nil, errors.New("invalid packet length")
	}

	copy(p.Authenticator[:], data[4:20])

	offset := 20
	for offset < int(p.Length) {
		if offset+2 > int(p.Length) {
			return nil, errors.New("invalid attribute")
		}

		attrType := data[offset]
		attrLen := data[offset+1]

		if int(attrLen) < 2 || offset+int(attrLen) > int(p.Length) {
			return nil, errors.New("invalid attribute length")
		}

		attr := &Attribute{
			Type:   attrType,
			Length: attrLen,
			Value:  make([]byte, attrLen-2),
		}
		copy(attr.Value, data[offset+2:offset+int(attrLen)])

		p.Attributes = append(p.Attributes, attr)
		offset += int(attrLen)
	}

	return p, nil
}

func (p *Packet) Encode() ([]byte, error) {
	attrData := make([]byte, 0)
	for _, attr := range p.Attributes {
		attrData = append(attrData, attr.Type)
		attrData = append(attrData, attr.Length)
		attrData = append(attrData, attr.Value...)
	}

	p.Length = uint16(20 + len(attrData))

	data := make([]byte, p.Length)
	data[0] = p.Code
	data[1] = p.Identifier
	binary.BigEndian.PutUint16(data[2:4], p.Length)
	copy(data[4:20], p.Authenticator[:])
	copy(data[20:], attrData)

	return data, nil
}

func (p *Packet) Add(attrType uint8, value []byte) {
	attr := &Attribute{
		Type:   attrType,
		Length: uint8(2 + len(value)),
		Value:  value,
	}
	p.Attributes = append(p.Attributes, attr)
}

func (p *Packet) AddString(attrType uint8, value string) {
	p.Add(attrType, []byte(value))
}

func (p *Packet) AddIP(attrType uint8, ip net.IP) {
	p.Add(attrType, ip.To4())
}

func (p *Packet) AddUint32(attrType uint8, value uint32) {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, value)
	p.Add(attrType, b)
}

func (p *Packet) Get(attrType uint8) *Attribute {
	for _, attr := range p.Attributes {
		if attr.Type == attrType {
			return attr
		}
	}
	return nil
}

func (p *Packet) GetString(attrType uint8) string {
	attr := p.Get(attrType)
	if attr == nil {
		return ""
	}
	return string(attr.Value)
}

func (p *Packet) GetIP(attrType uint8) net.IP {
	attr := p.Get(attrType)
	if attr == nil || len(attr.Value) != 4 {
		return net.IPv4zero
	}
	return net.IP(attr.Value)
}

func (p *Packet) GetUint32(attrType uint8) uint32 {
	attr := p.Get(attrType)
	if attr == nil || len(attr.Value) != 4 {
		return 0
	}
	return binary.BigEndian.Uint32(attr.Value)
}

func DecryptPassword(encrypted, secret, authenticator []byte) string {
	if len(encrypted) != 16 {
		return ""
	}

	hash := md5.New()
	hash.Write(secret)
	hash.Write(authenticator)
	sum := hash.Sum(nil)

	decrypted := make([]byte, 16)
	for i := 0; i < 16; i++ {
		decrypted[i] = encrypted[i] ^ sum[i]
	}

	for i := 15; i >= 0; i-- {
		if decrypted[i] == 0 {
			decrypted = decrypted[:i]
		} else {
			break
		}
	}

	return string(decrypted)
}

func VerifyResponse(original, response *Packet, secret []byte) bool {
	data, _ := response.Encode()

	hash := md5.New()
	hash.Write(data[:4])
	hash.Write(original.Authenticator[:])
	hash.Write(data[20:])
	hash.Write(secret)
	sum := hash.Sum(nil)

	for i := 0; i < 16; i++ {
		if sum[i] != data[4+i] {
			return false
		}
	}
	return true
}

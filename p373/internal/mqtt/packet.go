package mqtt

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	PacketTypeCONNECT     = 1
	PacketTypeCONNACK     = 2
	PacketTypePUBLISH     = 3
	PacketTypePUBACK      = 4
	PacketTypeSUBSCRIBE   = 8
	PacketTypeSUBACK      = 9
	PacketTypeUNSUBSCRIBE = 10
	PacketTypeUNSUBACK    = 11
	PacketTypePINGREQ     = 12
	PacketTypePINGRESP    = 13
	PacketTypeDISCONNECT  = 14
)

type Packet interface {
	Type() byte
	Encode() ([]byte, error)
}

type ConnectPacket struct {
	ProtocolName  string
	ProtocolLevel byte
	CleanSession  bool
	WillFlag      bool
	WillQoS       byte
	WillRetain    bool
	UsernameFlag  bool
	PasswordFlag  bool
	KeepAlive     uint16
	ClientID      string
	WillTopic     string
	WillMessage   []byte
	Username      string
	Password      string
}

func (p *ConnectPacket) Type() byte { return PacketTypeCONNECT }

type ConnackPacket struct {
	SessionPresent bool
	ReturnCode     byte
}

func (p *ConnackPacket) Type() byte { return PacketTypeCONNACK }

type PublishPacket struct {
	Dup     bool
	QoS     byte
	Retain  bool
	Topic   string
	PacketID uint16
	Payload []byte
}

func (p *PublishPacket) Type() byte { return PacketTypePUBLISH }

type PubackPacket struct {
	PacketID uint16
}

func (p *PubackPacket) Type() byte { return PacketTypePUBACK }

type SubscribePacket struct {
	PacketID   uint16
	TopicFilters []TopicFilter
}

type TopicFilter struct {
	Topic string
	QoS   byte
}

func (p *SubscribePacket) Type() byte { return PacketTypeSUBSCRIBE }

type SubackPacket struct {
	PacketID     uint16
	ReturnCodes  []byte
}

func (p *SubackPacket) Type() byte { return PacketTypeSUBACK }

type PingreqPacket struct{}

func (p *PingreqPacket) Type() byte { return PacketTypePINGREQ }

type PingrespPacket struct{}

func (p *PingrespPacket) Type() byte { return PacketTypePINGRESP }

type DisconnectPacket struct{}

func (p *DisconnectPacket) Type() byte { return PacketTypeDISCONNECT }

func decodeUTF8(data []byte) (string, []byte, error) {
	if len(data) < 2 {
		return "", nil, errors.New("insufficient data for UTF-8 string")
	}
	length := binary.BigEndian.Uint16(data[:2])
	if len(data) < int(2+length) {
		return "", nil, errors.New("insufficient data for UTF-8 string content")
	}
	return string(data[2 : 2+length]), data[2+length:], nil
}

func encodeUTF8(s string) []byte {
	b := make([]byte, 2+len(s))
	binary.BigEndian.PutUint16(b[:2], uint16(len(s)))
	copy(b[2:], s)
	return b
}

func decodeRemainingLength(data []byte) (int, []byte, error) {
	multiplier := 1
	value := 0
	idx := 0
	for {
		if idx >= len(data) {
			return 0, nil, errors.New("insufficient data for remaining length")
		}
		encodedByte := data[idx]
		idx++
		value += int(encodedByte&127) * multiplier
		if encodedByte&128 == 0 {
			break
		}
		multiplier *= 128
		if multiplier > 128*128*128 {
			return 0, nil, errors.New("malformed remaining length")
		}
	}
	return value, data[idx:], nil
}

func encodeRemainingLength(length int) []byte {
	var result []byte
	for {
		encodedByte := byte(length % 128)
		length /= 128
		if length > 0 {
			encodedByte |= 128
		}
		result = append(result, encodedByte)
		if length == 0 {
			break
		}
	}
	return result
}

func DecodePacket(data []byte) (Packet, []byte, error) {
	if len(data) < 2 {
		return nil, data, io.ErrShortBuffer
	}

	firstByte := data[0]
	packetType := (firstByte >> 4) & 0x0F
	flags := firstByte & 0x0F

	remainingLength, rest, err := decodeRemainingLength(data[1:])
	if err != nil {
		return nil, data, err
	}

	totalLength := 1 + len(data[1:]) - len(rest) + remainingLength
	if len(data) < totalLength {
		return nil, data, io.ErrShortBuffer
	}

	packetData := rest[:remainingLength]
	remaining := rest[remainingLength:]

	switch packetType {
	case PacketTypeCONNECT:
		return decodeConnect(packetData, flags), remaining, nil
	case PacketTypeCONNACK:
		return decodeConnack(packetData), remaining, nil
	case PacketTypePUBLISH:
		return decodePublish(packetData, flags), remaining, nil
	case PacketTypePUBACK:
		return decodePuback(packetData), remaining, nil
	case PacketTypeSUBSCRIBE:
		return decodeSubscribe(packetData, flags), remaining, nil
	case PacketTypeSUBACK:
		return decodeSuback(packetData), remaining, nil
	case PacketTypeUNSUBSCRIBE:
		return &DisconnectPacket{}, remaining, nil
	case PacketTypeUNSUBACK:
		return &DisconnectPacket{}, remaining, nil
	case PacketTypePINGREQ:
		return &PingreqPacket{}, remaining, nil
	case PacketTypePINGRESP:
		return &PingrespPacket{}, remaining, nil
	case PacketTypeDISCONNECT:
		return &DisconnectPacket{}, remaining, nil
	default:
		return nil, remaining, fmt.Errorf("unknown packet type: %d", packetType)
	}
}

func decodeConnack(data []byte) Packet {
	p := &ConnackPacket{}
	if len(data) >= 1 {
		p.SessionPresent = data[0]&0x01 == 1
	}
	if len(data) >= 2 {
		p.ReturnCode = data[1]
	}
	return p
}

func decodeSuback(data []byte) Packet {
	p := &SubackPacket{}
	if len(data) >= 2 {
		p.PacketID = binary.BigEndian.Uint16(data[:2])
		p.ReturnCodes = data[2:]
	}
	return p
}

func decodeConnect(data []byte, flags byte) Packet {
	p := &ConnectPacket{}
	
	protocolName, rest, _ := decodeUTF8(data)
	p.ProtocolName = protocolName
	
	if len(rest) < 1 {
		return p
	}
	p.ProtocolLevel = rest[0]
	rest = rest[1:]
	
	if len(rest) < 1 {
		return p
	}
	connectFlags := rest[0]
	rest = rest[1:]
	
	p.UsernameFlag = (connectFlags >> 7) & 0x01 == 1
	p.PasswordFlag = (connectFlags >> 6) & 0x01 == 1
	p.WillRetain = (connectFlags >> 5) & 0x01 == 1
	p.WillQoS = (connectFlags >> 3) & 0x03
	p.WillFlag = (connectFlags >> 2) & 0x01 == 1
	p.CleanSession = (connectFlags >> 1) & 0x01 == 1
	
	if len(rest) < 2 {
		return p
	}
	p.KeepAlive = binary.BigEndian.Uint16(rest[:2])
	rest = rest[2:]
	
	clientID, rest, _ := decodeUTF8(rest)
	p.ClientID = clientID
	
	if p.WillFlag {
		willTopic, newRest, _ := decodeUTF8(rest)
		p.WillTopic = willTopic
		rest = newRest
		
		willMsgLen := binary.BigEndian.Uint16(rest[:2])
		p.WillMessage = rest[2 : 2+willMsgLen]
		rest = rest[2+willMsgLen:]
	}
	
	if p.UsernameFlag {
		username, newRest, _ := decodeUTF8(rest)
		p.Username = username
		rest = newRest
	}
	
	if p.PasswordFlag {
		password, _, _ := decodeUTF8(rest)
		p.Password = password
	}
	
	return p
}

func decodePublish(data []byte, flags byte) Packet {
	p := &PublishPacket{}
	p.Dup = (flags >> 3) & 0x01 == 1
	p.QoS = (flags >> 1) & 0x03
	p.Retain = flags & 0x01 == 1
	
	topic, rest, _ := decodeUTF8(data)
	p.Topic = topic
	
	if p.QoS > 0 && len(rest) >= 2 {
		p.PacketID = binary.BigEndian.Uint16(rest[:2])
		rest = rest[2:]
	}
	
	p.Payload = rest
	return p
}

func decodePuback(data []byte) Packet {
	p := &PubackPacket{}
	if len(data) >= 2 {
		p.PacketID = binary.BigEndian.Uint16(data[:2])
	}
	return p
}

func decodeSubscribe(data []byte, flags byte) Packet {
	p := &SubscribePacket{}
	if len(data) >= 2 {
		p.PacketID = binary.BigEndian.Uint16(data[:2])
		rest := data[2:]
		
		for len(rest) > 0 {
			topic, newRest, err := decodeUTF8(rest)
			if err != nil {
				break
			}
			rest = newRest
			qos := byte(0)
			if len(rest) > 0 {
				qos = rest[0] & 0x03
				rest = rest[1:]
			}
			p.TopicFilters = append(p.TopicFilters, TopicFilter{Topic: topic, QoS: qos})
		}
	}
	return p
}

func (p *ConnectPacket) Encode() ([]byte, error) {
	var buf bytes.Buffer
	
	buf.Write(encodeUTF8(p.ProtocolName))
	buf.WriteByte(p.ProtocolLevel)
	
	flags := byte(0)
	if p.UsernameFlag {
		flags |= 0x80
	}
	if p.PasswordFlag {
		flags |= 0x40
	}
	if p.WillRetain {
		flags |= 0x20
	}
	flags |= (p.WillQoS & 0x03) << 3
	if p.WillFlag {
		flags |= 0x04
	}
	if p.CleanSession {
		flags |= 0x02
	}
	buf.WriteByte(flags)
	
	keepAlive := make([]byte, 2)
	binary.BigEndian.PutUint16(keepAlive, p.KeepAlive)
	buf.Write(keepAlive)
	
	buf.Write(encodeUTF8(p.ClientID))
	
	if p.WillFlag {
		buf.Write(encodeUTF8(p.WillTopic))
		willMsgLen := make([]byte, 2)
		binary.BigEndian.PutUint16(willMsgLen, uint16(len(p.WillMessage)))
		buf.Write(willMsgLen)
		buf.Write(p.WillMessage)
	}
	
	if p.UsernameFlag {
		buf.Write(encodeUTF8(p.Username))
	}
	if p.PasswordFlag {
		buf.Write(encodeUTF8(p.Password))
	}
	
	payload := buf.Bytes()
	header := []byte{PacketTypeCONNECT << 4}
	header = append(header, encodeRemainingLength(len(payload))...)
	
	return append(header, payload...), nil
}

func (p *ConnackPacket) Encode() ([]byte, error) {
	header := []byte{PacketTypeCONNACK << 4, 2}
	flags := byte(0)
	if p.SessionPresent {
		flags |= 0x01
	}
	return append(header, flags, p.ReturnCode), nil
}

func (p *PublishPacket) Encode() ([]byte, error) {
	var buf bytes.Buffer
	
	buf.Write(encodeUTF8(p.Topic))
	
	if p.QoS > 0 {
		packetID := make([]byte, 2)
		binary.BigEndian.PutUint16(packetID, p.PacketID)
		buf.Write(packetID)
	}
	
	buf.Write(p.Payload)
	
	payload := buf.Bytes()
	flags := byte(0)
	if p.Dup {
		flags |= 0x08
	}
	flags |= (p.QoS & 0x03) << 1
	if p.Retain {
		flags |= 0x01
	}
	
	header := []byte{(PacketTypePUBLISH << 4) | flags}
	header = append(header, encodeRemainingLength(len(payload))...)
	
	return append(header, payload...), nil
}

func (p *PubackPacket) Encode() ([]byte, error) {
	header := []byte{PacketTypePUBACK << 4, 2}
	packetID := make([]byte, 2)
	binary.BigEndian.PutUint16(packetID, p.PacketID)
	return append(header, packetID...), nil
}

func (p *SubscribePacket) Encode() ([]byte, error) {
	var buf bytes.Buffer
	
	packetID := make([]byte, 2)
	binary.BigEndian.PutUint16(packetID, p.PacketID)
	buf.Write(packetID)
	
	for _, tf := range p.TopicFilters {
		buf.Write(encodeUTF8(tf.Topic))
		buf.WriteByte(tf.QoS)
	}
	
	payload := buf.Bytes()
	header := []byte{PacketTypeSUBSCRIBE << 4 | 0x02}
	header = append(header, encodeRemainingLength(len(payload))...)
	
	return append(header, payload...), nil
}

func (p *SubackPacket) Encode() ([]byte, error) {
	var buf bytes.Buffer
	
	packetID := make([]byte, 2)
	binary.BigEndian.PutUint16(packetID, p.PacketID)
	buf.Write(packetID)
	buf.Write(p.ReturnCodes)
	
	payload := buf.Bytes()
	header := []byte{PacketTypeSUBACK << 4}
	header = append(header, encodeRemainingLength(len(payload))...)
	
	return append(header, payload...), nil
}

func (p *PingreqPacket) Encode() ([]byte, error) {
	return []byte{PacketTypePINGREQ << 4, 0}, nil
}

func (p *PingrespPacket) Encode() ([]byte, error) {
	return []byte{PacketTypePINGRESP << 4, 0}, nil
}

func (p *DisconnectPacket) Encode() ([]byte, error) {
	return []byte{PacketTypeDISCONNECT << 4, 0}, nil
}

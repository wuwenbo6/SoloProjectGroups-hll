package mqttsn

type MsgType byte

const (
	ADVERTISE     MsgType = 0x00
	SEARCHGW      MsgType = 0x01
	GWINFO        MsgType = 0x02
	CONNECT       MsgType = 0x04
	CONNACK       MsgType = 0x05
	WILLTOPICREQ  MsgType = 0x06
	WILLTOPIC     MsgType = 0x07
	WILLMSGREQ    MsgType = 0x08
	WILLMSG       MsgType = 0x09
	REGISTER      MsgType = 0x0A
	REGACK        MsgType = 0x0B
	PUBLISH       MsgType = 0x0C
	PUBACK        MsgType = 0x0D
	PUBREC        MsgType = 0x0E
	PUBREL        MsgType = 0x0F
	PUBCOMP       MsgType = 0x10
	SUBSCRIBE     MsgType = 0x12
	SUBACK        MsgType = 0x13
	UNSUBSCRIBE   MsgType = 0x14
	UNSUBACK      MsgType = 0x15
	PINGREQ       MsgType = 0x16
	PINGRESP      MsgType = 0x17
	DISCONNECT    MsgType = 0x18
	WILLTOPICUPD  MsgType = 0x1A
	WILLTOPICRESP MsgType = 0x1B
	WILLMSGUPD    MsgType = 0x1C
	WILLMSGRESP   MsgType = 0x1D
)

type ReturnCode byte

const (
	RC_ACCEPTED         ReturnCode = 0x00
	RC_CONGESTION       ReturnCode = 0x01
	RC_INVALID_TOPIC_ID ReturnCode = 0x02
	RC_NOT_SUPPORTED    ReturnCode = 0x03
)

type Message interface {
	Type() MsgType
	Marshal() []byte
	Unmarshal([]byte) error
}

type ConnectMessage struct {
	Flags    byte
	Protocol byte
	Duration uint16
	ClientID string
}

func (m *ConnectMessage) Type() MsgType { return CONNECT }

func (m *ConnectMessage) Marshal() []byte {
	length := 6 + len(m.ClientID)
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(CONNECT)
	buf[2] = m.Flags
	buf[3] = m.Protocol
	buf[4] = byte(m.Duration >> 8)
	buf[5] = byte(m.Duration)
	copy(buf[6:], m.ClientID)
	return buf
}

func (m *ConnectMessage) Unmarshal(data []byte) error {
	if len(data) < 6 {
		return nil
	}
	m.Flags = data[2]
	m.Protocol = data[3]
	m.Duration = uint16(data[4])<<8 | uint16(data[5])
	if len(data) > 6 {
		m.ClientID = string(data[6:])
	}
	return nil
}

type ConnAckMessage struct {
	ReturnCode ReturnCode
}

func (m *ConnAckMessage) Type() MsgType { return CONNACK }

func (m *ConnAckMessage) Marshal() []byte {
	buf := make([]byte, 3)
	buf[0] = 3
	buf[1] = byte(CONNACK)
	buf[2] = byte(m.ReturnCode)
	return buf
}

func (m *ConnAckMessage) Unmarshal(data []byte) error {
	if len(data) >= 3 {
		m.ReturnCode = ReturnCode(data[2])
	}
	return nil
}

type RegisterMessage struct {
	TopicID   uint16
	MessageID uint16
	TopicName string
}

func (m *RegisterMessage) Type() MsgType { return REGISTER }

func (m *RegisterMessage) Marshal() []byte {
	length := 6 + len(m.TopicName)
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(REGISTER)
	buf[2] = byte(m.TopicID >> 8)
	buf[3] = byte(m.TopicID)
	buf[4] = byte(m.MessageID >> 8)
	buf[5] = byte(m.MessageID)
	copy(buf[6:], m.TopicName)
	return buf
}

func (m *RegisterMessage) Unmarshal(data []byte) error {
	if len(data) < 6 {
		return nil
	}
	m.TopicID = uint16(data[2])<<8 | uint16(data[3])
	m.MessageID = uint16(data[4])<<8 | uint16(data[5])
	if len(data) > 6 {
		m.TopicName = string(data[6:])
	}
	return nil
}

type RegAckMessage struct {
	TopicID    uint16
	MessageID  uint16
	ReturnCode ReturnCode
}

func (m *RegAckMessage) Type() MsgType { return REGACK }

func (m *RegAckMessage) Marshal() []byte {
	buf := make([]byte, 7)
	buf[0] = 7
	buf[1] = byte(REGACK)
	buf[2] = byte(m.TopicID >> 8)
	buf[3] = byte(m.TopicID)
	buf[4] = byte(m.MessageID >> 8)
	buf[5] = byte(m.MessageID)
	buf[6] = byte(m.ReturnCode)
	return buf
}

func (m *RegAckMessage) Unmarshal(data []byte) error {
	if len(data) >= 7 {
		m.TopicID = uint16(data[2])<<8 | uint16(data[3])
		m.MessageID = uint16(data[4])<<8 | uint16(data[5])
		m.ReturnCode = ReturnCode(data[6])
	}
	return nil
}

type PublishMessage struct {
	Flags     byte
	TopicID   uint16
	MessageID uint16
	Data      []byte
}

func (m *PublishMessage) Type() MsgType { return PUBLISH }

func (m *PublishMessage) Marshal() []byte {
	length := 7 + len(m.Data)
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(PUBLISH)
	buf[2] = m.Flags
	buf[3] = byte(m.TopicID >> 8)
	buf[4] = byte(m.TopicID)
	buf[5] = byte(m.MessageID >> 8)
	buf[6] = byte(m.MessageID)
	copy(buf[7:], m.Data)
	return buf
}

func (m *PublishMessage) Unmarshal(data []byte) error {
	if len(data) < 7 {
		return nil
	}
	m.Flags = data[2]
	m.TopicID = uint16(data[3])<<8 | uint16(data[4])
	m.MessageID = uint16(data[5])<<8 | uint16(data[6])
	if len(data) > 7 {
		m.Data = data[7:]
	}
	return nil
}

func (m *PublishMessage) QoS() byte {
	return (m.Flags >> 5) & 0x03
}

type PubAckMessage struct {
	TopicID    uint16
	MessageID  uint16
	ReturnCode ReturnCode
}

func (m *PubAckMessage) Type() MsgType { return PUBACK }

func (m *PubAckMessage) Marshal() []byte {
	buf := make([]byte, 7)
	buf[0] = 7
	buf[1] = byte(PUBACK)
	buf[2] = byte(m.TopicID >> 8)
	buf[3] = byte(m.TopicID)
	buf[4] = byte(m.MessageID >> 8)
	buf[5] = byte(m.MessageID)
	buf[6] = byte(m.ReturnCode)
	return buf
}

func (m *PubAckMessage) Unmarshal(data []byte) error {
	if len(data) >= 7 {
		m.TopicID = uint16(data[2])<<8 | uint16(data[3])
		m.MessageID = uint16(data[4])<<8 | uint16(data[5])
		m.ReturnCode = ReturnCode(data[6])
	}
	return nil
}

type SubscribeMessage struct {
	Flags     byte
	MessageID uint16
	TopicID   uint16
	TopicName string
}

func (m *SubscribeMessage) Type() MsgType { return SUBSCRIBE }

func (m *SubscribeMessage) Marshal() []byte {
	var length int
	if m.TopicName != "" {
		length = 5 + len(m.TopicName)
	} else {
		length = 6
	}
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(SUBSCRIBE)
	buf[2] = m.Flags
	buf[3] = byte(m.MessageID >> 8)
	buf[4] = byte(m.MessageID)
	if m.TopicName != "" {
		copy(buf[5:], m.TopicName)
	} else {
		buf[5] = byte(m.TopicID >> 8)
		buf[6] = byte(m.TopicID)
	}
	return buf
}

func (m *SubscribeMessage) Unmarshal(data []byte) error {
	if len(data) < 5 {
		return nil
	}
	m.Flags = data[2]
	m.MessageID = uint16(data[3])<<8 | uint16(data[4])
	topicType := (m.Flags >> 6) & 0x03
	if topicType == 0x00 && len(data) > 5 {
		m.TopicName = string(data[5:])
	} else if len(data) >= 7 {
		m.TopicID = uint16(data[5])<<8 | uint16(data[6])
	}
	return nil
}

type SubAckMessage struct {
	Flags      byte
	TopicID    uint16
	MessageID  uint16
	ReturnCode ReturnCode
}

func (m *SubAckMessage) Type() MsgType { return SUBACK }

func (m *SubAckMessage) Marshal() []byte {
	buf := make([]byte, 8)
	buf[0] = 8
	buf[1] = byte(SUBACK)
	buf[2] = m.Flags
	buf[3] = byte(m.TopicID >> 8)
	buf[4] = byte(m.TopicID)
	buf[5] = byte(m.MessageID >> 8)
	buf[6] = byte(m.MessageID)
	buf[7] = byte(m.ReturnCode)
	return buf
}

func (m *SubAckMessage) Unmarshal(data []byte) error {
	if len(data) >= 8 {
		m.Flags = data[2]
		m.TopicID = uint16(data[3])<<8 | uint16(data[4])
		m.MessageID = uint16(data[5])<<8 | uint16(data[6])
		m.ReturnCode = ReturnCode(data[7])
	}
	return nil
}

type UnsubscribeMessage struct {
	Flags     byte
	MessageID uint16
	TopicID   uint16
	TopicName string
}

func (m *UnsubscribeMessage) Type() MsgType { return UNSUBSCRIBE }

func (m *UnsubscribeMessage) Marshal() []byte {
	var length int
	if m.TopicName != "" {
		length = 5 + len(m.TopicName)
	} else {
		length = 6
	}
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(UNSUBSCRIBE)
	buf[2] = m.Flags
	buf[3] = byte(m.MessageID >> 8)
	buf[4] = byte(m.MessageID)
	if m.TopicName != "" {
		copy(buf[5:], m.TopicName)
	} else {
		buf[5] = byte(m.TopicID >> 8)
		buf[6] = byte(m.TopicID)
	}
	return buf
}

func (m *UnsubscribeMessage) Unmarshal(data []byte) error {
	if len(data) < 5 {
		return nil
	}
	m.Flags = data[2]
	m.MessageID = uint16(data[3])<<8 | uint16(data[4])
	topicType := (m.Flags >> 6) & 0x03
	if topicType == 0x00 && len(data) > 5 {
		m.TopicName = string(data[5:])
	} else if len(data) >= 7 {
		m.TopicID = uint16(data[5])<<8 | uint16(data[6])
	}
	return nil
}

type UnsubAckMessage struct {
	MessageID uint16
}

func (m *UnsubAckMessage) Type() MsgType { return UNSUBACK }

func (m *UnsubAckMessage) Marshal() []byte {
	buf := make([]byte, 4)
	buf[0] = 4
	buf[1] = byte(UNSUBACK)
	buf[2] = byte(m.MessageID >> 8)
	buf[3] = byte(m.MessageID)
	return buf
}

func (m *UnsubAckMessage) Unmarshal(data []byte) error {
	if len(data) >= 4 {
		m.MessageID = uint16(data[2])<<8 | uint16(data[3])
	}
	return nil
}

type PingReqMessage struct {
	ClientID string
}

func (m *PingReqMessage) Type() MsgType { return PINGREQ }

func (m *PingReqMessage) Marshal() []byte {
	length := 2 + len(m.ClientID)
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(PINGREQ)
	if m.ClientID != "" {
		copy(buf[2:], m.ClientID)
	}
	return buf
}

func (m *PingReqMessage) Unmarshal(data []byte) error {
	if len(data) > 2 {
		m.ClientID = string(data[2:])
	}
	return nil
}

type PingRespMessage struct{}

func (m *PingRespMessage) Type() MsgType { return PINGRESP }

func (m *PingRespMessage) Marshal() []byte {
	return []byte{2, byte(PINGRESP)}
}

func (m *PingRespMessage) Unmarshal(data []byte) error {
	return nil
}

type DisconnectMessage struct {
	Duration uint16
}

func (m *DisconnectMessage) Type() MsgType { return DISCONNECT }

func (m *DisconnectMessage) Marshal() []byte {
	if m.Duration > 0 {
		return []byte{4, byte(DISCONNECT), byte(m.Duration >> 8), byte(m.Duration)}
	}
	return []byte{2, byte(DISCONNECT)}
}

func (m *DisconnectMessage) Unmarshal(data []byte) error {
	if len(data) >= 4 {
		m.Duration = uint16(data[2])<<8 | uint16(data[3])
	}
	return nil
}

type AdvertiseMessage struct {
	GwID     byte
	Duration uint16
}

func (m *AdvertiseMessage) Type() MsgType { return ADVERTISE }

func (m *AdvertiseMessage) Marshal() []byte {
	buf := make([]byte, 5)
	buf[0] = 5
	buf[1] = byte(ADVERTISE)
	buf[2] = m.GwID
	buf[3] = byte(m.Duration >> 8)
	buf[4] = byte(m.Duration)
	return buf
}

func (m *AdvertiseMessage) Unmarshal(data []byte) error {
	if len(data) >= 5 {
		m.GwID = data[2]
		m.Duration = uint16(data[3])<<8 | uint16(data[4])
	}
	return nil
}

type SearchGwMessage struct {
	Radius byte
}

func (m *SearchGwMessage) Type() MsgType { return SEARCHGW }

func (m *SearchGwMessage) Marshal() []byte {
	buf := make([]byte, 3)
	buf[0] = 3
	buf[1] = byte(SEARCHGW)
	buf[2] = m.Radius
	return buf
}

func (m *SearchGwMessage) Unmarshal(data []byte) error {
	if len(data) >= 3 {
		m.Radius = data[2]
	}
	return nil
}

type GwInfoMessage struct {
	GwID      byte
	GwAddress string
}

func (m *GwInfoMessage) Type() MsgType { return GWINFO }

func (m *GwInfoMessage) Marshal() []byte {
	length := 4 + len(m.GwAddress)
	buf := make([]byte, length)
	buf[0] = byte(length)
	buf[1] = byte(GWINFO)
	buf[2] = m.GwID
	buf[3] = byte(len(m.GwAddress))
	if m.GwAddress != "" {
		copy(buf[4:], m.GwAddress)
	}
	return buf
}

func (m *GwInfoMessage) Unmarshal(data []byte) error {
	if len(data) >= 4 {
		m.GwID = data[2]
		addrLen := int(data[3])
		if len(data) >= 4+addrLen {
			m.GwAddress = string(data[4 : 4+addrLen])
		}
	}
	return nil
}

func ParseMessage(data []byte) Message {
	if len(data) < 2 {
		return nil
	}
	msgType := MsgType(data[1])
	var msg Message
	switch msgType {
	case ADVERTISE:
		msg = &AdvertiseMessage{}
	case SEARCHGW:
		msg = &SearchGwMessage{}
	case GWINFO:
		msg = &GwInfoMessage{}
	case CONNECT:
		msg = &ConnectMessage{}
	case CONNACK:
		msg = &ConnAckMessage{}
	case REGISTER:
		msg = &RegisterMessage{}
	case REGACK:
		msg = &RegAckMessage{}
	case PUBLISH:
		msg = &PublishMessage{}
	case PUBACK:
		msg = &PubAckMessage{}
	case SUBSCRIBE:
		msg = &SubscribeMessage{}
	case SUBACK:
		msg = &SubAckMessage{}
	case UNSUBSCRIBE:
		msg = &UnsubscribeMessage{}
	case UNSUBACK:
		msg = &UnsubAckMessage{}
	case PINGREQ:
		msg = &PingReqMessage{}
	case PINGRESP:
		msg = &PingRespMessage{}
	case DISCONNECT:
		msg = &DisconnectMessage{}
	default:
		return nil
	}
	msg.Unmarshal(data)
	return msg
}

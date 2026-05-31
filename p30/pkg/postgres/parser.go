package postgres

import (
	"encoding/binary"
	"fmt"
	"strings"
)

const (
	MSG_QUERY              = 'Q'
	MSG_PARSE              = 'P'
	MSG_BIND               = 'B'
	MSG_EXECUTE            = 'E'
	MSG_DESCRIBE           = 'D'
	MSG_CLOSE              = 'C'
	MSG_FLUSH              = 'H'
	MSG_SYNC               = 'S'
	MSG_TERMINATE          = 'X'
	MSG_PASSWORD           = 'p'
	MSG_STARTUP_MESSAGE    = 0
	MSG_SSL_REQUEST        = 80877103
	MSG_CANCEL_REQUEST     = 80877102
)

type Packet struct {
	MessageType byte
	Length      int32
	Payload     []byte
}

type Query struct {
	SQL      string
	Database string
	Username string
}

type Parser struct {
	buffer []byte
}

func NewParser() *Parser {
	return &Parser{
		buffer: make([]byte, 0, 4096),
	}
}

func (p *Parser) Parse(data []byte) (*Query, error) {
	if len(data) < 5 {
		return nil, fmt.Errorf("data too short")
	}

	packet, err := p.parsePacket(data)
	if err != nil {
		return nil, err
	}

	switch packet.MessageType {
	case MSG_QUERY:
		if len(packet.Payload) < 1 {
			return nil, fmt.Errorf("query payload too short")
		}
		sql := string(packet.Payload)
		return &Query{
			SQL: cleanString(sql),
		}, nil

	case MSG_PARSE:
		if len(packet.Payload) < 1 {
			return nil, fmt.Errorf("parse payload too short")
		}
		offset := 0
		stmtName := readNullTerminatedString(packet.Payload[offset:])
		offset += len(stmtName) + 1
		query := readNullTerminatedString(packet.Payload[offset:])
		return &Query{
			SQL: fmt.Sprintf("PREPARE %s: %s", stmtName, cleanString(query)),
		}, nil

	case MSG_EXECUTE:
		if len(packet.Payload) < 1 {
			return nil, fmt.Errorf("execute payload too short")
		}
		portalName := readNullTerminatedString(packet.Payload)
		return &Query{
			SQL: fmt.Sprintf("EXECUTE %s", portalName),
		}, nil

	case MSG_TERMINATE:
		return &Query{
			SQL: "TERMINATE",
		}, nil

	case MSG_STARTUP_MESSAGE:
		return p.parseStartupMessage(packet.Payload)
	}

	return nil, fmt.Errorf("unsupported message type: %c", packet.MessageType)
}

func (p *Parser) parsePacket(data []byte) (*Packet, error) {
	if len(data) < 1 {
		return nil, fmt.Errorf("empty data")
	}

	messageType := data[0]

	if messageType == 0 && len(data) >= 4 {
		length := int32(binary.BigEndian.Uint32(data[0:4]))
		if len(data) >= 8 {
			requestCode := int32(binary.BigEndian.Uint32(data[4:8]))
			if requestCode == MSG_SSL_REQUEST || requestCode == MSG_CANCEL_REQUEST {
				return &Packet{
					MessageType: MSG_STARTUP_MESSAGE,
					Length:      length,
					Payload:     data[4:length],
				}, nil
			}
		}
		return &Packet{
			MessageType: MSG_STARTUP_MESSAGE,
			Length:      length,
			Payload:     data[4:length],
		}, nil
	}

	if len(data) < 5 {
		return nil, fmt.Errorf("packet too short")
	}

	length := int32(binary.BigEndian.Uint32(data[1:5]))

	payload := data[5:]
	if int(length)-4 < len(payload) {
		payload = payload[:length-4]
	}

	return &Packet{
		MessageType: messageType,
		Length:      length,
		Payload:     payload,
	}, nil
}

func (p *Parser) parseStartupMessage(payload []byte) (*Query, error) {
	if len(payload) < 8 {
		return nil, fmt.Errorf("startup message too short")
	}

	majorVersion := binary.BigEndian.Uint16(payload[0:2])
	minorVersion := binary.BigEndian.Uint16(payload[2:4])

	params := make(map[string]string)
	offset := 4

	for offset < len(payload)-1 {
		key := readNullTerminatedString(payload[offset:])
		if key == "" {
			break
		}
		offset += len(key) + 1

		value := readNullTerminatedString(payload[offset:])
		offset += len(value) + 1

		params[key] = value
	}

	query := &Query{
		SQL: fmt.Sprintf("STARTUP (version %d.%d)", majorVersion, minorVersion),
	}
	if db, ok := params["database"]; ok {
		query.Database = db
	}
	if user, ok := params["user"]; ok {
		query.Username = user
	}

	return query, nil
}

func (p *Parser) IsQueryPacket(data []byte) bool {
	if len(data) < 1 {
		return false
	}

	msgType := data[0]
	return msgType == MSG_QUERY || msgType == MSG_PARSE || msgType == MSG_EXECUTE
}

func readNullTerminatedString(data []byte) string {
	for i, b := range data {
		if b == 0 {
			return string(data[:i])
		}
	}
	return string(data)
}

func cleanString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\x00")
	return strings.ReplaceAll(s, "\n", " ")
}

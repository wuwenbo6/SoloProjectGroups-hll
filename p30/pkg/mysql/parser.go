package mysql

import (
	"encoding/binary"
	"fmt"
	"strings"
)

const (
	COM_SLEEP               = 0x00
	COM_QUIT                = 0x01
	COM_INIT_DB             = 0x02
	COM_QUERY               = 0x03
	COM_FIELD_LIST          = 0x04
	COM_CREATE_DB           = 0x05
	COM_DROP_DB             = 0x06
	COM_REFRESH             = 0x07
	COM_SHUTDOWN            = 0x08
	COM_STATISTICS          = 0x09
	COM_PROCESS_INFO        = 0x0a
	COM_CONNECT             = 0x0b
	COM_PROCESS_KILL        = 0x0c
	COM_DEBUG               = 0x0d
	COM_PING                = 0x0e
	COM_TIME                = 0x0f
	COM_DELAYED_INSERT      = 0x10
	COM_CHANGE_USER         = 0x11
	COM_BINLOG_DUMP         = 0x12
	COM_TABLE_DUMP          = 0x13
	COM_CONNECT_OUT         = 0x14
	COM_REGISTER_SLAVE      = 0x15
	COM_STMT_PREPARE        = 0x16
	COM_STMT_EXECUTE        = 0x17
	COM_STMT_SEND_LONG_DATA = 0x18
	COM_STMT_CLOSE          = 0x19
	COM_STMT_RESET          = 0x1a
	COM_SET_OPTION          = 0x1b
	COM_STMT_FETCH          = 0x1c
	COM_DAEMON              = 0x1d
	COM_BINLOG_DUMP_GTID    = 0x1e
	COM_RESET_CONNECTION    = 0x1f
)

type Packet struct {
	Length     uint32
	SequenceID uint8
	Payload    []byte
}

type Query struct {
	SQL      string
	Database string
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

	if len(packet.Payload) == 0 {
		return nil, fmt.Errorf("empty payload")
	}

	command := packet.Payload[0]

	switch command {
	case COM_QUERY:
		sql := string(packet.Payload[1:])
		return &Query{
			SQL: cleanString(sql),
		}, nil
	case COM_INIT_DB:
		db := string(packet.Payload[1:])
		return &Query{
			SQL:      fmt.Sprintf("USE %s", cleanString(db)),
			Database: cleanString(db),
		}, nil
	case COM_STMT_PREPARE:
		sql := string(packet.Payload[1:])
		return &Query{
			SQL: fmt.Sprintf("PREPARE: %s", cleanString(sql)),
		}, nil
	case COM_QUIT:
		return &Query{
			SQL: "QUIT",
		}, nil
	case COM_PING:
		return &Query{
			SQL: "PING",
		}, nil
	}

	return nil, fmt.Errorf("unsupported command: 0x%02x", command)
}

func (p *Parser) parsePacket(data []byte) (*Packet, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("packet header too short")
	}

	length := uint32(data[0]) | uint32(data[1])<<8 | uint32(data[2])<<16
	sequenceID := data[3]

	payload := data[4:]
	if uint32(len(payload)) > length {
		payload = payload[:length]
	}

	return &Packet{
		Length:     length,
		SequenceID: sequenceID,
		Payload:    payload,
	}, nil
}

func (p *Parser) IsQueryPacket(data []byte) bool {
	if len(data) < 5 {
		return false
	}

	command := data[4]
	return command == COM_QUERY || command == COM_STMT_PREPARE || command == COM_INIT_DB
}

func cleanString(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "\x00")
	return strings.ReplaceAll(s, "\n", " ")
}

func ReadLengthEncodedInteger(data []byte) (uint64, int, error) {
	if len(data) == 0 {
		return 0, 0, fmt.Errorf("empty data")
	}

	switch data[0] {
	case 0xfb:
		return 0, 1, nil
	case 0xfc:
		if len(data) < 3 {
			return 0, 0, fmt.Errorf("data too short for 2-byte int")
		}
		return uint64(binary.LittleEndian.Uint16(data[1:3])), 3, nil
	case 0xfd:
		if len(data) < 4 {
			return 0, 0, fmt.Errorf("data too short for 3-byte int")
		}
		return uint64(data[1]) | uint64(data[2])<<8 | uint64(data[3])<<16, 4, nil
	case 0xfe:
		if len(data) < 9 {
			return 0, 0, fmt.Errorf("data too short for 8-byte int")
		}
		return binary.LittleEndian.Uint64(data[1:9]), 9, nil
	default:
		return uint64(data[0]), 1, nil
	}
}

func ReadLengthEncodedString(data []byte) (string, int, error) {
	length, n, err := ReadLengthEncodedInteger(data)
	if err != nil {
		return "", 0, err
	}

	if len(data) < n+int(length) {
		return "", 0, fmt.Errorf("data too short for string")
	}

	return string(data[n : n+int(length)]), n + int(length), nil
}

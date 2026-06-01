package protocol

import (
	"encoding/binary"
	"errors"
	"tacacs-simulator/model"
)

type TacacsHeader struct {
	Version   uint8
	Type      uint8
	SeqNo     uint8
	Flags     uint8
	SessionID uint32
	Length    uint32
}

func EncodeHeader(h *TacacsHeader) ([]byte, error) {
	buf := make([]byte, 12)
	buf[0] = h.Version
	buf[1] = h.Type
	buf[2] = h.SeqNo
	buf[3] = h.Flags
	binary.BigEndian.PutUint32(buf[4:8], h.SessionID)
	binary.BigEndian.PutUint32(buf[8:12], h.Length)
	return buf, nil
}

func DecodeHeader(data []byte) (*TacacsHeader, error) {
	if len(data) < 12 {
		return nil, errors.New("header too short")
	}
	h := &TacacsHeader{
		Version:   data[0],
		Type:      data[1],
		SeqNo:     data[2],
		Flags:     data[3],
		SessionID: binary.BigEndian.Uint32(data[4:8]),
		Length:    binary.BigEndian.Uint32(data[8:12]),
	}
	return h, nil
}

func (h *TacacsHeader) ToInfo() model.TacacsHeaderInfo {
	return model.TacacsHeaderInfo{
		Version:   h.Version,
		Type:      h.Type,
		SeqNo:     h.SeqNo,
		Flags:     h.Flags,
		SessionID: h.SessionID,
		Length:    h.Length,
	}
}

func (h *TacacsHeader) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"version": map[string]interface{}{
			"raw":     h.Version,
			"hex":     "0x" + byteToHex(h.Version),
			"major":   h.Version >> 4,
			"minor":   h.Version & 0x0F,
		},
		"type": map[string]interface{}{
			"raw":   h.Type,
			"hex":   "0x" + byteToHex(h.Type),
			"name":  typeName(h.Type),
		},
		"seqNo": map[string]interface{}{
			"raw": h.SeqNo,
			"hex": "0x" + byteToHex(h.SeqNo),
		},
		"flags": map[string]interface{}{
			"raw":        h.Flags,
			"hex":        "0x" + byteToHex(h.Flags),
			"encrypted":  (h.Flags & model.TacacsFlagEncrypted) != 0,
			"singleConn": (h.Flags & model.TacacsFlagSingleConn) != 0,
		},
		"sessionId": map[string]interface{}{
			"raw": h.SessionID,
			"hex": "0x" + uint32ToHex(h.SessionID),
		},
		"length": map[string]interface{}{
			"raw": h.Length,
			"hex": "0x" + uint32ToHex(h.Length),
		},
	}
}

func typeName(t uint8) string {
	switch t {
	case model.TacacsTypeAuth:
		return "Authentication"
	case model.TacacsTypeAuthorize:
		return "Authorization"
	case model.TacacsTypeAccounting:
		return "Accounting"
	default:
		return "Unknown"
	}
}

func byteToHex(b uint8) string {
	return hexChar(b>>4) + hexChar(b&0x0F)
}

func uint32ToHex(v uint32) string {
	return byteToHex(uint8(v>>24)) + byteToHex(uint8(v>>16)) +
		byteToHex(uint8(v>>8)) + byteToHex(uint8(v))
}

func hexChar(n uint8) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return string(rune('A' + n - 10))
}

func MakeVersion(major, minor uint8) uint8 {
	return (major << 4) | (minor & 0x0F)
}

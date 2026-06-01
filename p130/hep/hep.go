package hep

import (
	"encoding/binary"
	"fmt"
	"net"
)

const (
	HEPVersion1 = 0x01
	HEPVersion2 = 0x02
	HEPVersion3 = 0x03

	VendorID = 0x0000

	TypeIPProtoFamily  = 0x0001
	TypeIPProtoID      = 0x0002
	TypeIPv4SrcAddr    = 0x0003
	TypeIPv4DstAddr    = 0x0004
	TypeIPv6SrcAddr    = 0x0005
	TypeIPv6DstAddr    = 0x0006
	TypeSrcPort        = 0x0007
	TypeDstPort        = 0x0008
	TypeTimestamp      = 0x0009
	TypeTimestampMicro = 0x000a
	TypeProtoType      = 0x000b
	TypeProtoTxtProto  = 0x000e
	TypeCaptID         = 0x000c
	TypeVlanID         = 0x000d
	TypePayload        = 0x000f

	ProtoTypeSIP = 1
	ProtoTypeRTP = 2
	ProtoTypeRTCP = 3
)

type HEPPacket struct {
	Version          byte
	ProtocolType     byte
	Length           uint32
	IPFamily         uint8
	IPProtocolID     uint8
	SrcAddr          net.IP
	DstAddr          net.IP
	SrcPort          uint16
	DstPort          uint16
	Timestamp        uint32
	TimestampMicro   uint32
	Payload          []byte
	CaptID           uint32
	VlanID           uint16
	CorrelationID    string
}

func (h *HEPPacket) SrcIP() string {
	if h.SrcAddr != nil {
		return h.SrcAddr.String()
	}
	return ""
}

func (h *HEPPacket) DstIP() string {
	if h.DstAddr != nil {
		return h.DstAddr.String()
	}
	return ""
}

func (h *HEPPacket) IsSIP() bool {
	return h.ProtocolType == ProtoTypeSIP
}

func (h *HEPPacket) IsRTP() bool {
	return h.ProtocolType == ProtoTypeRTP
}

func (h *HEPPacket) IsRTCP() bool {
	return h.ProtocolType == ProtoTypeRTCP
}

func GetProtocolTypeName(pt byte) string {
	switch pt {
	case ProtoTypeSIP:
		return "SIP"
	case ProtoTypeRTP:
		return "RTP"
	case ProtoTypeRTCP:
		return "RTCP"
	default:
		return fmt.Sprintf("Unknown(%d)", pt)
	}
}

func ParseHEP(data []byte) (*HEPPacket, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("data too short for HEP header")
	}

	version := data[0]
	if version != HEPVersion2 && version != HEPVersion3 {
		return nil, fmt.Errorf("unsupported HEP version: %d", version)
	}

	packet := &HEPPacket{
		Version: version,
	}

	if len(data) < 6 {
		return nil, fmt.Errorf("data too short for HEP header")
	}

	packet.ProtocolType = data[1]
	packet.Length = binary.BigEndian.Uint32(data[2:6])

	if len(data) < int(packet.Length) {
		return nil, fmt.Errorf("data length mismatch: expected %d, got %d", packet.Length, len(data))
	}

	if packet.Length < 6 {
		return nil, fmt.Errorf("invalid HEP length field")
	}

	offset := 6
	for offset < int(packet.Length) {
		if offset+4 > len(data) {
			break
		}

		vendorID := binary.BigEndian.Uint16(data[offset : offset+2])
		chunkType := binary.BigEndian.Uint16(data[offset+2 : offset+4])

		if offset+6 > len(data) {
			break
		}
		chunkLength := binary.BigEndian.Uint16(data[offset+4 : offset+6])

		if chunkLength < 6 || offset+int(chunkLength) > len(data) {
			break
		}

		chunkData := data[offset+6 : offset+int(chunkLength)]

		if vendorID == VendorID {
			switch chunkType {
			case TypeIPProtoFamily:
				if len(chunkData) >= 1 {
					packet.IPFamily = chunkData[0]
				}
			case TypeIPProtoID:
				if len(chunkData) >= 1 {
					packet.IPProtocolID = chunkData[0]
				}
			case TypeIPv4SrcAddr:
				if len(chunkData) >= 4 {
					packet.SrcAddr = net.IP(chunkData[:4]).To4()
				}
			case TypeIPv4DstAddr:
				if len(chunkData) >= 4 {
					packet.DstAddr = net.IP(chunkData[:4]).To4()
				}
			case TypeIPv6SrcAddr:
				if len(chunkData) >= 16 {
					packet.SrcAddr = net.IP(chunkData[:16]).To16()
				}
			case TypeIPv6DstAddr:
				if len(chunkData) >= 16 {
					packet.DstAddr = net.IP(chunkData[:16]).To16()
				}
			case TypeSrcPort:
				if len(chunkData) >= 2 {
					packet.SrcPort = binary.BigEndian.Uint16(chunkData[:2])
				}
			case TypeDstPort:
				if len(chunkData) >= 2 {
					packet.DstPort = binary.BigEndian.Uint16(chunkData[:2])
				}
			case TypeTimestamp:
				if len(chunkData) >= 4 {
					packet.Timestamp = binary.BigEndian.Uint32(chunkData[:4])
				}
			case TypeTimestampMicro:
				if len(chunkData) >= 4 {
					packet.TimestampMicro = binary.BigEndian.Uint32(chunkData[:4])
				}
			case TypeCaptID:
				if len(chunkData) >= 4 {
					packet.CaptID = binary.BigEndian.Uint32(chunkData[:4])
				}
			case TypeVlanID:
				if len(chunkData) >= 2 {
					packet.VlanID = binary.BigEndian.Uint16(chunkData[:2])
				}
			case TypePayload:
				packet.Payload = make([]byte, len(chunkData))
				copy(packet.Payload, chunkData)
			}
		}

		offset += int(chunkLength)
	}

	return packet, nil
}

func EncodeHEP(packet *HEPPacket) ([]byte, error) {
	chunks := make([]byte, 0)

	chunks = appendChunk(chunks, TypeIPProtoFamily, []byte{packet.IPFamily})
	chunks = appendChunk(chunks, TypeIPProtoID, []byte{packet.IPProtocolID})

	if packet.SrcAddr != nil {
		if ipv4 := packet.SrcAddr.To4(); ipv4 != nil {
			chunks = appendChunk(chunks, TypeIPv4SrcAddr, []byte(ipv4))
		} else {
			chunks = appendChunk(chunks, TypeIPv6SrcAddr, []byte(packet.SrcAddr.To16()))
		}
	}

	if packet.DstAddr != nil {
		if ipv4 := packet.DstAddr.To4(); ipv4 != nil {
			chunks = appendChunk(chunks, TypeIPv4DstAddr, []byte(ipv4))
		} else {
			chunks = appendChunk(chunks, TypeIPv6DstAddr, []byte(packet.DstAddr.To16()))
		}
	}

	srcPort := make([]byte, 2)
	binary.BigEndian.PutUint16(srcPort, packet.SrcPort)
	chunks = appendChunk(chunks, TypeSrcPort, srcPort)

	dstPort := make([]byte, 2)
	binary.BigEndian.PutUint16(dstPort, packet.DstPort)
	chunks = appendChunk(chunks, TypeDstPort, dstPort)

	ts := make([]byte, 4)
	binary.BigEndian.PutUint32(ts, packet.Timestamp)
	chunks = appendChunk(chunks, TypeTimestamp, ts)

	tsMicro := make([]byte, 4)
	binary.BigEndian.PutUint32(tsMicro, packet.TimestampMicro)
	chunks = appendChunk(chunks, TypeTimestampMicro, tsMicro)

	if packet.CaptID != 0 {
		captID := make([]byte, 4)
		binary.BigEndian.PutUint32(captID, packet.CaptID)
		chunks = appendChunk(chunks, TypeCaptID, captID)
	}

	if len(packet.Payload) > 0 {
		chunks = appendChunk(chunks, TypePayload, packet.Payload)
	}

	totalLength := uint32(6 + len(chunks))

	result := make([]byte, 0, totalLength)
	result = append(result, packet.Version)
	result = append(result, packet.ProtocolType)

	lenBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBytes, totalLength)
	result = append(result, lenBytes...)
	result = append(result, chunks...)

	return result, nil
}

func appendChunk(data []byte, chunkType uint16, chunkData []byte) []byte {
	header := make([]byte, 6)
	binary.BigEndian.PutUint16(header[0:2], VendorID)
	binary.BigEndian.PutUint16(header[2:4], chunkType)
	binary.BigEndian.PutUint16(header[4:6], uint16(6+len(chunkData)))

	result := make([]byte, 0, len(data)+len(header)+len(chunkData))
	result = append(result, data...)
	result = append(result, header...)
	result = append(result, chunkData...)
	return result
}

package network

import (
	"encoding/binary"
	"net"
)

type IPPacket struct {
	Version        uint8
	IHL            uint8
	TOS            uint8
	TotalLength    uint16
	Identification uint16
	Flags          uint8
	FragmentOffset uint16
	TTL            uint8
	Protocol       uint8
	HeaderChecksum uint16
	SrcIP          net.IP
	DstIP          net.IP
	Payload        []byte
}

func BuildIPPacket(srcIP, dstIP net.IP, protocol uint8, payload []byte) []byte {
	ihl := uint8(5)
	version := uint8(4)
	tos := uint8(0)
	ttl := uint8(64)
	headerLen := int(ihl) * 4
	totalLen := uint16(headerLen + len(payload))
	identification := uint16(0x1234)
	flags := uint8(0)
	fragOffset := uint16(0)

	packet := make([]byte, headerLen+len(payload))

	packet[0] = (version << 4) | (ihl & 0x0F)
	packet[1] = tos
	binary.BigEndian.PutUint16(packet[2:4], totalLen)
	binary.BigEndian.PutUint16(packet[4:6], identification)
	packet[6] = (flags << 5) | uint8((fragOffset>>8)&0x1F)
	packet[7] = uint8(fragOffset & 0xFF)
	packet[8] = ttl
	packet[9] = protocol
	binary.BigEndian.PutUint16(packet[10:12], 0)

	srcIPv4 := srcIP.To4()
	dstIPv4 := dstIP.To4()
	copy(packet[12:16], srcIPv4)
	copy(packet[16:20], dstIPv4)

	checksum := calculateChecksum(packet[:headerLen])
	binary.BigEndian.PutUint16(packet[10:12], checksum)

	copy(packet[headerLen:], payload)

	return packet
}

func calculateChecksum(data []byte) uint16 {
	var sum uint32
	for i := 0; i < len(data); i += 2 {
		sum += uint32(binary.BigEndian.Uint16(data[i:]))
	}

	for sum>>16 > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}

	return ^uint16(sum)
}

func ParseIPPacket(data []byte) (*IPPacket, error) {
	if len(data) < 20 {
		return nil, nil
	}

	version := (data[0] >> 4) & 0x0F
	ihl := data[0] & 0x0F
	headerLen := int(ihl) * 4

	if len(data) < headerLen {
		return nil, nil
	}

	return &IPPacket{
		Version:        version,
		IHL:            ihl,
		TOS:            data[1],
		TotalLength:    binary.BigEndian.Uint16(data[2:4]),
		Identification: binary.BigEndian.Uint16(data[4:6]),
		Flags:          (data[6] >> 5) & 0x07,
		FragmentOffset: binary.BigEndian.Uint16(data[6:8]) & 0x1FFF,
		TTL:            data[8],
		Protocol:       data[9],
		HeaderChecksum: binary.BigEndian.Uint16(data[10:12]),
		SrcIP:          net.IP(data[12:16]),
		DstIP:          net.IP(data[16:20]),
		Payload:        data[headerLen:],
	}, nil
}

func BuildTestPacket(srcIP, dstIP net.IP, payload []byte) []byte {
	return BuildIPPacket(srcIP, dstIP, 17, payload)
}

func GenerateTestPayload(size int) []byte {
	payload := make([]byte, size)
	for i := range payload {
		payload[i] = byte(i % 256)
	}
	return payload
}

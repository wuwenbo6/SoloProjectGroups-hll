package pcap

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"sip-analyzer/database"
)

const (
	PCAPMagic     = 0xa1b2c3d4
	PCAPVersionMajor = 2
	PCAPVersionMinor = 4
	PCAPThisZone   = 0
	PCAPSigFigs    = 0
	PCAPSnapLen    = 65535
	PCAPNetwork    = 1

	EtherTypeIPv4 = 0x0800
	IPProtoUDP    = 17
	IPProtoTCP    = 6
	UDPSIPPort    = 5060
)

type PCAPGlobalHeader struct {
	MagicNumber  uint32
	VersionMajor uint16
	VersionMinor uint16
	ThisZone     int32
	SigFigs      uint32
	SnapLen      uint32
	Network      uint32
}

type PCAPPacketHeader struct {
	TsSec   uint32
	TsUsec  uint32
	InclLen uint32
	OrigLen uint32
}

type PseudoPacket struct {
	Timestamp time.Time
	SourceIP  net.IP
	DestIP    net.IP
	SourcePort uint16
	DestPort   uint16
	Protocol   uint8
	Payload   []byte
}

func ExportCallToPCAP(callID string, messages []*database.SIPMessage, rtpStreams []*database.RTPStream) ([]byte, error) {
	var buf bytes.Buffer

	globalHeader := PCAPGlobalHeader{
		MagicNumber:  PCAPMagic,
		VersionMajor: PCAPVersionMajor,
		VersionMinor: PCAPVersionMinor,
		ThisZone:     PCAPThisZone,
		SigFigs:      PCAPSigFigs,
		SnapLen:      PCAPSnapLen,
		Network:      PCAPNetwork,
	}

	if err := binary.Write(&buf, binary.LittleEndian, globalHeader); err != nil {
		return nil, fmt.Errorf("write global header: %w", err)
	}

	for _, msg := range messages {
		packet := &PseudoPacket{
			Timestamp:  msg.Timestamp,
			SourceIP:   net.ParseIP(msg.SourceIP),
			DestIP:     net.ParseIP(msg.DestIP),
			SourcePort: uint16(msg.SourcePort),
			DestPort:   uint16(msg.DestPort),
			Protocol:   IPProtoUDP,
			Payload:    []byte(msg.RawMessage),
		}
		if packet.SourcePort == 0 {
			packet.SourcePort = UDPSIPPort
		}
		if packet.DestPort == 0 {
			packet.DestPort = UDPSIPPort
		}

		if err := writePacket(&buf, packet); err != nil {
			return nil, fmt.Errorf("write sip packet: %w", err)
		}
	}

	for _, stream := range rtpStreams {
		if stream.TotalPackets > 0 {
			samplePacket := generateSampleRTPPacket(stream)
			packet := &PseudoPacket{
				Timestamp:  stream.StartTime,
				SourceIP:   net.ParseIP(stream.SourceIP),
				DestIP:     net.ParseIP(stream.DestIP),
				SourcePort: uint16(stream.SourcePort),
				DestPort:   uint16(stream.DestPort),
				Protocol:   IPProtoUDP,
				Payload:    samplePacket,
			}

			if err := writePacket(&buf, packet); err != nil {
				return nil, fmt.Errorf("write rtp packet: %w", err)
			}

			endPacket := generateSampleRTPPacket(stream)
			endPacket[2] = byte(stream.LastSeq >> 8)
			endPacket[3] = byte(stream.LastSeq & 0xFF)
			endPacketP := &PseudoPacket{
				Timestamp:  stream.EndTime,
				SourceIP:   net.ParseIP(stream.SourceIP),
				DestIP:     net.ParseIP(stream.DestIP),
				SourcePort: uint16(stream.SourcePort),
				DestPort:   uint16(stream.DestPort),
				Protocol:   IPProtoUDP,
				Payload:    endPacket,
			}

			if err := writePacket(&buf, endPacketP); err != nil {
				return nil, fmt.Errorf("write rtp end packet: %w", err)
			}
		}
	}

	return buf.Bytes(), nil
}

func writePacket(buf *bytes.Buffer, pkt *PseudoPacket) error {
	ethernetFrame := buildEthernetFrame(pkt)
	ipPacket := buildIPPacket(pkt)
	udpPacket := buildUDPPacket(pkt)

	fullPacket := make([]byte, 0, len(ethernetFrame)+len(ipPacket)+len(udpPacket)+len(pkt.Payload))
	fullPacket = append(fullPacket, ethernetFrame...)
	fullPacket = append(fullPacket, ipPacket...)
	fullPacket = append(fullPacket, udpPacket...)
	fullPacket = append(fullPacket, pkt.Payload...)

	origLen := len(fullPacket)
	inclLen := origLen
	if inclLen > PCAPSnapLen {
		inclLen = PCAPSnapLen
	}

	pktHeader := PCAPPacketHeader{
		TsSec:   uint32(pkt.Timestamp.Unix()),
		TsUsec:  uint32(pkt.Timestamp.Nanosecond() / 1000),
		InclLen: uint32(inclLen),
		OrigLen: uint32(origLen),
	}

	if err := binary.Write(buf, binary.LittleEndian, pktHeader); err != nil {
		return err
	}

	if inclLen < origLen {
		_, err := buf.Write(fullPacket[:inclLen])
		return err
	}
	_, err := buf.Write(fullPacket)
	return err
}

func buildEthernetFrame(pkt *PseudoPacket) []byte {
	frame := make([]byte, 14)

	for i := 0; i < 6; i++ {
		frame[i] = 0x00
		frame[i+6] = 0x00
	}
	if pkt.SourceIP != nil {
		frame[0] = 0x02
		copy(frame[2:], pkt.SourceIP.To4())
	}
	if pkt.DestIP != nil {
		frame[6] = 0x02
		copy(frame[8:], pkt.DestIP.To4())
	}

	frame[12] = byte(EtherTypeIPv4 >> 8)
	frame[13] = byte(EtherTypeIPv4 & 0xFF)

	return frame
}

func buildIPPacket(pkt *PseudoPacket) []byte {
	headerLen := 20
	srcIP := pkt.SourceIP.To4()
	dstIP := pkt.DestIP.To4()
	if srcIP == nil {
		srcIP = net.IPv4(127, 0, 0, 1).To4()
	}
	if dstIP == nil {
		dstIP = net.IPv4(127, 0, 0, 2).To4()
	}

	ip := make([]byte, headerLen)
	ip[0] = 0x45
	ip[1] = 0x00
	totalLen := headerLen + 8 + len(pkt.Payload)
	ip[2] = byte(totalLen >> 8)
	ip[3] = byte(totalLen & 0xFF)
	ip[4] = 0x00
	ip[5] = 0x00
	ip[6] = 0x40
	ip[7] = 0x00
	ip[8] = 64
	ip[9] = pkt.Protocol

	ip[12] = srcIP[0]
	ip[13] = srcIP[1]
	ip[14] = srcIP[2]
	ip[15] = srcIP[3]
	ip[16] = dstIP[0]
	ip[17] = dstIP[1]
	ip[18] = dstIP[2]
	ip[19] = dstIP[3]

	checksum := calculateIPChecksum(ip)
	ip[10] = byte(checksum >> 8)
	ip[11] = byte(checksum & 0xFF)

	return ip
}

func buildUDPPacket(pkt *PseudoPacket) []byte {
	udpLen := 8 + len(pkt.Payload)
	udp := make([]byte, 8)

	udp[0] = byte(pkt.SourcePort >> 8)
	udp[1] = byte(pkt.SourcePort & 0xFF)
	udp[2] = byte(pkt.DestPort >> 8)
	udp[3] = byte(pkt.DestPort & 0xFF)
	udp[4] = byte(udpLen >> 8)
	udp[5] = byte(udpLen & 0xFF)
	udp[6] = 0x00
	udp[7] = 0x00

	return udp
}

func calculateIPChecksum(data []byte) uint16 {
	var sum uint32
	for i := 0; i < len(data); i += 2 {
		sum += uint32(binary.BigEndian.Uint16(data[i : i+2]))
	}
	for sum>>16 > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}
	return uint16(^sum)
}

func generateSampleRTPPacket(stream *database.RTPStream) []byte {
	pkt := make([]byte, 12+160)

	pkt[0] = 0x80
	pkt[1] = stream.PayloadType & 0x7F
	pkt[2] = byte(stream.FirstSeq >> 8)
	pkt[3] = byte(stream.FirstSeq & 0xFF)
	pkt[4] = 0x00
	pkt[5] = 0x00
	pkt[6] = 0x00
	pkt[7] = 0x00
	pkt[8] = byte(stream.SSRC >> 24)
	pkt[9] = byte((stream.SSRC >> 16) & 0xFF)
	pkt[10] = byte((stream.SSRC >> 8) & 0xFF)
	pkt[11] = byte(stream.SSRC & 0xFF)

	for i := 12; i < len(pkt); i++ {
		pkt[i] = byte((i * stream.SSRC) & 0xFF)
	}

	return pkt
}

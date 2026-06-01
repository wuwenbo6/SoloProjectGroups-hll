package sflow

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"sflow-analyzer/pkg/types"
)

const (
	SFlowPort       = 6343
	SFlowVersion5   = 5
	MaxDatagramSize = 9000

	TypeFlowSample  = 1
	TypeCounterSample = 2

	FlowTypeRawPacketHeader = 1
	FlowTypeEthernetFrame   = 2
	FlowTypeIPv4            = 3
	FlowTypeIPv6            = 4
	FlowTypeTCP             = 5
	FlowTypeUDP             = 6
)

type SFlowHeader struct {
	Version        uint32
	IPVersion      uint32
	AgentIP        net.IP
	SubAgentID     uint32
	SequenceNumber uint32
	Uptime         uint32
	SampleCount    uint32
}

type FlowSample struct {
	SequenceNumber    uint32
	SourceIDType      uint32
	SourceIDIndex     uint32
	SamplingRate      uint32
	SamplePool        uint32
	Drops             uint32
	InputInterface    uint32
	OutputInterface   uint32
	FlowRecordCount   uint32
}

type Parser struct {
	asnResolver *ASNResolver
}

func NewParser() *Parser {
	return &Parser{
		asnResolver: NewASNResolver(),
	}
}

func (p *Parser) Parse(datagram []byte) ([]types.FlowRecord, error) {
	if len(datagram) < 28 {
		return nil, errors.New("datagram too small")
	}

	offset := 0

	header := SFlowHeader{}
	header.Version = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4

	if header.Version != SFlowVersion5 {
		return nil, fmt.Errorf("unsupported sFlow version: %d", header.Version)
	}

	header.IPVersion = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4

	if header.IPVersion == 1 {
		header.AgentIP = net.IP(datagram[offset:offset+4])
		offset += 4
	} else if header.IPVersion == 2 {
		header.AgentIP = net.IP(datagram[offset:offset+16])
		offset += 16
	} else {
		return nil, fmt.Errorf("unsupported IP version: %d", header.IPVersion)
	}

	header.SubAgentID = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4
	header.SequenceNumber = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4
	header.Uptime = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4
	header.SampleCount = binary.BigEndian.Uint32(datagram[offset:offset+4])
	offset += 4

	var records []types.FlowRecord
	now := time.Now()

	for i := uint32(0); i < header.SampleCount; i++ {
		if offset+8 > len(datagram) {
			break
		}

		sampleType := binary.BigEndian.Uint32(datagram[offset:offset+4])
		offset += 4
		sampleLength := binary.BigEndian.Uint32(datagram[offset:offset+4])
		offset += 4

		if sampleType == TypeFlowSample {
			sampleRecords, err := p.parseFlowSample(datagram[offset:offset+int(sampleLength)], now)
			if err == nil {
				records = append(records, sampleRecords...)
			}
		}

		offset += int(sampleLength)
	}

	return records, nil
}

func (p *Parser) parseFlowSample(data []byte, timestamp time.Time) ([]types.FlowRecord, error) {
	if len(data) < 32 {
		return nil, errors.New("flow sample too small")
	}

	offset := 0

	sample := FlowSample{}
	sample.SequenceNumber = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4

	sourceID := binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.SourceIDType = sourceID >> 24
	sample.SourceIDIndex = sourceID & 0x00FFFFFF

	sample.SamplingRate = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.SamplePool = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.Drops = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.InputInterface = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.OutputInterface = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	sample.FlowRecordCount = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4

	var records []types.FlowRecord
	var baseRecord types.FlowRecord
	baseRecord.Timestamp = timestamp
	baseRecord.Packets = 1

	for i := uint32(0); i < sample.FlowRecordCount; i++ {
		if offset+8 > len(data) {
			break
		}

		flowType := binary.BigEndian.Uint32(data[offset:offset+4])
		offset += 4
		flowLength := binary.BigEndian.Uint32(data[offset:offset+4])
		offset += 4

		if offset+int(flowLength) > len(data) {
			break
		}

		flowData := data[offset:offset+int(flowLength)]

		switch flowType {
		case FlowTypeRawPacketHeader:
			if rec, err := p.parseRawPacketHeader(flowData, baseRecord); err == nil {
				rec.Bytes *= uint64(sample.SamplingRate)
				rec.Packets = uint32(sample.SamplingRate)
				records = append(records, rec)
			}
		case FlowTypeIPv4:
			if rec, err := p.parseIPv4Flow(flowData, baseRecord); err == nil {
				rec.Bytes *= uint64(sample.SamplingRate)
				rec.Packets = uint32(sample.SamplingRate)
				records = append(records, rec)
			}
		}

		offset += int(flowLength)
	}

	return records, nil
}

func (p *Parser) parseRawPacketHeader(data []byte, base types.FlowRecord) (types.FlowRecord, error) {
	if len(data) < 8 {
		return base, errors.New("raw packet header too small")
	}

	offset := 0
	headerProtocol := binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	frameLength := binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4
	_ = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4

	headerLen := int(binary.BigEndian.Uint32(data[offset:offset+4]))
	offset += 4

	if headerProtocol == 1 && len(data) >= offset+14 {
		etherType := binary.BigEndian.Uint16(data[offset+12:offset+14])
		offset += 14

		if etherType == 0x0800 && len(data) >= offset+20 {
			rec, err := p.parseIPv4Header(data[offset:], base)
			if err == nil {
				rec.Bytes = uint64(frameLength)
				rec.SrcASN = p.asnResolver.Lookup(rec.SrcIP)
				rec.DstASN = p.asnResolver.Lookup(rec.DstIP)
				return rec, nil
			}
		} else if etherType == 0x86DD && len(data) >= offset+40 {
			rec, err := p.parseIPv6Header(data[offset:], base)
			if err == nil {
				rec.Bytes = uint64(frameLength)
				rec.SrcASN = p.asnResolver.Lookup(rec.SrcIP)
				rec.DstASN = p.asnResolver.Lookup(rec.DstIP)
				return rec, nil
			}
		}
	}

	return base, errors.New("unknown packet type")
}

func (p *Parser) parseIPv4Header(data []byte, base types.FlowRecord) (types.FlowRecord, error) {
	if len(data) < 20 {
		return base, errors.New("IPv4 header too small")
	}

	rec := base
	version := data[0] >> 4
	if version != 4 {
		return base, errors.New("not IPv4")
	}

	ihl := int(data[0]&0x0F) * 4
	rec.Protocol = data[9]
	rec.SrcIP = net.IP(data[12:16]).String()
	rec.DstIP = net.IP(data[16:20]).String()
	rec.ProtocolStr = protocolToString(rec.Protocol)

	offset := ihl

	if rec.Protocol == 6 && len(data) >= offset+8 {
		rec.SrcPort = binary.BigEndian.Uint16(data[offset:offset+2])
		rec.DstPort = binary.BigEndian.Uint16(data[offset+2:offset+4])
	} else if rec.Protocol == 17 && len(data) >= offset+4 {
		rec.SrcPort = binary.BigEndian.Uint16(data[offset:offset+2])
		rec.DstPort = binary.BigEndian.Uint16(data[offset+2:offset+4])
	}

	return rec, nil
}

const (
	IPv6ExtHopByHop     = 0
	IPv6ExtRouting      = 43
	IPv6ExtFragment     = 44
	IPv6ExtDestination  = 60
	IPv6ExtAuthentication = 51
	IPv6ExtESP          = 50
	IPv6ExtMobility     = 135
	IPv6ExtHostIdentity = 139
	IPv6ExtShim6        = 140
)

func isIPv6ExtensionHeader(proto uint8) bool {
	switch proto {
	case IPv6ExtHopByHop, IPv6ExtRouting, IPv6ExtFragment,
		IPv6ExtDestination, IPv6ExtAuthentication, IPv6ExtESP,
		IPv6ExtMobility, IPv6ExtHostIdentity, IPv6ExtShim6:
		return true
	}
	return false
}

func (p *Parser) parseIPv6Header(data []byte, base types.FlowRecord) (types.FlowRecord, error) {
	if len(data) < 40 {
		return base, errors.New("IPv6 header too small")
	}

	rec := base
	version := data[0] >> 4
	if version != 6 {
		return base, errors.New("not IPv6")
	}

	nextHeader := data[6]
	srcIPBytes := make([]byte, 16)
	dstIPBytes := make([]byte, 16)
	copy(srcIPBytes, data[8:24])
	copy(dstIPBytes, data[24:40])
	rec.SrcIP = normalizeIPv6Address(net.IP(srcIPBytes))
	rec.DstIP = normalizeIPv6Address(net.IP(dstIPBytes))

	offset := 40
	currentHeader := nextHeader

	for isIPv6ExtensionHeader(currentHeader) {
		if offset+2 > len(data) {
			break
		}

		extLen := int(data[offset+1])*8 + 8

		if offset+extLen > len(data) {
			break
		}

		nextHeader = data[offset]
		offset += extLen
		currentHeader = nextHeader

		if currentHeader == IPv6ExtFragment {
			if offset+8 > len(data) {
				break
			}
			fragOffset := binary.BigEndian.Uint16(data[offset+2:offset+4]) & 0xFFF8
			if fragOffset != 0 {
				rec.Protocol = IPv6ExtFragment
				rec.ProtocolStr = "IPv6-Frag"
				return rec, nil
			}
		}
	}

	rec.Protocol = currentHeader
	rec.ProtocolStr = protocolToString(currentHeader)

	if currentHeader == 6 && len(data) >= offset+20 {
		rec.SrcPort = binary.BigEndian.Uint16(data[offset:offset+2])
		rec.DstPort = binary.BigEndian.Uint16(data[offset+2:offset+4])
	} else if currentHeader == 17 && len(data) >= offset+8 {
		rec.SrcPort = binary.BigEndian.Uint16(data[offset:offset+2])
		rec.DstPort = binary.BigEndian.Uint16(data[offset+2:offset+4])
	} else if currentHeader == 1 && len(data) >= offset+8 {
		rec.SrcPort = 0
		rec.DstPort = 0
	}

	return rec, nil
}

func normalizeIPv6Address(ip net.IP) string {
	if ipv4 := ip.To4(); ipv4 != nil {
		return ipv4.String()
	}

	ipv6 := ip.To16()
	if ipv6 == nil {
		return ip.String()
	}

	parts := make([]uint16, 8)
	for i := 0; i < 8; i++ {
		parts[i] = binary.BigEndian.Uint16(ipv6[i*2 : i*2+2])
	}

	bestStart := -1
	bestLen := 0
	currentStart := -1
	currentLen := 0

	for i := 0; i < 8; i++ {
		if parts[i] == 0 {
			if currentStart == -1 {
				currentStart = i
			}
			currentLen++
			if currentLen > bestLen {
				bestLen = currentLen
				bestStart = currentStart
			}
		} else {
			currentStart = -1
			currentLen = 0
		}
	}

	if bestLen < 2 {
		partsStr := make([]string, 8)
		for i := 0; i < 8; i++ {
			partsStr[i] = fmt.Sprintf("%x", parts[i])
		}
		return strings.Join(partsStr, ":")
	}

	partsStr := make([]string, 0, 8)
	for i := 0; i < 8; i++ {
		if i == bestStart {
			partsStr = append(partsStr, "")
			i += bestLen - 1
			if bestStart == 0 {
				partsStr = append(partsStr, "")
			}
			if bestStart+bestLen == 8 && bestStart > 0 {
				partsStr = append(partsStr, "")
			}
		} else {
			partsStr = append(partsStr, fmt.Sprintf("%x", parts[i]))
		}
	}

	return strings.Join(partsStr, ":")
}

func (p *Parser) parseIPv4Flow(data []byte, base types.FlowRecord) (types.FlowRecord, error) {
	if len(data) < 36 {
		return base, errors.New("IPv4 flow too small")
	}

	rec := base
	rec.SrcIP = net.IP(data[0:4]).String()
	rec.DstIP = net.IP(data[4:8]).String()
	rec.Protocol = data[24]
	rec.ProtocolStr = protocolToString(rec.Protocol)
	rec.SrcPort = binary.BigEndian.Uint16(data[28:30])
	rec.DstPort = binary.BigEndian.Uint16(data[30:32])
	rec.Bytes = binary.BigEndian.Uint64(data[16:24])
	rec.SrcASN = p.asnResolver.Lookup(rec.SrcIP)
	rec.DstASN = p.asnResolver.Lookup(rec.DstIP)

	return rec, nil
}

func protocolToString(protocol uint8) string {
	switch protocol {
	case 1:
		return "ICMP"
	case 2:
		return "IGMP"
	case 6:
		return "TCP"
	case 17:
		return "UDP"
	case 41:
		return "IPv6"
	case 47:
		return "GRE"
	case 50:
		return "ESP"
	case 51:
		return "AH"
	case 89:
		return "OSPF"
	case 132:
		return "SCTP"
	default:
		return fmt.Sprintf("Unknown(%d)", protocol)
	}
}

func PortToAppName(port uint16, protocol uint8) string {
	protoStr := protocolToString(protocol)
	switch port {
	case 80:
		return "HTTP"
	case 443:
		return "HTTPS"
	case 53:
		return "DNS"
	case 22:
		return "SSH"
	case 21:
		return "FTP"
	case 25:
		return "SMTP"
	case 110:
		return "POP3"
	case 143:
		return "IMAP"
	case 3389:
		return "RDP"
	case 445:
		return "SMB"
	case 3306:
		return "MySQL"
	case 5432:
		return "PostgreSQL"
	case 6379:
		return "Redis"
	case 27017:
		return "MongoDB"
	case 8080:
		return "HTTP-Proxy"
	case 8443:
		return "HTTPS-Alt"
	case 5060:
		return "SIP"
	case 161, 162:
		return "SNMP"
	default:
		return fmt.Sprintf("%s-%d", protoStr, port)
	}
}

package dhcp

import (
	"encoding/binary"
	"fmt"
	"net"
	"strings"
)

const (
	OpRequest  = 1
	OpReply    = 2

	OptionPad                    = 0
	OptionSubnetMask             = 1
	OptionRouter                 = 3
	OptionDNS                    = 6
	OptionHostName               = 12
	OptionDomainName             = 15
	OptionBroadcastAddr          = 28
	OptionRequestedIP            = 50
	OptionLeaseTime              = 51
	OptionMessageType            = 53
	OptionServerID               = 54
	OptionParameterRequestList   = 55
	OptionMaxMessageSize         = 57
	OptionClientIdentifier       = 61
	OptionTFTPServerName         = 66
	OptionBootfileName           = 67
	OptionUserClass              = 77
	OptionClientArchitecture     = 93
	OptionEnd                    = 255

	MsgDiscover = 1
	MsgOffer    = 2
	MsgRequest  = 3
	MsgDecline  = 4
	MsgAck      = 5
	MsgNak      = 6
	MsgRelease  = 7
	MsgInform   = 8
)

const (
	ArchBIOS    uint16 = 0
	ArchEFIx86  uint16 = 6
	ArchEFIx64  uint16 = 7
	ArchEFIBC   uint16 = 9
	ArchEFIARM  uint16 = 10
	ArchEFIARM64 uint16 = 11
)

var MagicCookie = []byte{99, 130, 83, 99}

type Packet struct {
	Op          byte
	HType       byte
	HLen        byte
	Hops        byte
	XID         uint32
	Secs        uint16
	Flags       uint16
	CIAddr      net.IP
	YIAddr      net.IP
	SIAddr      net.IP
	GIAddr      net.IP
	CHAddr      net.HardwareAddr
	SName       [64]byte
	File        [128]byte
	Options     map[byte][]byte
	RawOptions  []byte
}

func ParsePacket(data []byte) (*Packet, error) {
	if len(data) < 240 {
		return nil, fmt.Errorf("packet too short: %d bytes", len(data))
	}

	p := &Packet{
		Op:     data[0],
		HType:  data[1],
		HLen:   data[2],
		Hops:   data[3],
		XID:    binary.BigEndian.Uint32(data[4:8]),
		Secs:   binary.BigEndian.Uint16(data[8:10]),
		Flags:  binary.BigEndian.Uint16(data[10:12]),
		CIAddr: net.IP(data[12:16]),
		YIAddr: net.IP(data[16:20]),
		SIAddr: net.IP(data[20:24]),
		GIAddr: net.IP(data[24:28]),
	}

	macLen := int(p.HLen)
	if macLen > 16 {
		macLen = 16
	}
	p.CHAddr = make(net.HardwareAddr, macLen)
	copy(p.CHAddr, data[28:28+macLen])

	copy(p.SName[:], data[44:108])
	copy(p.File[:], data[108:236])

	if len(data) > 240 {
		if len(data) < 244 || !equalBytes(data[236:240], MagicCookie) {
			return nil, fmt.Errorf("invalid DHCP magic cookie")
		}
		p.Options = make(map[byte][]byte)
		i := 240
		for i < len(data) {
			optCode := data[i]
			if optCode == OptionPad {
				i++
				continue
			}
			if optCode == OptionEnd {
				break
			}
			i++
			if i >= len(data) {
				break
			}
			optLen := int(data[i])
			i++
			if i+optLen > len(data) {
				break
			}
			optVal := make([]byte, optLen)
			copy(optVal, data[i:i+optLen])
			p.Options[optCode] = optVal
			i += optLen
		}
	}

	return p, nil
}

func (p *Packet) MessageType() (byte, bool) {
	val, ok := p.Options[OptionMessageType]
	if !ok || len(val) == 0 {
		return 0, false
	}
	return val[0], true
}

func (p *Packet) ClientIdentifier() (net.HardwareAddr, bool) {
	val, ok := p.Options[OptionClientIdentifier]
	if !ok || len(val) < 2 {
		return nil, false
	}
	return net.HardwareAddr(val[1:]), true
}

func (p *Packet) IsiPXE() bool {
	val, ok := p.Options[OptionUserClass]
	if !ok {
		return false
	}
	return strings.Contains(string(val), "iPXE")
}

func (p *Packet) ClientArch() uint16 {
	val, ok := p.Options[OptionClientArchitecture]
	if !ok || len(val) < 2 {
		return 0
	}
	return binary.BigEndian.Uint16(val[:2])
}

func ArchName(arch uint16) string {
	switch arch {
	case ArchBIOS:
		return "BIOS"
	case ArchEFIx86:
		return "EFI x86"
	case ArchEFIx64:
		return "EFI x64"
	case ArchEFIBC:
		return "EFI BC"
	case ArchEFIARM:
		return "EFI ARM"
	case ArchEFIARM64:
		return "EFI ARM64"
	default:
		return fmt.Sprintf("Unknown (%d)", arch)
	}
}

type DHCPOption struct {
	Code  byte
	Value []byte
}

func BuildReply(req *Packet, serverIP net.IP, clientIP net.IP, subnetMask net.IP, gateway net.IP, dnsServers []net.IP, leaseTime uint32, tftpServer string, bootFile string) []byte {
	reply := make([]byte, 240)

	reply[0] = OpReply
	reply[1] = req.HType
	reply[2] = req.HLen
	reply[3] = 0

	binary.BigEndian.PutUint32(reply[4:8], req.XID)
	binary.BigEndian.PutUint16(reply[8:10], 0)
	binary.BigEndian.PutUint16(reply[10:12], 0)

	copy(reply[12:16], net.IPv4zero)
	copy(reply[16:20], clientIP.To4())
	copy(reply[20:24], serverIP.To4())
	copy(reply[24:28], req.GIAddr.To4())

	macLen := int(req.HLen)
	if macLen > 16 {
		macLen = 16
	}
	copy(reply[28:28+macLen], req.CHAddr)

	opts := []DHCPOption{
		{Code: OptionMessageType, Value: []byte{MsgAck}},
		{Code: OptionServerID, Value: serverIP.To4()},
		{Code: OptionLeaseTime, Value: uint32ToBytes(leaseTime)},
		{Code: OptionSubnetMask, Value: subnetMask.To4()},
	}

	if len(gateway) > 0 && !gateway.Equal(net.IPv4zero) {
		opts = append(opts, DHCPOption{Code: OptionRouter, Value: gateway.To4()})
	}

	if len(dnsServers) > 0 {
		dnsData := make([]byte, 0, len(dnsServers)*4)
		for _, dns := range dnsServers {
			dnsData = append(dnsData, dns.To4()...)
		}
		opts = append(opts, DHCPOption{Code: OptionDNS, Value: dnsData})
	}

	if tftpServer != "" {
		sNameBytes := []byte(tftpServer)
		if len(sNameBytes) <= 64 {
			copy(reply[44:], sNameBytes)
		}
		opts = append(opts, DHCPOption{Code: OptionTFTPServerName, Value: []byte(tftpServer)})
	}

	if bootFile != "" {
		fileBytes := []byte(bootFile)
		if len(fileBytes) <= 128 {
			copy(reply[108:], fileBytes)
		}
		opts = append(opts, DHCPOption{Code: OptionBootfileName, Value: []byte(bootFile)})
	}

	copy(reply[236:240], MagicCookie)

	var optsBuf []byte
	for _, opt := range opts {
		optsBuf = append(optsBuf, opt.Code)
		optsBuf = append(optsBuf, byte(len(opt.Value)))
		optsBuf = append(optsBuf, opt.Value...)
	}
	optsBuf = append(optsBuf, OptionEnd)

	reply = append(reply, optsBuf...)

	return reply
}

func uint32ToBytes(v uint32) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, v)
	return b
}

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

type LeasePool struct {
	Start   net.IP
	End     net.IP
	Mask    net.IP
	Gateway net.IP
	leased  map[string]bool
}

func NewLeasePool(start, end, mask, gateway string) (*LeasePool, error) {
	pool := &LeasePool{
		leased: make(map[string]bool),
	}
	pool.Start = net.ParseIP(start)
	if pool.Start == nil {
		return nil, fmt.Errorf("invalid start IP: %s", start)
	}
	pool.End = net.ParseIP(end)
	if pool.End == nil {
		return nil, fmt.Errorf("invalid end IP: %s", end)
	}
	pool.Mask = net.ParseIP(mask)
	if pool.Mask == nil {
		return nil, fmt.Errorf("invalid mask: %s", mask)
	}
	pool.Gateway = net.ParseIP(gateway)
	if pool.Gateway == nil {
		return nil, fmt.Errorf("invalid gateway: %s", gateway)
	}
	return pool, nil
}

func (p *LeasePool) Allocate(mac net.HardwareAddr) net.IP {
	macStr := mac.String()

	start := ipToUint32(p.Start)
	end := ipToUint32(p.End)

	for i := start; i <= end; i++ {
		ip := uint32ToIP(i)
		ipStr := ip.String()
		if !p.leased[ipStr] {
			p.leased[ipStr] = true
			p.leased[macStr] = true
			return ip
		}
	}

	return nil
}

func ipToUint32(ip net.IP) uint32 {
	return binary.BigEndian.Uint32(ip.To4())
}

func uint32ToIP(v uint32) net.IP {
	ip := make(net.IP, 4)
	binary.BigEndian.PutUint32(ip, v)
	return ip
}

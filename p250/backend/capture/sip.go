package capture

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"

	"sip-detector/types"
)

type SIPCapture struct {
	device       string
	snapshotLen  int32
	promiscuous  bool
	timeout      time.Duration
	handle       *pcap.Handle
	RegisterChan chan *types.SIPRegister
	stopChan     chan struct{}
}

func NewSIPCapture(device string) *SIPCapture {
	return &SIPCapture{
		device:       device,
		snapshotLen:  65535,
		promiscuous:  true,
		timeout:      pcap.BlockForever,
		RegisterChan: make(chan *types.SIPRegister, 1000),
		stopChan:     make(chan struct{}),
	}
}

func (sc *SIPCapture) Start() error {
	handle, err := pcap.OpenLive(sc.device, sc.snapshotLen, sc.promiscuous, sc.timeout)
	if err != nil {
		return fmt.Errorf("failed to open device %s: %w", sc.device, err)
	}
	sc.handle = handle

	filter := "udp port 5060 or tcp port 5060"
	if err := handle.SetBPFFilter(filter); err != nil {
		handle.Close()
		return fmt.Errorf("failed to set BPF filter: %w", err)
	}

	log.Printf("Started SIP capture on %s, filter: %s", sc.device, filter)

	packetSource := gopacket.NewPacketSource(handle, handle.LinkType())

	go func() {
		for {
			select {
			case <-sc.stopChan:
				return
			case packet := <-packetSource.Packets():
				if sip := sc.parseSIPPacket(packet); sip != nil {
					sc.RegisterChan <- sip
				}
			}
		}
	}()

	return nil
}

func (sc *SIPCapture) Stop() {
	close(sc.stopChan)
	if sc.handle != nil {
		sc.handle.Close()
	}
	close(sc.RegisterChan)
}

func (sc *SIPCapture) parseSIPPacket(packet gopacket.Packet) *types.SIPRegister {
	ipLayer := packet.NetworkLayer()
	if ipLayer == nil {
		return nil
	}

	ip, ok := ipLayer.(*layers.IPv4)
	if !ok {
		return nil
	}

	var payload []byte
	var destPort string

	tcpLayer := packet.TransportLayer()
	if tcpLayer == nil {
		return nil
	}

	switch layer := tcpLayer.(type) {
	case *layers.UDP:
		payload = layer.Payload
		destPort = layer.DstPort.String()
	case *layers.TCP:
		payload = layer.Payload
		destPort = layer.DstPort.String()
	default:
		return nil
	}

	if len(payload) == 0 {
		return nil
	}

	payloadStr := string(payload)
	if !strings.HasPrefix(payloadStr, "REGISTER ") &&
		!strings.Contains(payloadStr, "\nREGISTER ") {
		return nil
	}

	lines := strings.Split(payloadStr, "\r\n")
	if len(lines) == 0 {
		return nil
	}

	isRegister := false
	for _, line := range lines {
		if strings.HasPrefix(line, "REGISTER ") {
			isRegister = true
			break
		}
	}

	if !isRegister {
		return nil
	}

	sipReg := &types.SIPRegister{
		SourceIP:     ip.SrcIP.String(),
		Destination:  fmt.Sprintf("%s:%s", ip.DstIP.String(), destPort),
		Timestamp:    time.Now(),
		RegisterType: types.RegisterTypeUnknown,
		Expires:      -1,
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "Call-ID:") {
			sipReg.CallID = strings.TrimSpace(strings.TrimPrefix(line, "Call-ID:"))
		} else if strings.HasPrefix(line, "From:") {
			sipReg.From = strings.TrimSpace(strings.TrimPrefix(line, "From:"))
		} else if strings.HasPrefix(line, "To:") {
			sipReg.To = strings.TrimSpace(strings.TrimPrefix(line, "To:"))
		} else if strings.HasPrefix(line, "User-Agent:") {
			sipReg.UserAgent = strings.TrimSpace(strings.TrimPrefix(line, "User-Agent:"))
		} else if strings.HasPrefix(line, "Contact:") {
			sipReg.Contact = parseContact(strings.TrimSpace(strings.TrimPrefix(line, "Contact:")))
		} else if strings.HasPrefix(line, "Expires:") {
			expiresStr := strings.TrimSpace(strings.TrimPrefix(line, "Expires:"))
			if expires, err := strconv.Atoi(expiresStr); err == nil {
				sipReg.Expires = expires
			}
		}
	}

	if sipReg.Expires < 0 {
		sipReg.Expires = extractExpiresFromContact(sipReg.Contact)
	}

	sipReg.RegisterType = determineRegisterType(sipReg.Expires)

	return sipReg
}

func ListDevices() ([]pcap.Interface, error) {
	return pcap.FindAllDevs()
}

func parseContact(contact string) string {
	re := regexp.MustCompile(`<sip:([^>]+)>`)
	matches := re.FindStringSubmatch(contact)
	if len(matches) >= 2 {
		return matches[1]
	}

	re2 := regexp.MustCompile(`sip:([^;>\s]+)`)
	matches2 := re2.FindStringSubmatch(contact)
	if len(matches2) >= 2 {
		return matches2[1]
	}

	return contact
}

func extractExpiresFromContact(contact string) int {
	re := regexp.MustCompile(`expires=(\d+)`)
	matches := re.FindStringSubmatch(contact)
	if len(matches) >= 2 {
		if expires, err := strconv.Atoi(matches[1]); err == nil {
			return expires
		}
	}
	return -1
}

func determineRegisterType(expires int) string {
	if expires < 0 {
		return types.RegisterTypeUnknown
	}
	if expires < 600 {
		return types.RegisterTypeRefresh
	}
	return types.RegisterTypeInitial
}

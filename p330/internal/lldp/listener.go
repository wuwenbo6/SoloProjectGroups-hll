package lldp

import (
	"fmt"
	"log"
	"net"
	"time"

	"github.com/mdlayher/ethernet"
	"github.com/mdlayher/lldp"
)

type PortStats struct {
	SpeedMbps   int       `json:"speedMbps"`
	Utilization float64   `json:"utilization"`
	InOctets    uint64    `json:"inOctets"`
	OutOctets   uint64    `json:"outOctets"`
	LastUpdated time.Time `json:"lastUpdated"`
}

type LLDPEvent struct {
	ChassisID        string
	ChassisIDSubtype string
	PortID           string
	PortIDSubtype    string
	SystemName       string
	SystemDesc       string
	MgmtAddr         string
	TTL              int
	TLVs             []TLVEntry
	TargetChassisID  string
	TargetPortID     string
	Capabilities     Capabilities
	PortStats        PortStats
}

type Capabilities struct {
	Available []string `json:"available"`
	Enabled   []string `json:"enabled"`
}

func parseCapabilitiesTLV(value []byte) Capabilities {
	cap := Capabilities{}
	if len(value) < 4 {
		return cap
	}
	avail := uint16(value[0])<<8 | uint16(value[1])
	enabled := uint16(value[2])<<8 | uint16(value[3])
	bitmapNames := []struct {
		bit  uint16
		name string
	}{
		{0x0001, "Other"},
		{0x0002, "Repeater"},
		{0x0004, "Bridge"},
		{0x0008, "WLAN"},
		{0x0010, "Router"},
		{0x0020, "Telephone"},
		{0x0040, "DOCSIS"},
		{0x0080, "Station"},
		{0x0100, "C-VLAN"},
		{0x0200, "S-VLAN"},
		{0x0400, "TPMR"},
	}
	for _, bn := range bitmapNames {
		if avail&bn.bit != 0 {
			cap.Available = append(cap.Available, bn.name)
		}
		if enabled&bn.bit != 0 {
			cap.Enabled = append(cap.Enabled, bn.name)
		}
	}
	return cap
}

type TLVEntry struct {
	Type     int    `json:"type"`
	TypeName string `json:"typeName"`
	Value    string `json:"value"`
}

type LLDPListener struct {
	InterfaceName string
	Events        chan LLDPEvent
	stop          chan struct{}
}

func NewListener(iface string) *LLDPListener {
	return &LLDPListener{
		InterfaceName: iface,
		Events:        make(chan LLDPEvent, 64),
		stop:          make(chan struct{}),
	}
}

func (l *LLDPListener) Start() error {
	iface, err := net.InterfaceByName(l.InterfaceName)
	if err != nil {
		return fmt.Errorf("failed to find interface %s: %w", l.InterfaceName, err)
	}

	conn, err := l.listenRaw(iface)
	if err != nil {
		return fmt.Errorf("failed to open raw socket on %s (may need root privileges): %w", l.InterfaceName, err)
	}

	go l.readLoop(conn)
	return nil
}

func (l *LLDPListener) listenRaw(iface *net.Interface) (net.PacketConn, error) {
	addr := &rawAddr{ifIndex: iface.Index}
	conn, err := net.ListenPacket("raw:88cc", l.InterfaceName)
	if err != nil {
		_ = addr
		return nil, fmt.Errorf("raw socket not available: %w", err)
	}
	return conn, nil
}

type rawAddr struct {
	ifIndex int
}

func (a *rawAddr) Network() string { return "raw" }
func (a *rawAddr) String() string  { return fmt.Sprintf("ifindex:%d", a.ifIndex) }

func (l *LLDPListener) readLoop(conn net.PacketConn) {
	defer conn.Close()

	buf := make([]byte, 65535)
	for {
		select {
		case <-l.stop:
			return
		default:
		}

		if err := conn.SetReadDeadline(time.Now().Add(1 * time.Second)); err != nil {
			log.Printf("LLDP listener set deadline error: %v", err)
			continue
		}

		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			log.Printf("LLDP listener read error: %v", err)
			continue
		}

		eframe := new(ethernet.Frame)
		if err := eframe.UnmarshalBinary(buf[:n]); err != nil {
			log.Printf("Ethernet frame parse error: %v", err)
			continue
		}

		if eframe.EtherType != lldp.EtherType {
			continue
		}

		frame := new(lldp.Frame)
		if err := frame.UnmarshalBinary(eframe.Payload); err != nil {
			log.Printf("LLDP frame parse error: %v", err)
			continue
		}

		event := l.parseFrame(frame)
		select {
		case l.Events <- event:
		default:
			log.Printf("LLDP event channel full, dropping event from %s", event.ChassisID)
		}
	}
}

func (l *LLDPListener) parseFrame(frame *lldp.Frame) LLDPEvent {
	event := LLDPEvent{
		TTL: int(frame.TTL / time.Second),
	}

	if frame.ChassisID != nil {
		event.ChassisIDSubtype = fmt.Sprintf("%d", frame.ChassisID.Subtype)
		switch frame.ChassisID.Subtype {
		case lldp.ChassisIDSubtypeMACAddress:
			if len(frame.ChassisID.ID) == 6 {
				mac := net.HardwareAddr(frame.ChassisID.ID)
				event.ChassisID = mac.String()
			} else {
				event.ChassisID = fmt.Sprintf("%x", frame.ChassisID.ID)
			}
		default:
			event.ChassisID = fmt.Sprintf("%s", frame.ChassisID.ID)
		}
	}

	if frame.PortID != nil {
		event.PortIDSubtype = fmt.Sprintf("%d", frame.PortID.Subtype)
		switch frame.PortID.Subtype {
		case lldp.PortIDSubtypeInterfaceName:
			event.PortID = string(frame.PortID.ID)
		case lldp.PortIDSubtypeMACAddress:
			if len(frame.PortID.ID) == 6 {
				mac := net.HardwareAddr(frame.PortID.ID)
				event.PortID = mac.String()
			} else {
				event.PortID = fmt.Sprintf("%x", frame.PortID.ID)
			}
		default:
			event.PortID = fmt.Sprintf("%s", frame.PortID.ID)
		}
	}

	for _, tlv := range frame.Optional {
		entry := TLVEntry{
			Type:     int(tlv.Type),
			TypeName: tlvTypeName(tlv.Type),
			Value:    string(tlv.Value),
		}

		switch tlv.Type {
		case lldp.TLVTypeSystemName:
			event.SystemName = string(tlv.Value)
		case lldp.TLVTypeSystemDescription:
			event.SystemDesc = string(tlv.Value)
		case lldp.TLVTypeManagementAddress:
			event.MgmtAddr = string(tlv.Value)
		case lldp.TLVTypeSystemCapabilities:
			event.Capabilities = parseCapabilitiesTLV(tlv.Value)
		}

		event.TLVs = append(event.TLVs, entry)
	}

	return event
}

func (l *LLDPListener) Stop() {
	close(l.stop)
}

func tlvTypeName(t lldp.TLVType) string {
	switch t {
	case lldp.TLVTypePortDescription:
		return "PortDescription"
	case lldp.TLVTypeSystemName:
		return "SystemName"
	case lldp.TLVTypeSystemDescription:
		return "SystemDescription"
	case lldp.TLVTypeSystemCapabilities:
		return "SystemCapabilities"
	case lldp.TLVTypeManagementAddress:
		return "ManagementAddress"
	case lldp.TLVTypeOrganizationSpecific:
		return "OrgSpecific"
	default:
		return fmt.Sprintf("Unknown(%d)", t)
	}
}

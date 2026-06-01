package ripng

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/netip"
	"sync"
	"time"
)

type PacketDirection string

const (
	PacketDirSend    PacketDirection = "send"
	PacketDirRecv    PacketDirection = "recv"
	PacketDirDrop    PacketDirection = "drop"
)

type CapturedPacket struct {
	Timestamp   time.Time       `json:"timestamp"`
	Direction   PacketDirection `json:"direction"`
	SenderID    string          `json:"sender_id"`
	ReceiverID  string          `json:"receiver_id,omitempty"`
	LinkName    string          `json:"link_name"`
	Message     RIPngMessage    `json:"message"`
	RawBytes    []byte          `json:"raw_bytes,omitempty"`
	PacketIndex int             `json:"packet_index"`
}

type PacketCapture struct {
	mu       sync.RWMutex
	Packets  []CapturedPacket `json:"packets"`
	Enabled  bool             `json:"enabled"`
	MaxPackets int            `json:"max_packets"`
	packetCounter int
}

func NewPacketCapture(maxPackets int) *PacketCapture {
	return &PacketCapture{
		Packets:    make([]CapturedPacket, 0, maxPackets),
		Enabled:    true,
		MaxPackets: maxPackets,
	}
}

func (pc *PacketCapture) Capture(direction PacketDirection, senderID, receiverID, linkName string, msg RIPngMessage) {
	pc.mu.Lock()
	defer pc.mu.Unlock()

	if !pc.Enabled {
		return
	}

	pc.packetCounter++
	pkt := CapturedPacket{
		Timestamp:   time.Now(),
		Direction:   direction,
		SenderID:    senderID,
		ReceiverID:  receiverID,
		LinkName:    linkName,
		Message:     msg,
		RawBytes:    EncodeRIPngMessage(msg),
		PacketIndex: pc.packetCounter,
	}

	if len(pc.Packets) >= pc.MaxPackets {
		pc.Packets = pc.Packets[1:]
	}
	pc.Packets = append(pc.Packets, pkt)
}

func (pc *PacketCapture) GetPackets() []CapturedPacket {
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	result := make([]CapturedPacket, len(pc.Packets))
	copy(result, pc.Packets)
	return result
}

func (pc *PacketCapture) Clear() {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.Packets = make([]CapturedPacket, 0, pc.MaxPackets)
	pc.packetCounter = 0
}

func (pc *PacketCapture) SetEnabled(enabled bool) {
	pc.mu.Lock()
	defer pc.mu.Unlock()
	pc.Enabled = enabled
}

func (pc *PacketCapture) ExportJSON() ([]byte, error) {
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	export := struct {
		Packets    []CapturedPacket `json:"packets"`
		Count      int              `json:"count"`
		ExportedAt time.Time        `json:"exported_at"`
	}{
		Packets:    pc.Packets,
		Count:      len(pc.Packets),
		ExportedAt: time.Now(),
	}

	return json.MarshalIndent(export, "", "  ")
}

func (pc *PacketCapture) ExportPCAP() ([]byte, error) {
	pc.mu.RLock()
	defer pc.mu.RUnlock()

	var pcap []byte
	pcap = append(pcap, []byte{0xd4, 0xc3, 0xb2, 0xa1}...)
	pcap = append(pcap, []byte{0x02, 0x00, 0x04, 0x00}...)
	pcap = append(pcap, []byte{0x00, 0x00, 0x00, 0x00}...)
	pcap = append(pcap, []byte{0x00, 0x00, 0x00, 0x00}...)
	pcap = append(pcap, []byte{0xff, 0xff, 0x00, 0x00}...)
	pcap = append(pcap, []byte{0x7c, 0x00, 0x00, 0x00}...)

	for _, pkt := range pc.Packets {
		raw := pkt.RawBytes
		if len(raw) == 0 {
			raw = EncodeRIPngMessage(pkt.Message)
		}

		sec := uint32(pkt.Timestamp.Unix())
		usec := uint32(pkt.Timestamp.Nanosecond() / 1000)
		inclLen := uint32(len(raw))
		origLen := inclLen

		secBytes := make([]byte, 4)
		binary.LittleEndian.PutUint32(secBytes, sec)
		usecBytes := make([]byte, 4)
		binary.LittleEndian.PutUint32(usecBytes, usec)
		inclLenBytes := make([]byte, 4)
		binary.LittleEndian.PutUint32(inclLenBytes, inclLen)
		origLenBytes := make([]byte, 4)
		binary.LittleEndian.PutUint32(origLenBytes, origLen)

		pcap = append(pcap, secBytes...)
		pcap = append(pcap, usecBytes...)
		pcap = append(pcap, inclLenBytes...)
		pcap = append(pcap, origLenBytes...)
		pcap = append(pcap, raw...)
	}

	return pcap, nil
}

func EncodeRIPngMessage(msg RIPngMessage) []byte {
	var buf []byte
	buf = append(buf, msg.Command)
	buf = append(buf, 0)
	buf = append(buf, 0, 0)

	for _, entry := range msg.Entries {
		addrBytes := entry.Prefix.Addr().As16()
		buf = append(buf, addrBytes[:]...)

		tagBytes := make([]byte, 2)
		binary.BigEndian.PutUint16(tagBytes, entry.RouteTag)
		buf = append(buf, tagBytes...)

		buf = append(buf, byte(entry.Prefix.Bits()))
		buf = append(buf, entry.Metric)

		nhBytes := entry.NextHop.As16()
		buf = append(buf, nhBytes[:]...)
	}

	return buf
}

func DecodeRIPngMessage(data []byte) (RIPngMessage, error) {
	if len(data) < 4 {
		return RIPngMessage{}, fmt.Errorf("packet too short")
	}

	msg := RIPngMessage{
		Command: data[0],
	}

	offset := 4
	for offset < len(data) {
		if offset+20 > len(data) {
			break
		}

		var addr [16]byte
		copy(addr[:], data[offset:offset+16])
		offset += 16

		routeTag := binary.BigEndian.Uint16(data[offset : offset+2])
		offset += 2

		prefixLen := data[offset]
		offset++

		metric := data[offset]
		offset++

		var nextHop [16]byte
		copy(nextHop[:], data[offset:offset+16])
		offset += 16

		ipAddr, _ := netip.AddrFromSlice(addr[:])
		prefix := netip.PrefixFrom(ipAddr, int(prefixLen))
		nhAddr, _ := netip.AddrFromSlice(nextHop[:])

		entry := RouteEntry{
			Prefix:   prefix,
			RouteTag: routeTag,
			Metric:   metric,
			NextHop:  nhAddr,
		}
		msg.Entries = append(msg.Entries, entry)
	}

	return msg, nil
}

package sflow

import (
	"encoding/binary"
	"net"
	"testing"
)

func TestNormalizeIPv6Address(t *testing.T) {
	tests := []struct {
		name     string
		ip       net.IP
		expected string
	}{
		{
			name:     "full address",
			ip:       net.ParseIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
			expected: "2001:db8:85a3::8a2e:370:7334",
		},
		{
			name:     "leading zeros",
			ip:       net.ParseIP("2001:0db8:0000:0000:0000:0000:0000:0001"),
			expected: "2001:db8::1",
		},
		{
			name:     "loopback",
			ip:       net.ParseIP("::1"),
			expected: "::1",
		},
		{
			name:     "unspecified",
			ip:       net.ParseIP("::"),
			expected: "::",
		},
		{
			name:     "trailing zeros",
			ip:       net.ParseIP("2001:db8::"),
			expected: "2001:db8::",
		},
		{
			name:     "middle zeros",
			ip:       net.ParseIP("2001:db8:0:0:1:0:0:1"),
			expected: "2001:db8::1:0:0:1",
		},
		{
			name:     "single zero group",
			ip:       net.ParseIP("2001:db8:0:1:1:1:1:1"),
			expected: "2001:db8:0:1:1:1:1:1",
		},
		{
			name:     "ipv4-mapped",
			ip:       net.ParseIP("::ffff:192.168.1.1"),
			expected: "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := normalizeIPv6Address(tt.ip)
			if result != tt.expected {
				t.Errorf("normalizeIPv6Address(%v) = %q, want %q", tt.ip, result, tt.expected)
			}
		})
	}
}

func TestParseIPv6HeaderWithExtension(t *testing.T) {
	packet := make([]byte, 80)

	packet[0] = 0x60
	binary.BigEndian.PutUint16(packet[4:6], 40)
	packet[6] = 43
	packet[7] = 64

	srcIP := net.ParseIP("2001:db8::1")
	dstIP := net.ParseIP("2001:db8::2")
	copy(packet[8:24], srcIP.To16())
	copy(packet[24:40], dstIP.To16())

	packet[40] = 6
	packet[41] = 0

	routerAddr := net.ParseIP("2001:db8::ff")
	copy(packet[48:64], routerAddr.To16())

	binary.BigEndian.PutUint16(packet[64:66], 12345)
	binary.BigEndian.PutUint16(packet[66:68], 80)
	binary.BigEndian.PutUint32(packet[68:72], 0x12345678)

	parser := NewParser()
	record, err := parser.parseIPv6Header(packet, struct{}{})
	if err != nil {
		t.Fatalf("parseIPv6Header failed: %v", err)
	}

	if record.Protocol != 6 {
		t.Errorf("expected protocol 6 (TCP), got %d", record.Protocol)
	}
	if record.SrcPort != 12345 {
		t.Errorf("expected src port 12345, got %d", record.SrcPort)
	}
	if record.DstPort != 80 {
		t.Errorf("expected dst port 80, got %d", record.DstPort)
	}
	if record.SrcIP != "2001:db8::1" {
		t.Errorf("expected src IP 2001:db8::1, got %s", record.SrcIP)
	}
	if record.DstIP != "2001:db8::2" {
		t.Errorf("expected dst IP 2001:db8::2, got %s", record.DstIP)
	}
}

func TestParseIPv6HeaderWithFragment(t *testing.T) {
	packet := make([]byte, 60)

	packet[0] = 0x60
	binary.BigEndian.PutUint16(packet[4:6], 20)
	packet[6] = 44
	packet[7] = 64

	srcIP := net.ParseIP("2001:db8::1")
	dstIP := net.ParseIP("2001:db8::2")
	copy(packet[8:24], srcIP.To16())
	copy(packet[24:40], dstIP.To16())

	packet[40] = 6
	packet[41] = 0
	binary.BigEndian.PutUint16(packet[42:44], 0x1000)
	binary.BigEndian.PutUint32(packet[44:48], 0x12345678)

	parser := NewParser()
	record, err := parser.parseIPv6Header(packet, struct{}{})
	if err != nil {
		t.Fatalf("parseIPv6Header failed: %v", err)
	}

	if record.Protocol != 44 {
		t.Errorf("expected fragment protocol 44, got %d", record.Protocol)
	}
	if record.ProtocolStr != "IPv6-Frag" {
		t.Errorf("expected protocol string 'IPv6-Frag', got %s", record.ProtocolStr)
	}
}

func TestIsIPv6ExtensionHeader(t *testing.T) {
	tests := []struct {
		proto    uint8
		expected bool
	}{
		{0, true},
		{43, true},
		{44, true},
		{50, true},
		{51, true},
		{60, true},
		{6, false},
		{17, false},
		{1, false},
	}

	for _, tt := range tests {
		t.Run(t.Name(), func(t *testing.T) {
			result := isIPv6ExtensionHeader(tt.proto)
			if result != tt.expected {
				t.Errorf("isIPv6ExtensionHeader(%d) = %v, want %v", tt.proto, result, tt.expected)
			}
		})
	}
}

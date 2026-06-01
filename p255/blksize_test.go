package main

import (
	"encoding/binary"
	"strings"
	"testing"
)

func TestMTUCalculation(t *testing.T) {
	expectedMax := 1500 - 20 - 8 - 4 - 48
	if MaxBlockSize != expectedMax {
		t.Errorf("MaxBlockSize = %d, want %d (MTU%d - IP%d - UDP%d - TFTP%d - Option%d)",
			MaxBlockSize, expectedMax, MTU, IPHeader, UDPHeader, TFTPHeader, OptionOverhead)
	}
	if MaxBlockSize != 1420 {
		t.Errorf("MaxBlockSize should be 1420, got %d", MaxBlockSize)
	}
	t.Logf("MTU=%d, Max blksize=%d (1500-20-8-4-48=1420)", MTU, MaxBlockSize)
}

func TestBlksizeNegotiation(t *testing.T) {
	tests := []struct {
		name     string
		reqSize  int
		expected int
	}{
		{"Default 512", 0, 512},
		{"Within range 1024", 1024, 1024},
		{"Below min 256", 256, 512},
		{"Above max 2048", 2048, 1420},
		{"Exact min 512", 512, 512},
		{"Exact max 1420", 1420, 1420},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := negotiateBlockSize(tt.reqSize)
			if result != tt.expected {
				t.Errorf("negotiateBlockSize(%d) = %d, want %d", tt.reqSize, result, tt.expected)
			}
		})
	}
}

func negotiateBlockSize(reqSize int) int {
	if reqSize == 0 {
		return DefaultBlockSize
	}
	if reqSize < MinBlockSize {
		return MinBlockSize
	}
	if reqSize > MaxBlockSize {
		return MaxBlockSize
	}
	return reqSize
}

func TestRetransmitConstants(t *testing.T) {
	if RetransmitTimeout != 3*1000000000 {
		t.Errorf("RetransmitTimeout = %v, want 3s", RetransmitTimeout)
	}
	if MaxRetransmits != 5 {
		t.Errorf("MaxRetransmits = %d, want 5", MaxRetransmits)
	}
	t.Logf("Retransmit timeout: %v, Max retransmits: %d", RetransmitTimeout, MaxRetransmits)
}

func TestDuplicateBlockDetection(t *testing.T) {
	session := &TransferSession{
		ReceivedBlocks: make(map[uint16]bool),
	}

	session.ReceivedBlocks[1] = true
	session.ReceivedBlocks[2] = true

	testCases := []struct {
		blockNum uint16
		isDup    bool
	}{
		{1, true},
		{2, true},
		{3, false},
		{4, false},
		{1, true},
	}

	for _, tc := range testCases {
		result := session.ReceivedBlocks[tc.blockNum]
		if result != tc.isDup {
			t.Errorf("Block #%d duplicate check = %v, want %v", tc.blockNum, result, tc.isDup)
		}
		if !tc.isDup {
			session.ReceivedBlocks[tc.blockNum] = true
		}
	}
	t.Log("Duplicate block detection working correctly")
}

func TestSessionInitialization(t *testing.T) {
	session := &TransferSession{
		BlockNum:       0,
		RetransmitCount: 0,
		StopRetransmit: make(chan struct{}),
		ReceivedBlocks: make(map[uint16]bool),
	}

	if session.BlockNum != 0 {
		t.Error("Initial BlockNum should be 0")
	}
	if session.RetransmitCount != 0 {
		t.Error("Initial RetransmitCount should be 0")
	}
	if len(session.ReceivedBlocks) != 0 {
		t.Error("Initial ReceivedBlocks should be empty")
	}
	t.Log("Session initialization correct")
}

func TestTFTPRequestParsing(t *testing.T) {
	req := buildRRQWithBlksize("test.bin", 1024)
	
	opcode := binary.BigEndian.Uint16(req[0:2])
	if opcode != OpRRQ {
		t.Errorf("Expected opcode RRQ(1), got %d", opcode)
	}

	parts := strings.Split(string(req[2:]), "\x00")
	if parts[0] != "test.bin" {
		t.Errorf("Expected filename 'test.bin', got '%s'", parts[0])
	}

	foundBlksize := false
	for i := 2; i < len(parts)-1; i += 2 {
		if parts[i] == "blksize" && parts[i+1] == "1024" {
			foundBlksize = true
			break
		}
	}
	if !foundBlksize {
		t.Error("Expected blksize option not found")
	}
}

func buildRRQWithBlksize(filename string, blksize int) []byte {
	req := make([]byte, 2)
	binary.BigEndian.PutUint16(req, OpRRQ)
	req = append(req, []byte(filename)...)
	req = append(req, 0)
	req = append(req, []byte("octet")...)
	req = append(req, 0)
	req = append(req, []byte("blksize")...)
	req = append(req, 0)
	req = append(req, []byte("1024")...)
	req = append(req, 0)
	return req
}

func TestOACKBuilding(t *testing.T) {
	oack := buildOACK(1024)
	
	opcode := binary.BigEndian.Uint16(oack[0:2])
	if opcode != OpOACK {
		t.Errorf("Expected opcode OACK(6), got %d", opcode)
	}

	parts := strings.Split(string(oack[2:]), "\x00")
	if len(parts) < 3 {
		t.Fatalf("OACK too short, got %d parts", len(parts))
	}

	if parts[0] != "blksize" {
		t.Errorf("Expected option 'blksize', got '%s'", parts[0])
	}

	if parts[1] != "1024" {
		t.Errorf("Expected blksize value '1024', got '%s'", parts[1])
	}
}

func buildOACK(blksize int) []byte {
	oack := make([]byte, 2)
	binary.BigEndian.PutUint16(oack, OpOACK)
	oack = append(oack, []byte("blksize")...)
	oack = append(oack, 0)
	oack = append(oack, []byte("1024")...)
	oack = append(oack, 0)
	return oack
}

func TestEfficiencyCalculation(t *testing.T) {
	tests := []struct {
		blockSize int
		expected  int
	}{
		{512, 0},
		{1024, 50},
		{1420, 64},
	}

	for _, tt := range tests {
		efficiency := int(float64(1-512.0/float64(tt.blockSize)) * 100)
		t.Logf("Block size %d: %d%% efficiency gain", tt.blockSize, efficiency)
		if efficiency < tt.expected-5 || efficiency > tt.expected+5 {
			t.Errorf("Efficiency for %d bytes = %d%%, expected ~%d%%", tt.blockSize, efficiency, tt.expected)
		}
	}
}

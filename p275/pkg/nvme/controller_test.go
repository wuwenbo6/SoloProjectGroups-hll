package nvme

import (
	"strings"
	"testing"
)

func TestNewController(t *testing.T) {
	c := NewController()
	if c == nil {
		t.Fatal("NewController returned nil")
	}
	if c.identifyData == nil {
		t.Error("identifyData is nil")
	}
	if c.ioSubmissionQueues == nil {
		t.Error("ioSubmissionQueues is nil")
	}
	if c.ioCompletionQueues == nil {
		t.Error("ioCompletionQueues is nil")
	}
}

func TestIdentifyControllerCommand(t *testing.T) {
	c := NewController()

	cmd := &Command{
		Opcode: AdminOpcodeIdentify,
		CID:    1,
		CDW10:  IdentifyCNSController,
	}

	resp := c.ProcessAdminCommand(cmd)

	if resp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x", resp.Status)
	}
	if resp.CID != 1 {
		t.Errorf("Expected CID 1, got %d", resp.CID)
	}
	if len(resp.Data) != 4096 {
		t.Errorf("Expected 4096 bytes of data, got %d", len(resp.Data))
	}

	vid := uint16(resp.Data[0]) | uint16(resp.Data[1])<<8
	if vid != 0x8086 {
		t.Errorf("Expected VID 0x8086, got 0x%04x", vid)
	}

	sn := strings.TrimRight(string(resp.Data[4:24]), " ")
	if sn != "NVME0000000000001" {
		t.Errorf("Expected SN 'NVME0000000000001', got '%q'", sn)
	}
}

func TestIdentifyNamespaceCommand(t *testing.T) {
	c := NewController()

	cmd := &Command{
		Opcode: AdminOpcodeIdentify,
		CID:    2,
		CDW10:  IdentifyCNSNamespace,
	}

	resp := c.ProcessAdminCommand(cmd)

	if resp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x", resp.Status)
	}
	if len(resp.Data) != 4096 {
		t.Errorf("Expected 4096 bytes of data, got %d", len(resp.Data))
	}
	if resp.Data[0] != 0x01 {
		t.Errorf("Expected first byte 0x01, got 0x%02x", resp.Data[0])
	}
}

func TestCreateIOCQ(t *testing.T) {
	c := NewController()

	cmd := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}

	resp := c.ProcessAdminCommand(cmd)

	if resp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}

	cq := c.GetIOCompletionQueues()
	if _, exists := cq[1]; !exists {
		t.Error("CQ 1 should exist after creation")
	}
	if cq[1].Size != 64 {
		t.Errorf("Expected CQ size 64, got %d", cq[1].Size)
	}
	if !cq[1].PC {
		t.Error("Expected CQ PC to be true")
	}
}

func TestCreateIOCQAlreadyExists(t *testing.T) {
	c := NewController()

	cmd1 := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}
	resp1 := c.ProcessAdminCommand(cmd1)
	if resp1.Status != StatusSuccess {
		t.Errorf("First create should succeed, got 0x%04x", resp1.Status)
	}

	cmd2 := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    2,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}
	resp2 := c.ProcessAdminCommand(cmd2)
	if resp2.Status != StatusQueueAlreadyExists {
		t.Errorf("Expected StatusQueueAlreadyExists, got 0x%04x (%s)", resp2.Status, c.StatusToString(resp2.Status))
	}
}

func TestCreateIOCQInvalidID(t *testing.T) {
	c := NewController()

	cmd := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  0 | (63 << 16),
		CDW11:  0x1,
	}

	resp := c.ProcessAdminCommand(cmd)
	if resp.Status != StatusInvalidQueueIdentifier {
		t.Errorf("Expected StatusInvalidQueueIdentifier, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}
}

func TestCreateIOSQ(t *testing.T) {
	c := NewController()

	cqCmd := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}
	cqResp := c.ProcessAdminCommand(cqCmd)
	if cqResp.Status != StatusSuccess {
		t.Fatalf("Failed to create CQ: 0x%04x", cqResp.Status)
	}

	sqCmd := &Command{
		Opcode: AdminOpcodeCreateIOSQ,
		CID:    2,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1 | (1 << 16),
	}
	sqResp := c.ProcessAdminCommand(sqCmd)

	if sqResp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x (%s)", sqResp.Status, c.StatusToString(sqResp.Status))
	}

	sq := c.GetIOSubmissionQueues()
	if _, exists := sq[1]; !exists {
		t.Error("SQ 1 should exist after creation")
	}
	if sq[1].Size != 64 {
		t.Errorf("Expected SQ size 64, got %d", sq[1].Size)
	}
	if sq[1].CQID != 1 {
		t.Errorf("Expected SQ CQID 1, got %d", sq[1].CQID)
	}
}

func TestCreateIOSQWithoutCQ(t *testing.T) {
	c := NewController()

	sqCmd := &Command{
		Opcode: AdminOpcodeCreateIOSQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1 | (1 << 16),
	}
	sqResp := c.ProcessAdminCommand(sqCmd)

	if sqResp.Status != StatusInvalidField {
		t.Errorf("Expected StatusInvalidField, got 0x%04x (%s)", sqResp.Status, c.StatusToString(sqResp.Status))
	}
}

func TestDeleteIOSQ(t *testing.T) {
	c := NewController()

	cqCmd := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}
	c.ProcessAdminCommand(cqCmd)

	sqCmd := &Command{
		Opcode: AdminOpcodeCreateIOSQ,
		CID:    2,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1 | (1 << 16),
	}
	c.ProcessAdminCommand(sqCmd)

	if len(c.GetIOSubmissionQueues()) != 1 {
		t.Fatal("SQ should exist before deletion")
	}

	deleteCmd := &Command{
		Opcode: AdminOpcodeDeleteIOSQ,
		CID:    3,
		CDW10:  1,
	}
	resp := c.ProcessAdminCommand(deleteCmd)

	if resp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}

	if len(c.GetIOSubmissionQueues()) != 0 {
		t.Error("SQ should be deleted")
	}
}

func TestDeleteIOSQNotFound(t *testing.T) {
	c := NewController()

	deleteCmd := &Command{
		Opcode: AdminOpcodeDeleteIOSQ,
		CID:    1,
		CDW10:  999,
	}
	resp := c.ProcessAdminCommand(deleteCmd)

	if resp.Status != StatusQueueNotFound {
		t.Errorf("Expected StatusQueueNotFound, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}
}

func TestDeleteIOCQ(t *testing.T) {
	c := NewController()

	cqCmd := &Command{
		Opcode: AdminOpcodeCreateIOCQ,
		CID:    1,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1,
	}
	c.ProcessAdminCommand(cqCmd)

	sqCmd := &Command{
		Opcode: AdminOpcodeCreateIOSQ,
		CID:    2,
		CDW10:  1 | (63 << 16),
		CDW11:  0x1 | (1 << 16),
	}
	c.ProcessAdminCommand(sqCmd)

	if len(c.GetIOSubmissionQueues()) != 1 {
		t.Fatal("SQ should exist before CQ deletion")
	}

	deleteCmd := &Command{
		Opcode: AdminOpcodeDeleteIOCQ,
		CID:    3,
		CDW10:  1,
	}
	resp := c.ProcessAdminCommand(deleteCmd)

	if resp.Status != StatusSuccess {
		t.Errorf("Expected status Success, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}

	if len(c.GetIOCompletionQueues()) != 0 {
		t.Error("CQ should be deleted")
	}
	if len(c.GetIOSubmissionQueues()) != 0 {
		t.Error("Associated SQ should also be deleted when CQ is deleted")
	}
}

func TestInvalidCommand(t *testing.T) {
	c := NewController()

	cmd := &Command{
		Opcode: 0xFF,
		CID:    1,
	}

	resp := c.ProcessAdminCommand(cmd)

	if resp.Status != StatusInvalidCommand {
		t.Errorf("Expected StatusInvalidCommand, got 0x%04x (%s)", resp.Status, c.StatusToString(resp.Status))
	}
}

func TestGetNextCID(t *testing.T) {
	c := NewController()

	cid1 := c.GetNextCID()
	cid2 := c.GetNextCID()
	cid3 := c.GetNextCID()

	if cid1 != 1 {
		t.Errorf("Expected first CID 1, got %d", cid1)
	}
	if cid2 != 2 {
		t.Errorf("Expected second CID 2, got %d", cid2)
	}
	if cid3 != 3 {
		t.Errorf("Expected third CID 3, got %d", cid3)
	}
}

func TestIdentifyControllerData(t *testing.T) {
	ic := NewIdentifyController()

	if strings.TrimRight(ic.SerialNumber(), " ") != "NVME0000000000001" {
		t.Errorf("Unexpected serial number: %q", ic.SerialNumber())
	}
	if strings.TrimRight(ic.ModelNumber(), " ") != "NVMe Simulator Controller" {
		t.Errorf("Unexpected model number: %q", ic.ModelNumber())
	}
	if strings.Trim(ic.FirmwareRevision(), "\x00 ") != "1.0.0" {
		t.Errorf("Unexpected firmware revision: %q", ic.FirmwareRevision())
	}

	for i, b := range ic.SN {
		if b == 0 {
			t.Errorf("SN byte %d is NUL, should be space-padded per NVMe spec", i)
		}
	}
	for i, b := range ic.MN {
		if b == 0 {
			t.Errorf("MN byte %d is NUL, should be space-padded per NVMe spec", i)
		}
	}

	if ic.VID != 0x8086 {
		t.Errorf("Unexpected VID: 0x%04x", ic.VID)
	}
	if ic.VER != 0x00010300 {
		t.Errorf("Unexpected VER: 0x%08x", ic.VER)
	}

	data := ic.Bytes()
	if len(data) != 4096 {
		t.Errorf("Expected 4096 bytes, got %d", len(data))
	}

	vid := uint16(data[0]) | uint16(data[1])<<8
	if vid != ic.VID {
		t.Errorf("Serialized VID mismatch: 0x%04x vs 0x%04x", vid, ic.VID)
	}

	snBytes := data[4:24]
	for i, b := range snBytes {
		if b == 0 {
			t.Errorf("Serialized SN byte %d is NUL, should be space-padded per NVMe spec", i)
		}
	}
	mnBytes := data[24:64]
	for i, b := range mnBytes {
		if b == 0 {
			t.Errorf("Serialized MN byte %d is NUL, should be space-padded per NVMe spec", i)
		}
	}
}

func TestOpcodeToString(t *testing.T) {
	c := NewController()

	tests := []struct {
		opcode   uint8
		expected string
	}{
		{AdminOpcodeIdentify, "Identify"},
		{AdminOpcodeCreateIOSQ, "Create IO SQ"},
		{AdminOpcodeDeleteIOSQ, "Delete IO SQ"},
		{AdminOpcodeCreateIOCQ, "Create IO CQ"},
		{AdminOpcodeDeleteIOCQ, "Delete IO CQ"},
		{AdminOpcodeGetLogPage, "Get Log Page"},
		{NVMOpcodeRead, "NVM Read"},
		{NVMOpcodeWrite, "NVM Write"},
		{0xFF, "Unknown Opcode: 0xff"},
	}

	for _, tt := range tests {
		result := c.OpcodeToString(tt.opcode)
		if result != tt.expected {
			t.Errorf("OpcodeToString(0x%02x) = %q, want %q", tt.opcode, result, tt.expected)
		}
	}
}

func TestStatusToString(t *testing.T) {
	c := NewController()

	tests := []struct {
		status   uint16
		expected string
	}{
		{StatusSuccess, "Success"},
		{StatusInvalidQueueIdentifier, "Invalid Queue Identifier"},
		{StatusQueueAlreadyExists, "Queue Already Exists"},
		{StatusQueueNotFound, "Queue Not Found"},
		{StatusInvalidCommand, "Invalid Command"},
		{StatusInvalidField, "Invalid Field in Command"},
		{StatusInvalidNamespace, "Invalid Namespace or Format"},
		{StatusOutOfRange, "LBA Out of Range"},
		{0xFFFF, "Unknown Status: 0xffff"},
	}

	for _, tt := range tests {
		result := c.StatusToString(tt.status)
		if result != tt.expected {
			t.Errorf("StatusToString(0x%04x) = %q, want %q", tt.status, result, tt.expected)
		}
	}
}

func TestConcurrentCommandProcessing(t *testing.T) {
	c := NewController()
	done := make(chan bool)

	go func() {
		for i := 0; i < 100; i++ {
			cmd := &Command{
				Opcode: AdminOpcodeIdentify,
				CID:    uint16(i),
				CDW10:  IdentifyCNSController,
			}
			resp := c.ProcessCommand(cmd)
			if resp.Status != StatusSuccess {
				t.Errorf("Concurrent identify failed: 0x%04x", resp.Status)
			}
		}
		done <- true
	}()

	go func() {
		for i := 1; i <= 100; i++ {
			cmd := &Command{
				Opcode: AdminOpcodeCreateIOCQ,
				CID:    uint16(i + 100),
				CDW10:  uint32(i) | (63 << 16),
				CDW11:  0x1,
			}
			c.ProcessCommand(cmd)
		}
		done <- true
	}()

	<-done
	<-done

	cq := c.GetIOCompletionQueues()
	if len(cq) != 100 {
		t.Errorf("Expected 100 CQs after concurrent creation, got %d", len(cq))
	}
}

func TestNVMReadWrite(t *testing.T) {
	c := NewController()

	writeCmd := &Command{
		Opcode: NVMOpcodeWrite,
		CID:    1,
		NSID:   1,
		CDW10:  0,
		CDW11:  0,
		CDW12:  0,
		PRP1:   0xAB,
	}

	writeResp := c.ProcessCommand(writeCmd)
	if writeResp.Status != StatusSuccess {
		t.Errorf("Write failed: 0x%04x (%s)", writeResp.Status, c.StatusToString(writeResp.Status))
	}

	readCmd := &Command{
		Opcode: NVMOpcodeRead,
		CID:    2,
		NSID:   1,
		CDW10:  0,
		CDW11:  0,
		CDW12:  0,
	}

	readResp := c.ProcessCommand(readCmd)
	if readResp.Status != StatusSuccess {
		t.Errorf("Read failed: 0x%04x (%s)", readResp.Status, c.StatusToString(readResp.Status))
	}

	if len(readResp.Data) != SectorSize {
		t.Errorf("Expected %d bytes, got %d", SectorSize, len(readResp.Data))
	}

	for i, b := range readResp.Data {
		if b != 0xAB {
			t.Errorf("Byte %d mismatch: expected 0xAB, got 0x%02x", i, b)
			break
		}
	}
}

func TestNVMReadWriteMultipleBlocks(t *testing.T) {
	c := NewController()

	writeCmd := &Command{
		Opcode: NVMOpcodeWrite,
		CID:    1,
		NSID:   1,
		CDW10:  10,
		CDW11:  0,
		CDW12:  3,
		PRP1:   0xCD,
	}

	writeResp := c.ProcessCommand(writeCmd)
	if writeResp.Status != StatusSuccess {
		t.Errorf("Write failed: 0x%04x", writeResp.Status)
	}

	readCmd := &Command{
		Opcode: NVMOpcodeRead,
		CID:    2,
		NSID:   1,
		CDW10:  10,
		CDW11:  0,
		CDW12:  3,
	}

	readResp := c.ProcessCommand(readCmd)
	if readResp.Status != StatusSuccess {
		t.Errorf("Read failed: 0x%04x", readResp.Status)
	}

	expectedBytes := 4 * SectorSize
	if len(readResp.Data) != expectedBytes {
		t.Errorf("Expected %d bytes, got %d", expectedBytes, len(readResp.Data))
	}

	for i, b := range readResp.Data {
		if b != 0xCD {
			t.Errorf("Byte %d mismatch: expected 0xCD, got 0x%02x", i, b)
			break
		}
	}
}

func TestNVMReadInvalidNamespace(t *testing.T) {
	c := NewController()

	readCmd := &Command{
		Opcode: NVMOpcodeRead,
		CID:    1,
		NSID:   999,
		CDW10:  0,
		CDW12:  0,
	}

	resp := c.ProcessCommand(readCmd)
	if resp.Status != StatusInvalidNamespace {
		t.Errorf("Expected StatusInvalidNamespace, got 0x%04x", resp.Status)
	}
}

func TestNVMWriteOutOfRange(t *testing.T) {
	c := NewController()

	ns := c.GetNamespace(1)
	highLBA := ns.Size / SectorSize

	writeCmd := &Command{
		Opcode: NVMOpcodeWrite,
		CID:    1,
		NSID:   1,
		CDW10:  uint32(highLBA),
		CDW12:  0,
		PRP1:   0xAA,
	}

	resp := c.ProcessCommand(writeCmd)
	if resp.Status != StatusOutOfRange {
		t.Errorf("Expected StatusOutOfRange, got 0x%04x", resp.Status)
	}
}

func TestGetLogPageSMART(t *testing.T) {
	c := NewController()

	logCmd := &Command{
		Opcode: AdminOpcodeGetLogPage,
		CID:    1,
		NSID:   0xFFFFFFFF,
		CDW10:  LogPageSMART | (127 << 16),
	}

	resp := c.ProcessCommand(logCmd)
	if resp.Status != StatusSuccess {
		t.Errorf("GetLogPage SMART failed: 0x%04x", resp.Status)
	}

	if len(resp.Data) != 512 {
		t.Errorf("Expected 512 bytes, got %d", len(resp.Data))
	}

	criticalWarning := resp.Data[0]
	temperature := uint16(resp.Data[1]) | uint16(resp.Data[2])<<8
	availableSpare := resp.Data[3]

	if criticalWarning != 0 {
		t.Errorf("Expected criticalWarning 0, got 0x%02x", criticalWarning)
	}
	if temperature != 300 {
		t.Errorf("Expected temperature 300K, got %dK", temperature)
	}
	if availableSpare != 100 {
		t.Errorf("Expected availableSpare 100%%, got %d%%", availableSpare)
	}
}

func TestSMARTCounterUpdates(t *testing.T) {
	c := NewController()

	initialSmart := c.GetSMARTData()
	initialReads := GetInt128(initialSmart.HostReadCommands[:])
	initialWrites := GetInt128(initialSmart.HostWriteCommands[:])
	initialDataRead := GetInt128(initialSmart.DataUnitsRead[:])
	initialDataWritten := GetInt128(initialSmart.DataUnitsWritten[:])

	writeCmd := &Command{
		Opcode: NVMOpcodeWrite,
		CID:    1,
		NSID:   1,
		CDW10:  0,
		CDW12:  1,
		PRP1:   0xAA,
	}
	c.ProcessCommand(writeCmd)

	readCmd := &Command{
		Opcode: NVMOpcodeRead,
		CID:    2,
		NSID:   1,
		CDW10:  0,
		CDW12:  1,
	}
	c.ProcessCommand(readCmd)

	finalSmart := c.GetSMARTData()
	finalReads := GetInt128(finalSmart.HostReadCommands[:])
	finalWrites := GetInt128(finalSmart.HostWriteCommands[:])
	finalDataRead := GetInt128(finalSmart.DataUnitsRead[:])
	finalDataWritten := GetInt128(finalSmart.DataUnitsWritten[:])

	if finalReads != initialReads+1 {
		t.Errorf("Expected reads to increment by 1: %d -> %d", initialReads, finalReads)
	}
	if finalWrites != initialWrites+1 {
		t.Errorf("Expected writes to increment by 1: %d -> %d", initialWrites, finalWrites)
	}
	if finalDataRead != initialDataRead+2 {
		t.Errorf("Expected data units read to increment by 2: %d -> %d", initialDataRead, finalDataRead)
	}
	if finalDataWritten != initialDataWritten+2 {
		t.Errorf("Expected data units written to increment by 2: %d -> %d", initialDataWritten, finalDataWritten)
	}
}

func TestGetLogPageInvalidLID(t *testing.T) {
	c := NewController()

	logCmd := &Command{
		Opcode: AdminOpcodeGetLogPage,
		CID:    1,
		NSID:   0xFFFFFFFF,
		CDW10:  0xFF | (127 << 16),
	}

	resp := c.ProcessCommand(logCmd)
	if resp.Status != StatusInvalidField {
		t.Errorf("Expected StatusInvalidField for invalid LID, got 0x%04x", resp.Status)
	}
}

func TestNamespaceInitialization(t *testing.T) {
	c := NewController()

	ns := c.GetNamespace(1)
	if ns == nil {
		t.Fatal("Namespace 1 should exist")
	}
	if ns.ID != 1 {
		t.Errorf("Expected NS ID 1, got %d", ns.ID)
	}
	if ns.Size != DefaultNamespaceSize {
		t.Errorf("Expected size %d, got %d", DefaultNamespaceSize, ns.Size)
	}
	if len(ns.Data) != int(DefaultNamespaceSize) {
		t.Errorf("Expected data length %d, got %d", DefaultNamespaceSize, len(ns.Data))
	}

	ns999 := c.GetNamespace(999)
	if ns999 != nil {
		t.Error("Namespace 999 should not exist")
	}
}

func TestSMARTHealthInfoBytes(t *testing.T) {
	smart := NewSMARTHealthInfo()
	data := smart.Bytes()

	if len(data) != 512 {
		t.Errorf("Expected 512 bytes, got %d", len(data))
	}

	if data[0] != 0x00 {
		t.Errorf("Expected CriticalWarning 0x00, got 0x%02x", data[0])
	}

	temp := uint16(data[1]) | uint16(data[2])<<8
	if temp != smart.Temperature {
		t.Errorf("Temperature mismatch: %d vs %d", temp, smart.Temperature)
	}

	if data[3] != smart.AvailableSpare {
		t.Errorf("AvailableSpare mismatch: %d vs %d", data[3], smart.AvailableSpare)
	}

	hur := GetInt128(data[64:80])
	expectedHur := GetInt128(smart.HostReadCommands[:])
	if hur != expectedHur {
		t.Errorf("HostReadCommands mismatch: %d vs %d", hur, expectedHur)
	}
}

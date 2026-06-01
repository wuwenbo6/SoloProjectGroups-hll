package protocol

import (
	"fmt"
	"testing"
	"time"
)

func TestCP56Time2aMarshalUnmarshal(t *testing.T) {
	now := time.Date(2026, 5, 31, 18, 45, 30, 123000000, time.Local)
	ts := CP56Time2aFromTime(now)

	fmt.Printf("Original time: %s\n", now.Format("2006-01-02 15:04:05.000"))
	fmt.Printf("CP56Time2a: Msec=%d Min=%d Hour=%d Day=%d Month=%d Year=%d Weekday=%d\n",
		ts.Msec, ts.Min, ts.Hour, ts.Day, ts.Month, ts.Year, ts.Weekday)
	fmt.Printf("String: %s\n", ts.String())

	if ts.Weekday == 0 {
		t.Errorf("Weekday should not be 0")
	}

	data := ts.Marshal()
	if len(data) != 7 {
		t.Fatalf("Marshal should return 7 bytes, got %d", len(data))
	}
	fmt.Printf("Encoded: % X\n", data)

	decoded := ParseCP56Time2a(data)
	fmt.Printf("Decoded: Msec=%d Min=%d Hour=%d Day=%d Month=%d Year=%d Weekday=%d\n",
		decoded.Msec, decoded.Min, decoded.Hour, decoded.Day, decoded.Month, decoded.Year, decoded.Weekday)
	fmt.Printf("Decoded string: %s\n", decoded.String())

	if decoded.Msec != ts.Msec {
		t.Errorf("Msec mismatch: expected %d, got %d", ts.Msec, decoded.Msec)
	}
	if decoded.Min != ts.Min {
		t.Errorf("Min mismatch: expected %d, got %d", ts.Min, decoded.Min)
	}
	if decoded.Hour != ts.Hour {
		t.Errorf("Hour mismatch: expected %d, got %d", ts.Hour, decoded.Hour)
	}
	if decoded.Day != ts.Day {
		t.Errorf("Day mismatch: expected %d, got %d", ts.Day, decoded.Day)
	}
	if decoded.Month != ts.Month {
		t.Errorf("Month mismatch: expected %d, got %d", ts.Month, decoded.Month)
	}
	if decoded.Year != ts.Year {
		t.Errorf("Year mismatch: expected %d, got %d", ts.Year, decoded.Year)
	}
	if decoded.Weekday != ts.Weekday {
		t.Errorf("Weekday mismatch: expected %d, got %d", ts.Weekday, decoded.Weekday)
	}

	t.Log("CP56Time2a fields:")
	t.Logf("  - Msec (16-bit): 0-59999 = milliseconds")
	t.Logf("  - Min (6-bit): 0-59 = minutes")
	t.Logf("  - Hour (5-bit): 0-23 = hours")
	t.Logf("  - Day (5-bit): 1-31 = day of month")
	t.Logf("  - Weekday (3-bit): 1-7 = Monday-Sunday")
	t.Logf("  - Month (4-bit): 1-12")
	t.Logf("  - Year: 0-99")
	t.Logf("  - SU (Summer Time flag)")
	t.Logf("  - IV (Invalid flag)")
	t.Logf("  - Substituted flag")
}

func TestASDUSQ1Encoding(t *testing.T) {
	commonAddr := uint16(1)
	baseIOA := uint32(1)
	elements := make([][]byte, 5)
	for i := 0; i < 5; i++ {
		elements[i] = []byte{byte(i & 0x01)}
	}

	dataSQ1 := BuildMSPNA1SQ(commonAddr, CauseInterrogated, baseIOA, elements)
	t.Logf("SQ=1 ASDU encoded size: %d bytes", len(dataSQ1))
	t.Logf("SQ=1 data: % X", dataSQ1)

	objects := make([]InformationObject, 5)
	for i := 0; i < 5; i++ {
		objects[i] = InformationObject{
			IOA:      baseIOA + uint32(i),
			Elements: []byte{byte(i & 0x01)},
		}
	}
	dataSQ0 := BuildMSPNA1(commonAddr, CauseInterrogated, objects)
	t.Logf("SQ=0 ASDU encoded size: %d bytes", len(dataSQ0))
	t.Logf("SQ=0 data: % X", dataSQ0)

	expectedSQ1Size := 6 + 3 + 5*1
	if len(dataSQ1) != expectedSQ1Size {
		t.Errorf("SQ=1 size wrong: expected %d, got %d", expectedSQ1Size, len(dataSQ1))
	}
	expectedSQ0Size := 6 + 5*3 + 5*1
	if len(dataSQ0) != expectedSQ0Size {
		t.Errorf("SQ=0 size wrong: expected %d, got %d", expectedSQ0Size, len(dataSQ0))
	}
	t.Logf("Bandwidth saving: %d bytes for 5 objects (%.1f%%)",
		len(dataSQ0)-len(dataSQ1),
		float64(len(dataSQ0)-len(dataSQ1))/float64(len(dataSQ0))*100)
}

func TestASDUSQ1Parsing(t *testing.T) {
	commonAddr := uint16(1)
	baseIOA := uint32(10)
	elements := make([][]byte, 5)
	for i := 0; i < 5; i++ {
		siq := byte(i & 0x01)
		siq |= 0x10
		elements[i] = []byte{siq}
	}

	dataSQ1 := BuildMSPNA1SQ(commonAddr, CauseInterrogated, baseIOA, elements)

	asdu, err := ParseASDU(dataSQ1)
	if err != nil {
		t.Fatalf("ParseASDU error: %v", err)
	}

	if !asdu.SQ {
		t.Error("SQ should be true")
	}
	if asdu.NumObj != 5 {
		t.Errorf("NumObj should be 5, got %d", asdu.NumObj)
	}
	if len(asdu.InformationObjects) != 5 {
		t.Errorf("Should have 5 objects, got %d", len(asdu.InformationObjects))
	}

	t.Logf("Parsed SQ=1 ASDU: Type=%s SQ=%v NumObj=%d",
		asdu.TypeName(), asdu.SQ, asdu.NumObj)
	for i, obj := range asdu.InformationObjects {
		expectedIOA := baseIOA + uint32(i)
		if obj.IOA != expectedIOA {
			t.Errorf("Object %d IOA wrong: expected %d, got %d", i, expectedIOA, obj.IOA)
		}
		t.Logf("  Obj[%d] IOA=%d Elements=% X", i, obj.IOA, obj.Elements)
	}

	t.Log("SQ=1 mode (Sequence) advantages:")
	t.Log("  - IOA (Information Object Address) sent ONLY ONCE")
	t.Log("  - Subsequent objects: IOA = baseIOA + index")
	t.Log("  - Saves 3 bytes per object after the first")
	t.Log("  - Ideal for contiguous address ranges")
}

func TestFileCallBuildParse(t *testing.T) {
	commonAddr := uint16(1)
	fc := FileCall{
		Service:     FileServiceCallFile,
		FileID:      100,
		SectionID:   0,
		Offset:      0,
		NumElements: 5,
	}

	data := BuildFSCNA1(commonAddr, fc)
	asdu, err := ParseASDU(data)
	if err != nil {
		t.Fatalf("ParseASDU error: %v", err)
	}

	if asdu.TypeID != ASDU_F_SC_NA_1 {
		t.Errorf("TypeID wrong: expected %d, got %d", ASDU_F_SC_NA_1, asdu.TypeID)
	}
	if asdu.CommonAddr != commonAddr {
		t.Errorf("CommonAddr wrong: expected %d, got %d", commonAddr, asdu.CommonAddr)
	}

	parsed, err := ParseFileCall(asdu.InformationObjects[0])
	if err != nil {
		t.Fatalf("ParseFileCall error: %v", err)
	}

	if parsed.Service != fc.Service {
		t.Errorf("Service wrong: expected %v, got %v", fc.Service, parsed.Service)
	}
	if parsed.FileID != fc.FileID {
		t.Errorf("FileID wrong: expected %d, got %d", fc.FileID, parsed.FileID)
	}
	if parsed.NumElements != fc.NumElements {
		t.Errorf("NumElements wrong: expected %d, got %d", fc.NumElements, parsed.NumElements)
	}

	t.Logf("FileCall: Service=%s FileID=%d Offset=%d NumElements=%d",
		parsed.Service, parsed.FileID, parsed.Offset, parsed.NumElements)
}

func TestFileReadyBuildParse(t *testing.T) {
	commonAddr := uint16(1)
	now := NowCP56Time2a()
	fr := FileReady{
		Filename:  "events.log",
		FileID:    1,
		Size:      1024,
		ReadyTime: now,
		LFD:       true,
	}

	data := BuildFFRNA1(commonAddr, fr)
	asdu, err := ParseASDU(data)
	if err != nil {
		t.Fatalf("ParseASDU error: %v", err)
	}

	if asdu.TypeID != ASDU_F_FR_NA_1 {
		t.Errorf("TypeID wrong: expected %d, got %d", ASDU_F_FR_NA_1, asdu.TypeID)
	}

	parsed, err := ParseFileReady(asdu.InformationObjects[0])
	if err != nil {
		t.Fatalf("ParseFileReady error: %v", err)
	}

	if parsed.Filename != fr.Filename {
		t.Errorf("Filename wrong: expected %s, got %s", fr.Filename, parsed.Filename)
	}
	if parsed.FileID != fr.FileID {
		t.Errorf("FileID wrong: expected %d, got %d", fr.FileID, parsed.FileID)
	}
	if parsed.Size != fr.Size {
		t.Errorf("Size wrong: expected %d, got %d", fr.Size, parsed.Size)
	}
	if parsed.LFD != fr.LFD {
		t.Errorf("LFD wrong: expected %v, got %v", fr.LFD, parsed.LFD)
	}

	t.Logf("FileReady: Filename=%s FileID=%d Size=%d LFD=%v",
		parsed.Filename, parsed.FileID, parsed.Size, parsed.LFD)
}

func TestFileSegmentBuildParse(t *testing.T) {
	commonAddr := uint16(1)
	testData := []byte("Hello, IEC 104 File Transfer! This is a test file segment.")
	fsg := FileSegment{
		FileID:    1,
		SectionID: 0,
		Offset:    0,
		Data:      testData,
	}

	data := BuildFSGNA1(commonAddr, fsg)
	asdu, err := ParseASDU(data)
	if err != nil {
		t.Fatalf("ParseASDU error: %v", err)
	}

	if asdu.TypeID != ASDU_F_SG_NA_1 {
		t.Errorf("TypeID wrong: expected %d, got %d", ASDU_F_SG_NA_1, asdu.TypeID)
	}

	parsed, err := ParseFileSegment(asdu.InformationObjects[0])
	if err != nil {
		t.Fatalf("ParseFileSegment error: %v", err)
	}

	if parsed.FileID != fsg.FileID {
		t.Errorf("FileID wrong: expected %d, got %d", fsg.FileID, parsed.FileID)
	}
	if parsed.SectionID != fsg.SectionID {
		t.Errorf("SectionID wrong: expected %d, got %d", fsg.SectionID, parsed.SectionID)
	}
	if len(parsed.Data) != len(fsg.Data) {
		t.Errorf("Data length wrong: expected %d, got %d", len(fsg.Data), len(parsed.Data))
	}
	for i := range testData {
		if parsed.Data[i] != testData[i] {
			t.Errorf("Data mismatch at byte %d: expected %02X, got %02X", i, testData[i], parsed.Data[i])
			break
		}
	}

	t.Logf("FileSegment: FileID=%d SectionID=%d Offset=%d DataLen=%d",
		parsed.FileID, parsed.SectionID, parsed.Offset, len(parsed.Data))
	t.Logf("Data preview: %s", string(parsed.Data[:30]))
}

func TestFileTransferTypes(t *testing.T) {
	t.Log("IEC 104 File Transfer ASDU Types (120-125):")
	types := []struct {
		ID   byte
		Name string
	}{
		{ASDU_F_FR_NA_1, "F_FR_NA_1 - File ready"},
		{ASDU_F_SR_NA_1, "F_SR_NA_1 - Section ready"},
		{ASDU_F_SC_NA_1, "F_SC_NA_1 - Call/select file/dir"},
		{ASDU_F_LS_NA_1, "F_LS_NA_1 - Last section"},
		{ASDU_F_AF_NA_1, "F_AF_NA_1 - Ack file/section"},
		{ASDU_F_SG_NA_1, "F_SG_NA_1 - Segment"},
	}

	for _, typ := range types {
		t.Logf("  Type %d: %s", typ.ID, typ.Name)
	}

	t.Log("File Services:")
	services := []FileService{
		FileServiceSelectDir, FileServiceSelectFile,
		FileServiceCallFile, FileServiceCallDir,
		FileServiceDeactivate, FileServiceDelete,
	}
	for _, s := range services {
		t.Logf("  %s (%d)", s, s)
	}
}

func TestChecksum(t *testing.T) {
	data1 := []byte("test data for checksum")
	data2 := []byte("test data for checksum")
	data3 := []byte("different data")

	crc1 := ComputeChecksum(data1)
	crc2 := ComputeChecksum(data2)
	crc3 := ComputeChecksum(data3)

	if crc1 != crc2 {
		t.Errorf("Identical data should have same checksum: %04X != %04X", crc1, crc2)
	}
	if crc1 == crc3 {
		t.Errorf("Different data should have different checksums: both %04X", crc1)
	}

	t.Logf("CRC-16 checksum of '%s' = 0x%04X", string(data1), crc1)
	t.Logf("CRC-16 of same data = 0x%04X", crc2)
	t.Logf("CRC-16 of '%s' = 0x%04X", string(data3), crc3)
}

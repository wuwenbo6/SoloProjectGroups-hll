package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
)

type FileService uint8

const (
	FileServiceSelectDir  FileService = 1
	FileServiceSelectFile FileService = 2
	FileServiceCallFile   FileService = 3
	FileServiceCallDir    FileService = 4
	FileServiceDeactivate FileService = 5
	FileServiceDelete     FileService = 6
)

type FileACK uint8

const (
	FileACKOK            FileACK = 0
	FileACKNOK           FileACK = 1
	FileACKFileNotFound  FileACK = 2
	FileACKUnavailable   FileACK = 3
	FileACKNotUsed       FileACK = 4
	FileACKSectionError  FileACK = 5
	FileACKUserAbort     FileACK = 6
	FileACKTransferAbort FileACK = 7
)

type FileDescriptor struct {
	Filename     string
	FileID       uint16
	SectionID    uint8
	Size         uint32
	CreationTime CP56Time2a
	Status       uint8
}

type FileReady struct {
	Filename  string
	FileID    uint16
	Size      uint32
	ReadyTime CP56Time2a
	ReadyQual uint8
	Negative  bool
	LFD       bool
	CA        uint8
}

type FileSectionReady struct {
	FileID    uint16
	SectionID uint8
	DataLen   uint16
	ReadyTime CP56Time2a
	ReadyQual uint8
	Negative  bool
	LFD       bool
	CA        uint8
}

type FileCall struct {
	Service     FileService
	FileID      uint16
	SectionID   uint8
	Offset      uint32
	NumElements uint16
}

type FileLastSection struct {
	FileID    uint16
	SectionID uint8
	DataLen   uint16
	Checksum  uint16
	TimeLast  CP56Time2a
}

type FileAck struct {
	Status    FileACK
	FileID    uint16
	SectionID uint8
	ACKQual   uint8
}

type FileSegment struct {
	FileID    uint16
	SectionID uint8
	Offset    uint16
	Data      []byte
}

func (s FileService) String() string {
	switch s {
	case FileServiceSelectDir:
		return "SelectDir"
	case FileServiceSelectFile:
		return "SelectFile"
	case FileServiceCallFile:
		return "CallFile"
	case FileServiceCallDir:
		return "CallDir"
	case FileServiceDeactivate:
		return "Deactivate"
	case FileServiceDelete:
		return "Delete"
	default:
		return fmt.Sprintf("Service(%d)", s)
	}
}

func (a FileACK) String() string {
	switch a {
	case FileACKOK:
		return "OK"
	case FileACKNOK:
		return "NOK"
	case FileACKFileNotFound:
		return "FileNotFound"
	case FileACKUnavailable:
		return "Unavailable"
	case FileACKSectionError:
		return "SectionError"
	case FileACKUserAbort:
		return "UserAbort"
	case FileACKTransferAbort:
		return "TransferAbort"
	default:
		return fmt.Sprintf("ACK(%d)", a)
	}
}

func BuildFFRNA1(commonAddr uint16, fr FileReady) []byte {
	nameBytes := []byte(fr.Filename)
	if len(nameBytes) > 255 {
		nameBytes = nameBytes[:255]
	}

	buf := make([]byte, 0, 32+len(nameBytes))
	buf = append(buf, byte(len(nameBytes)))
	buf = append(buf, nameBytes...)

	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fr.FileID)
	buf = append(buf, fileIDBuf...)

	sizeBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(sizeBuf, fr.Size)
	buf = append(buf, sizeBuf...)

	buf = append(buf, fr.ReadyTime.Marshal()...)

	qual := fr.ReadyQual & 0x1F
	if fr.Negative {
		qual |= 0x20
	}
	if fr.LFD {
		qual |= 0x40
	}
	qual |= (fr.CA & 0x01) << 7
	buf = append(buf, qual)

	asdu := &ASDU{
		TypeID:     ASDU_F_FR_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileReady(obj InformationObject) (*FileReady, error) {
	data := obj.Elements
	if len(data) < 1 {
		return nil, errors.New("file ready data too short")
	}

	nameLen := int(data[0])
	if len(data) < 1+nameLen+2+4+7+1 {
		return nil, errors.New("file ready data truncated")
	}

	offset := 1
	filename := string(data[offset : offset+nameLen])
	offset += nameLen

	fileID := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	size := binary.LittleEndian.Uint32(data[offset : offset+4])
	offset += 4

	readyTime := ParseCP56Time2a(data[offset : offset+7])
	offset += 7

	qual := data[offset]

	return &FileReady{
		Filename:  filename,
		FileID:    fileID,
		Size:      size,
		ReadyTime: readyTime,
		ReadyQual: qual & 0x1F,
		Negative:  (qual & 0x20) != 0,
		LFD:       (qual & 0x40) != 0,
		CA:        (qual >> 7) & 0x01,
	}, nil
}

func BuildFSRNA1(commonAddr uint16, fsr FileSectionReady) []byte {
	buf := make([]byte, 0, 16)
	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fsr.FileID)
	buf = append(buf, fileIDBuf...)

	buf = append(buf, fsr.SectionID)

	lenBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(lenBuf, fsr.DataLen)
	buf = append(buf, lenBuf...)

	buf = append(buf, fsr.ReadyTime.Marshal()...)

	qual := fsr.ReadyQual & 0x1F
	if fsr.Negative {
		qual |= 0x20
	}
	if fsr.LFD {
		qual |= 0x40
	}
	qual |= (fsr.CA & 0x01) << 7
	buf = append(buf, qual)

	asdu := &ASDU{
		TypeID:     ASDU_F_SR_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileSectionReady(obj InformationObject) (*FileSectionReady, error) {
	data := obj.Elements
	if len(data) < 2+1+2+7+1 {
		return nil, errors.New("file section ready data too short")
	}

	offset := 0
	fileID := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	sectionID := data[offset]
	offset++

	dataLen := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	readyTime := ParseCP56Time2a(data[offset : offset+7])
	offset += 7

	qual := data[offset]

	return &FileSectionReady{
		FileID:    fileID,
		SectionID: sectionID,
		DataLen:   dataLen,
		ReadyTime: readyTime,
		ReadyQual: qual & 0x1F,
		Negative:  (qual & 0x20) != 0,
		LFD:       (qual & 0x40) != 0,
		CA:        (qual >> 7) & 0x01,
	}, nil
}

func BuildFSCNA1(commonAddr uint16, fc FileCall) []byte {
	buf := make([]byte, 0, 16)
	buf = append(buf, byte(fc.Service))

	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fc.FileID)
	buf = append(buf, fileIDBuf...)

	buf = append(buf, fc.SectionID)

	offsetBuf := make([]byte, 4)
	binary.LittleEndian.PutUint32(offsetBuf, fc.Offset)
	buf = append(buf, offsetBuf...)

	numBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(numBuf, fc.NumElements)
	buf = append(buf, numBuf...)

	asdu := &ASDU{
		TypeID:     ASDU_F_SC_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileCall(obj InformationObject) (*FileCall, error) {
	data := obj.Elements
	if len(data) < 1+2+1+4+2 {
		return nil, errors.New("file call data too short")
	}

	offset := 0
	service := FileService(data[offset])
	offset++

	fileID := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	sectionID := data[offset]
	offset++

	fileOffset := binary.LittleEndian.Uint32(data[offset : offset+4])
	offset += 4

	numElements := binary.LittleEndian.Uint16(data[offset : offset+2])

	return &FileCall{
		Service:     service,
		FileID:      fileID,
		SectionID:   sectionID,
		Offset:      fileOffset,
		NumElements: numElements,
	}, nil
}

func BuildFLSNA1(commonAddr uint16, fls FileLastSection) []byte {
	buf := make([]byte, 0, 16)
	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fls.FileID)
	buf = append(buf, fileIDBuf...)

	buf = append(buf, fls.SectionID)

	lenBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(lenBuf, fls.DataLen)
	buf = append(buf, lenBuf...)

	crcBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(crcBuf, fls.Checksum)
	buf = append(buf, crcBuf...)

	buf = append(buf, fls.TimeLast.Marshal()...)

	asdu := &ASDU{
		TypeID:     ASDU_F_LS_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileLastSection(obj InformationObject) (*FileLastSection, error) {
	data := obj.Elements
	if len(data) < 2+1+2+2+7 {
		return nil, errors.New("file last section data too short")
	}

	offset := 0
	fileID := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	sectionID := data[offset]
	offset++

	dataLen := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	checksum := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	timeLast := ParseCP56Time2a(data[offset : offset+7])

	return &FileLastSection{
		FileID:    fileID,
		SectionID: sectionID,
		DataLen:   dataLen,
		Checksum:  checksum,
		TimeLast:  timeLast,
	}, nil
}

func BuildFAFNA1(commonAddr uint16, fa FileAck) []byte {
	buf := make([]byte, 0, 6)
	buf = append(buf, byte(fa.Status))

	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fa.FileID)
	buf = append(buf, fileIDBuf...)

	buf = append(buf, fa.SectionID)
	buf = append(buf, fa.ACKQual)

	asdu := &ASDU{
		TypeID:     ASDU_F_AF_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileAck(obj InformationObject) (*FileAck, error) {
	data := obj.Elements
	if len(data) < 1+2+1+1 {
		return nil, errors.New("file ack data too short")
	}

	return &FileAck{
		Status:    FileACK(data[0]),
		FileID:    binary.LittleEndian.Uint16(data[1:3]),
		SectionID: data[3],
		ACKQual:   data[4],
	}, nil
}

func BuildFSGNA1(commonAddr uint16, fs FileSegment) []byte {
	if len(fs.Data) > 200 {
		fs.Data = fs.Data[:200]
	}

	buf := make([]byte, 0, 8+len(fs.Data))
	fileIDBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(fileIDBuf, fs.FileID)
	buf = append(buf, fileIDBuf...)

	buf = append(buf, fs.SectionID)

	offBuf := make([]byte, 2)
	binary.LittleEndian.PutUint16(offBuf, fs.Offset)
	buf = append(buf, offBuf...)

	buf = append(buf, byte(len(fs.Data)))
	buf = append(buf, fs.Data...)

	asdu := &ASDU{
		TypeID:     ASDU_F_SG_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseFileTransfer,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: 0, Elements: buf},
		},
	}
	return asdu.Marshal()
}

func ParseFileSegment(obj InformationObject) (*FileSegment, error) {
	data := obj.Elements
	if len(data) < 2+1+2+1 {
		return nil, errors.New("file segment data too short")
	}

	offset := 0
	fileID := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	sectionID := data[offset]
	offset++

	segOffset := binary.LittleEndian.Uint16(data[offset : offset+2])
	offset += 2

	dataLen := int(data[offset])
	offset++

	if len(data) < offset+dataLen {
		return nil, errors.New("file segment data truncated")
	}

	segData := make([]byte, dataLen)
	copy(segData, data[offset:offset+dataLen])

	return &FileSegment{
		FileID:    fileID,
		SectionID: sectionID,
		Offset:    segOffset,
		Data:      segData,
	}, nil
}

func FileTypeName(typeID byte) string {
	switch typeID {
	case ASDU_F_FR_NA_1:
		return "F_FR_NA_1 (FileReady)"
	case ASDU_F_SR_NA_1:
		return "F_SR_NA_1 (FileSectionReady)"
	case ASDU_F_SC_NA_1:
		return "F_SC_NA_1 (FileCall)"
	case ASDU_F_LS_NA_1:
		return "F_LS_NA_1 (FileLastSection)"
	case ASDU_F_AF_NA_1:
		return "F_AF_NA_1 (FileAck)"
	case ASDU_F_SG_NA_1:
		return "F_SG_NA_1 (FileSegment)"
	default:
		return fmt.Sprintf("Unknown(0x%02X)", typeID)
	}
}

func ComputeChecksum(data []byte) uint16 {
	var sum uint16
	for _, b := range data {
		sum += uint16(b)
	}
	return ^sum + 1
}

func ValidateFilename(name string) bool {
	if len(name) == 0 || len(name) > 255 {
		return false
	}
	if strings.ContainsAny(name, "/\\:*?\"<>|") {
		return false
	}
	return true
}

package protocol

import (
	"encoding/binary"
	"fmt"
)

type FrameType int

const (
	FrameI FrameType = iota
	FrameS
	FrameU
)

type UFrameType int

const (
	UStartDTACT UFrameType = iota
	UStartDTCON
	UStopDTACT
	UStopDTCON
	UTestFRACT
	UTestFRCON
)

type APCI struct {
	Start     byte
	Length    byte
	FrameType FrameType
	SendSeq   uint16
	RecvSeq   uint16
	UType     UFrameType
	Raw       []byte
}

func ParseAPCI(data []byte) (*APCI, error) {
	if len(data) < APCIHeaderSize {
		return nil, fmt.Errorf("frame too short: %d", len(data))
	}
	if data[0] != StartByte {
		return nil, fmt.Errorf("invalid start byte: 0x%02X", data[0])
	}
	apci := &APCI{
		Start:  data[0],
		Length: data[1],
		Raw:    data[:APCIHeaderSize],
	}
	ctrl1 := data[2]
	ctrl2 := data[3]
	ctrl3 := data[4]
	_ = ctrl3

	if ctrl1&0x01 == 0 {
		apci.FrameType = FrameI
		apci.SendSeq = binary.LittleEndian.Uint16([]byte{ctrl1 & 0xFE, ctrl2}) >> 1
		apci.RecvSeq = binary.LittleEndian.Uint16([]byte{data[4], data[5]}) >> 1
	} else if ctrl1&0x03 == 0x01 {
		apci.FrameType = FrameS
		apci.RecvSeq = binary.LittleEndian.Uint16([]byte{data[4], data[5]}) >> 1
	} else {
		apci.FrameType = FrameU
		switch ctrl1 & 0xFC {
		case UFrameStartDTACT:
			apci.UType = UStartDTACT
		case UFrameStartDTCON:
			apci.UType = UStartDTCON
		case UFrameStopDTACT:
			apci.UType = UStopDTACT
		case UFrameStopDTCON:
			apci.UType = UStopDTCON
		case UFrameTestFRACT:
			apci.UType = UTestFRACT
		case UFrameTestFRCON:
			apci.UType = UTestFRCON
		}
	}
	return apci, nil
}

func BuildUFrame(uType UFrameType) []byte {
	var ctrl1 byte
	switch uType {
	case UStartDTACT:
		ctrl1 = UFrameStartDTACT
	case UStartDTCON:
		ctrl1 = UFrameStartDTCON
	case UStopDTACT:
		ctrl1 = UFrameStopDTACT
	case UStopDTCON:
		ctrl1 = UFrameStopDTCON
	case UTestFRACT:
		ctrl1 = UFrameTestFRACT
	case UTestFRCON:
		ctrl1 = UFrameTestFRCON
	}
	return []byte{StartByte, 4, ctrl1, 0, 0, 0}
}

func BuildSFrame(recvSeq uint16) []byte {
	rs := recvSeq << 1
	return []byte{StartByte, 4, 0x01, 0x00, byte(rs & 0xFF), byte((rs >> 8) & 0xFF)}
}

func BuildIFrame(sendSeq, recvSeq uint16, asduData []byte) []byte {
	ss := sendSeq << 1
	rs := recvSeq << 1
	length := byte(2 + 4 + len(asduData))
	buf := make([]byte, 2+4+len(asduData))
	buf[0] = StartByte
	buf[1] = length
	buf[2] = byte(ss & 0xFF)
	buf[3] = byte((ss >> 8) & 0xFF)
	buf[4] = byte(rs & 0xFF)
	buf[5] = byte((rs >> 8) & 0xFF)
	copy(buf[6:], asduData)
	return buf
}

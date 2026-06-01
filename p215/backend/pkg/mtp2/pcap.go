package mtp2

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"time"
)

const (
	pcapMagic    uint32 = 0xa1b2c3d4
	pcapVersionMajor uint16 = 2
	pcapVersionMinor uint16 = 4
	pcapSnaplen  uint32 = 65535
	DLT_MTP2     uint32 = 140
)

type PcapPacket struct {
	Timestamp time.Time
	Data      []byte
}

type PcapWriter struct {
	packets []PcapPacket
}

func NewPcapWriter() *PcapWriter {
	return &PcapWriter{
		packets: make([]PcapPacket, 0),
	}
}

func (pw *PcapWriter) AddPacket(timestamp int64, hexData string) {
	data, err := hex.DecodeString(hexData)
	if err != nil || len(data) == 0 {
		return
	}

	ts := time.UnixMilli(timestamp)

	pw.packets = append(pw.packets, PcapPacket{
		Timestamp: ts,
		Data:      data,
	})
}

func (pw *PcapWriter) Reset() {
	pw.packets = pw.packets[:0]
}

func (pw *PcapWriter) PacketCount() int {
	return len(pw.packets)
}

func (pw *PcapWriter) Write() ([]byte, error) {
	buf := new(bytes.Buffer)

	if err := binary.Write(buf, binary.LittleEndian, pcapMagic); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, pcapVersionMajor); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, pcapVersionMinor); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, int32(0)); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, uint32(0)); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, pcapSnaplen); err != nil {
		return nil, err
	}
	if err := binary.Write(buf, binary.LittleEndian, DLT_MTP2); err != nil {
		return nil, err
	}

	for _, pkt := range pw.packets {
		tsSec := uint32(pkt.Timestamp.Unix())
		tsUsec := uint32(pkt.Timestamp.Nanosecond() / 1000)
		inclLen := uint32(len(pkt.Data))
		origLen := inclLen

		if err := binary.Write(buf, binary.LittleEndian, tsSec); err != nil {
			return nil, err
		}
		if err := binary.Write(buf, binary.LittleEndian, tsUsec); err != nil {
			return nil, err
		}
		if err := binary.Write(buf, binary.LittleEndian, inclLen); err != nil {
			return nil, err
		}
		if err := binary.Write(buf, binary.LittleEndian, origLen); err != nil {
			return nil, err
		}

		if _, err := buf.Write(pkt.Data); err != nil {
			return nil, err
		}
	}

	return buf.Bytes(), nil
}

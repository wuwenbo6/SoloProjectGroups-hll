package rtp

import (
	"encoding/binary"
	"math/rand"
)

type AACPacketizer struct {
	SSRC        uint32
	SequenceNum uint16
	Timestamp   uint32
	PayloadType uint8
	SampleRate  uint32
	Channels    uint16
}

func NewAACPacketizer(sampleRate uint32, channels uint16, ssrc ...uint32) *AACPacketizer {
	var s uint32
	if len(ssrc) > 0 {
		s = ssrc[0]
	} else {
		s = rand.Uint32()
	}

	return &AACPacketizer{
		SSRC:        s,
		SequenceNum: uint16(rand.Uint32()),
		Timestamp:   rand.Uint32(),
		PayloadType: 97,
		SampleRate:  sampleRate,
		Channels:    channels,
	}
}

func (p *AACPacketizer) Packetize(adts []byte, timestampInc uint32) [][]byte {
	p.Timestamp += timestampInc
	p.SequenceNum++

	var packets [][]byte

	if len(adts) <= MaxPayloadSize-4 {
		packet := make([]byte, RTPHeaderSize+4+len(adts))
		p.writeHeader(packet, true)
		p.writeAUHeader(packet[RTPHeaderSize:], len(adts))
		copy(packet[RTPHeaderSize+4:], adts)
		packets = append(packets, packet)
	} else {
		offset := 0
		for offset < len(adts) {
			chunkSize := len(adts) - offset
			if chunkSize > MaxPayloadSize-4 {
				chunkSize = MaxPayloadSize - 4
			}

			marker := offset+chunkSize >= len(adts)
			packet := make([]byte, RTPHeaderSize+4+chunkSize)
			p.writeHeader(packet, marker)
			p.writeAUHeader(packet[RTPHeaderSize:], chunkSize)
			copy(packet[RTPHeaderSize+4:], adts[offset:offset+chunkSize])
			packets = append(packets, packet)

			offset += chunkSize
			if !marker {
				p.SequenceNum++
			}
		}
	}

	return packets
}

func (p *AACPacketizer) writeAUHeader(packet []byte, auSize int) {
	auHeader := uint16(auSize<<3) | 0x0000
	binary.BigEndian.PutUint16(packet[0:2], auHeader)
	binary.BigEndian.PutUint16(packet[2:4], 0)
}

func (p *AACPacketizer) writeHeader(packet []byte, marker bool) {
	version := 2
	padding := 0
	extension := 0
	csrcCount := 0

	firstByte := byte(version<<6) | byte(padding<<5) | byte(extension<<4) | byte(csrcCount)
	packet[0] = firstByte

	pt := p.PayloadType & 0x7F
	if marker {
		pt |= 0x80
	}
	packet[1] = pt

	binary.BigEndian.PutUint16(packet[2:4], p.SequenceNum)
	binary.BigEndian.PutUint32(packet[4:8], p.Timestamp)
	binary.BigEndian.PutUint32(packet[8:12], p.SSRC)
}

func (p *AACPacketizer) ResetTimestamp() {
	p.Timestamp = rand.Uint32()
}

func ConvertADTStoMPEG4Generic(adts []byte) []byte {
	if len(adts) < 7 {
		return adts
	}

	headerSize := 7
	if adts[1]&0x01 != 0 {
		headerSize = 9
	}

	if len(adts) <= headerSize {
		return nil
	}

	return adts[headerSize:]
}

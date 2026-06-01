package rtp

import (
	"encoding/binary"
	"math/rand"
)

const (
	RTPHeaderSize    = 12
	MaxPayloadSize   = 1400
	H264NALUTypeMask = 0x1F
)

type Packet struct {
	Header  []byte
	Payload []byte
}

type H264Packetizer struct {
	SSRC        uint32
	SequenceNum uint16
	Timestamp   uint32
	PayloadType uint8
}

func NewH264Packetizer(ssrc ...uint32) *H264Packetizer {
	var s uint32
	if len(ssrc) > 0 {
		s = ssrc[0]
	} else {
		s = rand.Uint32()
	}

	return &H264Packetizer{
		SSRC:        s,
		SequenceNum: uint16(rand.Uint32()),
		Timestamp:   rand.Uint32(),
		PayloadType: 96,
	}
}

func (p *H264Packetizer) Packetize(nalu []byte, timestampInc uint32) [][]byte {
	if timestampInc > 0 {
		p.Timestamp += timestampInc
	}

	var packets [][]byte

	if len(nalu) <= MaxPayloadSize {
		p.SequenceNum++
		packet := make([]byte, RTPHeaderSize+len(nalu))
		p.writeHeader(packet, true)
		copy(packet[RTPHeaderSize:], nalu)
		packets = append(packets, packet)
	} else {
		packets = p.fragmentNALU(nalu)
	}

	return packets
}

func (p *H264Packetizer) fragmentNALU(nalu []byte) [][]byte {
	var packets [][]byte

	naluType := nalu[0] & H264NALUTypeMask
	forbiddenZero := nalu[0] & 0x80
	nri := nalu[0] & 0x60

	maxDataSize := MaxPayloadSize - 2
	data := nalu[1:]
	numPackets := (len(data) + maxDataSize - 1) / maxDataSize

	for i := 0; i < numPackets; i++ {
		start := i * maxDataSize
		end := start + maxDataSize
		if end > len(data) {
			end = len(data)
		}

		fragmentData := data[start:end]

		headerByte := byte(28)
		headerByte |= forbiddenZero
		headerByte |= nri

		fuIndicator := headerByte

		fuHeader := naluType
		if i == 0 {
			fuHeader |= 0x80
		}
		if i == numPackets-1 {
			fuHeader |= 0x40
		}

		marker := (i == numPackets-1)

		packet := make([]byte, RTPHeaderSize+2+len(fragmentData))
		p.writeHeader(packet, marker)

		packet[RTPHeaderSize] = fuIndicator
		packet[RTPHeaderSize+1] = fuHeader
		copy(packet[RTPHeaderSize+2:], fragmentData)

		packets = append(packets, packet)

		if i < numPackets-1 {
			p.SequenceNum++
		}
	}

	return packets
}

func (p *H264Packetizer) writeHeader(packet []byte, marker bool) {
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

func (p *H264Packetizer) ResetTimestamp() {
	p.Timestamp = rand.Uint32()
}

func ParseRTPPacket(data []byte) (seq uint16, timestamp uint32, ssrc uint32, payload []byte) {
	if len(data) < RTPHeaderSize {
		return 0, 0, 0, nil
	}

	seq = binary.BigEndian.Uint16(data[2:4])
	timestamp = binary.BigEndian.Uint32(data[4:8])
	ssrc = binary.BigEndian.Uint32(data[8:12])
	payload = data[RTPHeaderSize:]

	return seq, timestamp, ssrc, payload
}

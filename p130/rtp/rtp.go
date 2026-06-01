package rtp

import (
	"encoding/binary"
	"fmt"
	"math"
	"sync"
	"time"

	"sip-analyzer/database"
)

type RTPHeader struct {
	Version          uint8
	Padding          bool
	Extension        bool
	CSRCCount        uint8
	Marker           bool
	PayloadType      uint8
	SequenceNumber   uint16
	Timestamp        uint32
	SSRC             uint32
	CSRC             []uint32
	ExtensionProfile uint16
	ExtensionLength  uint16
	HeaderLength     int
}

type RTPPacket struct {
	Header      *RTPHeader
	Payload     []byte
	PayloadSize int
	Raw         []byte
}

type StreamState struct {
	CallID        string
	SSRC          uint32
	SourceIP      string
	DestIP        string
	SourcePort    int
	DestPort      int
	PayloadType   uint8
	Codec         string
	FirstSeq      uint16
	LastSeq       uint16
	Expected      uint64
	Received      uint64
	Lost          uint64
	LastTimestamp uint32
	LastArrival   float64
	InterarrivalJitter float64
	MaxJitter     float64
	TotalJitter   float64
	JitterCount   int64
	StartTime     time.Time
	EndTime       time.Time
	mu            sync.Mutex
}

type Analyzer struct {
	streams map[uint32]*StreamState
	db      *database.Database
	mu      sync.Mutex
}

var rtpCodecs = map[uint8]string{
	0:  "PCMU",
	3:  "GSM",
	4:  "G723",
	8:  "PCMA",
	9:  "G722",
	10: "L16",
	11: "L16",
	13: "CN",
	18: "G729",
	34: "H263",
	96: "H264",
	97: "H264",
	98: "H265",
	101: "telephone-event",
}

func NewAnalyzer(db *database.Database) *Analyzer {
	return &Analyzer{
		streams: make(map[uint32]*StreamState),
		db:      db,
	}
}

func ParseRTP(data []byte) (*RTPPacket, error) {
	if len(data) < 12 {
		return nil, fmt.Errorf("RTP packet too short: %d bytes", len(data))
	}

	packet := &RTPPacket{Raw: data}
	h := &RTPHeader{}

	h.Version = (data[0] >> 6) & 0x03
	h.Padding = (data[0]>>5)&0x01 == 1
	h.Extension = (data[0]>>4)&0x01 == 1
	h.CSRCCount = data[0] & 0x0F

	h.Marker = (data[1]>>7)&0x01 == 1
	h.PayloadType = data[1] & 0x7F

	h.SequenceNumber = binary.BigEndian.Uint16(data[2:4])
	h.Timestamp = binary.BigEndian.Uint32(data[4:8])
	h.SSRC = binary.BigEndian.Uint32(data[8:12])

	offset := 12

	if h.CSRCCount > 0 {
		if len(data) < offset+int(h.CSRCCount)*4 {
			return nil, fmt.Errorf("RTP packet too short for CSRC")
		}
		h.CSRC = make([]uint32, h.CSRCCount)
		for i := 0; i < int(h.CSRCCount); i++ {
			h.CSRC[i] = binary.BigEndian.Uint32(data[offset : offset+4])
			offset += 4
		}
	}

	if h.Extension {
		if len(data) < offset+4 {
			return nil, fmt.Errorf("RTP packet too short for extension header")
		}
		h.ExtensionProfile = binary.BigEndian.Uint16(data[offset : offset+2])
		h.ExtensionLength = binary.BigEndian.Uint16(data[offset+2 : offset+4])
		offset += 4
		offset += int(h.ExtensionLength) * 4
	}

	h.HeaderLength = offset
	packet.Header = h
	packet.Payload = data[offset:]
	packet.PayloadSize = len(packet.Payload)

	if h.Version != 2 {
		return nil, fmt.Errorf("invalid RTP version: %d", h.Version)
	}

	return packet, nil
}

func GetCodecName(pt uint8) string {
	if name, ok := rtpCodecs[pt]; ok {
		return name
	}
	return fmt.Sprintf("Unknown(%d)", pt)
}

func (a *Analyzer) ProcessPacket(callID, srcIP, dstIP string, srcPort, dstPort int, data []byte, arrivalTime time.Time) error {
	packet, err := ParseRTP(data)
	if err != nil {
		return fmt.Errorf("parse RTP: %w", err)
	}

	a.mu.Lock()
	state, exists := a.streams[packet.Header.SSRC]
	if !exists {
		state = &StreamState{
			CallID:      callID,
			SSRC:        packet.Header.SSRC,
			SourceIP:    srcIP,
			DestIP:      dstIP,
			SourcePort:  srcPort,
			DestPort:    dstPort,
			PayloadType: packet.Header.PayloadType,
			Codec:       GetCodecName(packet.Header.PayloadType),
			FirstSeq:    packet.Header.SequenceNumber,
			LastSeq:     packet.Header.SequenceNumber,
			StartTime:   arrivalTime,
			LastArrival: float64(arrivalTime.UnixNano()) / 1000000.0,
		}
		a.streams[packet.Header.SSRC] = state
	}
	a.mu.Unlock()

	state.mu.Lock()
	defer state.mu.Unlock()

	lastSeq := state.LastSeq
	seqDiff := packet.Header.SequenceNumber - lastSeq

	if seqDiff > 0 {
		for i := lastSeq + 1; i < packet.Header.SequenceNumber; i++ {
			report := &database.RTPReport{
				CallID:      callID,
				SSRC:        state.SSRC,
				SequenceNum: i,
				ArrivalTime: arrivalTime,
				IsLost:      true,
			}
			a.db.InsertRTPReport(report)
			state.Lost++
		}
	} else if seqDiff < 0 {
		if uint16(seqDiff+0xFFFF) < 0x8000 {
			for i := lastSeq + 1; i <= 0xFFFF; i++ {
				report := &database.RTPReport{
					CallID:      callID,
					SSRC:        state.SSRC,
					SequenceNum: i,
					ArrivalTime: arrivalTime,
					IsLost:      true,
				}
				a.db.InsertRTPReport(report)
				state.Lost++
			}
			for i := uint16(0); i < packet.Header.SequenceNumber; i++ {
				report := &database.RTPReport{
					CallID:      callID,
					SSRC:        state.SSRC,
					SequenceNum: i,
					ArrivalTime: arrivalTime,
					IsLost:      true,
				}
				a.db.InsertRTPReport(report)
				state.Lost++
			}
		} else {
			return fmt.Errorf("duplicate or out-of-order packet: seq=%d, last=%d",
				packet.Header.SequenceNumber, lastSeq)
		}
	}

	state.Expected++
	state.Received++
	state.LastSeq = packet.Header.SequenceNumber
	state.EndTime = arrivalTime

	arrivalMs := float64(arrivalTime.UnixNano()) / 1000000.0
	if state.LastTimestamp > 0 && state.LastArrival > 0 {
		tsDiff := float64(int32(packet.Header.Timestamp - state.LastTimestamp))
		sampleRate := getSampleRate(packet.Header.PayloadType)
		if sampleRate > 0 {
			tsDiffMs := tsDiff * 1000.0 / float64(sampleRate)
			arrivalDiffMs := arrivalMs - state.LastArrival
			D := arrivalDiffMs - tsDiffMs
			if D < 0 {
				D = -D
			}
			state.InterarrivalJitter += (D - state.InterarrivalJitter) / 16.0
			state.JitterCount++
			state.TotalJitter += state.InterarrivalJitter
			if state.InterarrivalJitter > state.MaxJitter {
				state.MaxJitter = state.InterarrivalJitter
			}
		}
	}

	state.LastTimestamp = packet.Header.Timestamp
	state.LastArrival = arrivalMs

	report := &database.RTPReport{
		CallID:      callID,
		SSRC:        state.SSRC,
		SequenceNum: packet.Header.SequenceNumber,
		Timestamp:   packet.Header.Timestamp,
		ArrivalTime: arrivalTime,
		Jitter:      state.InterarrivalJitter,
		IsLost:      false,
		PayloadSize: packet.PayloadSize,
	}
	a.db.InsertRTPReport(report)

	return a.updateStreamStats(state)
}

func (a *Analyzer) updateStreamStats(state *StreamState) error {
	totalExpected := state.Expected
	var lossRate float64
	if totalExpected > 0 {
		lossRate = float64(state.Lost) / float64(totalExpected) * 100
	}

	var avgJitter float64
	if state.JitterCount > 0 {
		avgJitter = state.TotalJitter / float64(state.JitterCount)
	}

	mos := calculateMOS(state.PayloadType, lossRate, avgJitter)

	duration := state.EndTime.Sub(state.StartTime).Milliseconds()

	stream := &database.RTPStream{
		CallID:       state.CallID,
		SSRC:         state.SSRC,
		SourceIP:     state.SourceIP,
		DestIP:       state.DestIP,
		SourcePort:   state.SourcePort,
		DestPort:     state.DestPort,
		PayloadType:  state.PayloadType,
		Codec:        state.Codec,
		TotalPackets: int(state.Received),
		LostPackets:  int(state.Lost),
		LossRate:     lossRate,
		MaxJitter:    state.MaxJitter,
		AvgJitter:    avgJitter,
		MOSScore:     mos,
		FirstSeq:     state.FirstSeq,
		LastSeq:      state.LastSeq,
		StartTime:    state.StartTime,
		EndTime:      state.EndTime,
		Duration:     duration,
	}

	return a.db.UpsertRTPStream(stream)
}

func getSampleRate(pt uint8) int {
	switch pt {
	case 0, 8, 3, 4, 18, 13, 101:
		return 8000
	case 9, 10:
		return 16000
	case 11:
		return 44100
	default:
		return 8000
	}
}

func calculateMOS(pt uint8, lossRate, jitterMs float64) float64 {
	baseMOS := getBaseMOS(pt)

	if lossRate >= 20 {
		return 1.0
	}

	lossFactor := 1.0 - (lossRate / 20.0)

	jitterFactor := 1.0
	if jitterMs > 10 {
		jitterFactor = 1.0 - ((jitterMs - 10) / 200.0)
		if jitterFactor < 0.3 {
			jitterFactor = 0.3
		}
	}

	mos := baseMOS * lossFactor * jitterFactor

	if mos < 1.0 {
		mos = 1.0
	}
	if mos > 5.0 {
		mos = 5.0
	}

	return math.Round(mos*100) / 100
}

func getBaseMOS(pt uint8) float64 {
	switch pt {
	case 0:
		return 4.4
	case 8:
		return 4.3
	case 9:
		return 4.5
	case 18:
		return 3.9
	case 3:
		return 3.5
	case 4:
		return 3.7
	case 101:
		return 4.0
	default:
		return 4.0
	}
}

func GetMOSRating(mos float64) string {
	switch {
	case mos >= 4.3:
		return "Excellent"
	case mos >= 4.0:
		return "Good"
	case mos >= 3.6:
		return "Fair"
	case mos >= 3.1:
		return "Poor"
	case mos >= 2.5:
		return "Bad"
	default:
		return "Very Bad"
	}
}

func (a *Analyzer) CleanupStream(ssrc uint32) {
	a.mu.Lock()
	delete(a.streams, ssrc)
	a.mu.Unlock()
}

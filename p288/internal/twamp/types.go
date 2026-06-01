package twamp

import (
	"encoding/binary"
	"fmt"
	"time"
)

const (
	TWAMPControlPort = 862
	TWAMPTestPort    = 863

	NTPOffset int64 = 2208988800

	ModeUnAuthenticated uint32 = 1 << 1
	ModeAuthenticated   uint32 = 1 << 2
	ModeEncrypted       uint32 = 1 << 3
	ModeAll             uint32 = ModeUnAuthenticated | ModeAuthenticated | ModeEncrypted

	DSCPDefault   uint8 = 0x00
	DSCPBE        uint8 = 0x00
	DSCPEF        uint8 = 0x2E
	DSCPAF11      uint8 = 0x0A
	DSCPAF12      uint8 = 0x0C
	DSCPAF13      uint8 = 0x0E
	DSCPAF21      uint8 = 0x12
	DSCPAF22      uint8 = 0x14
	DSCPAF23      uint8 = 0x16
	DSCPAF31      uint8 = 0x1A
	DSCPAF32      uint8 = 0x1C
	DSCPAF33      uint8 = 0x1E
	DSCPAF41      uint8 = 0x22
	DSCPAF42      uint8 = 0x24
	DSCPAF43      uint8 = 0x26
	DSCPCS0       uint8 = 0x00
	DSCPCS1       uint8 = 0x08
	DSCPCS2       uint8 = 0x10
	DSCPCS3       uint8 = 0x18
	DSCPCS4       uint8 = 0x20
	DSCPCS5       uint8 = 0x28
	DSCPCS6       uint8 = 0x30
	DSCPCS7       uint8 = 0x38
	DSCPVOICE     uint8 = 0xB8
	DSCPVIDEO     uint8 = 0x88
)

type ControlMessageType uint8

const (
	MsgServerGreeting   ControlMessageType = 1
	MsgSetupResponse  ControlMessageType = 2
	MsgStartSessions  ControlMessageType = 3
	MsgStartAck       ControlMessageType = 4
	MsgStopSessions   ControlMessageType = 5
	MsgSessionStart   ControlMessageType = 6
)

type ServerGreeting struct {
	Modes       uint32
	Challenge   [16]byte
	Salt        [16]byte
	Count       uint32
}

type SetupRequest struct {
	Mode        uint32
	KeyID       [80]byte
	Token       [64]byte
	ClientIV    [16]byte
}

type SetupResponse struct {
	Status      uint32
	ServerIV    [16]byte
}

type RequestSession struct {
	IPVN        uint8
	SenderPort    uint16
	ReceiverPort  uint16
}

type NTPTimestamp struct {
	Seconds  uint32
	Fraction uint32
}

type TestPacket struct {
	SequenceNumber uint32
	Timestamp      NTPTimestamp
	ErrorEstimate  uint16
	MBZ            uint16
	ReceiveTimestamp NTPTimestamp
	SenderSequence   uint32
	SenderTimestamp  NTPTimestamp
	SenderErrorEstimate uint16
	SenderMBZ        uint16
}

type Session struct {
	ID             string
	SenderAddr     string
	SenderPort     uint16
	ReceiverPort   uint16
	StartTime      time.Time
	Active         bool
	NegotiatedMode uint32
	DSCP           uint8
	Name           string
}

type SessionConfig struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	DSCP       uint8  `json:"dscp"`
	IntervalMs int    `json:"interval_ms"`
	Active     bool   `json:"active"`
}

type MeasurementResult struct {
	SessionID     string  `json:"session_id"`
	SessionName   string  `json:"session_name"`
	Sequence      uint32  `json:"sequence"`
	RTT           float64 `json:"rtt_ms"`
	OWDForward    float64 `json:"owd_forward_ms"`
	OWDBackward   float64 `json:"owd_backward_ms"`
	Jitter        float64 `json:"jitter_ms"`
	DSCP          uint8   `json:"dscp"`
	Timestamp     time.Time `json:"timestamp"`
}

type HistogramBin struct {
	Range   string  `json:"range"`
	Min     float64 `json:"min"`
	Max     float64 `json:"max"`
	Count   int     `json:"count"`
	Percent float64 `json:"percent"`
}

type HistogramData struct {
	SessionID   string         `json:"session_id"`
	SessionName string         `json:"session_name"`
	Total       int            `json:"total"`
	Bins        []HistogramBin `json:"bins"`
}

type SessionStats struct {
	SessionID     string  `json:"session_id"`
	SessionName   string  `json:"session_name"`
	DSCP          uint8   `json:"dscp"`
	TotalPackets  int     `json:"total_packets"`
	RTTMin        float64 `json:"rtt_min"`
	RTTMax        float64 `json:"rtt_max"`
	RTTAvg        float64 `json:"rtt_avg"`
	JitterAvg     float64 `json:"jitter_avg"`
	Active        bool    `json:"active"`
}

func TimeToNTP(t time.Time) NTPTimestamp {
	secs := t.Unix() + NTPOffset
	frac := uint64(t.Nanosecond()) * (1 << 32) / 1e9
	return NTPTimestamp{
		Seconds:  uint32(secs),
		Fraction: uint32(frac),
	}
}

func NTPToTime(ntp NTPTimestamp) time.Time {
	secs := int64(ntp.Seconds) - NTPOffset
	nanos := int64(ntp.Fraction) * 1e9 / (1 << 32)
	return time.Unix(secs, nanos)
}

func NTPToFloat64(ntp NTPTimestamp) float64 {
	return float64(ntp.Seconds) + float64(ntp.Fraction)/(1<<32)
}

func EncodeTestPacket(pkt *TestPacket) []byte {
	buf := make([]byte, 48)
	binary.BigEndian.PutUint32(buf[0:4], pkt.SequenceNumber)
	encodeNTPTimestamp(buf[4:12], pkt.Timestamp)
	binary.BigEndian.PutUint16(buf[12:14], pkt.ErrorEstimate)
	binary.BigEndian.PutUint16(buf[14:16], pkt.MBZ)
	encodeNTPTimestamp(buf[16:24], pkt.ReceiveTimestamp)
	binary.BigEndian.PutUint32(buf[24:28], pkt.SenderSequence)
	encodeNTPTimestamp(buf[28:36], pkt.SenderTimestamp)
	binary.BigEndian.PutUint16(buf[36:38], pkt.SenderErrorEstimate)
	binary.BigEndian.PutUint16(buf[38:40], pkt.SenderMBZ)
	return buf
}

func DecodeTestPacket(data []byte) *TestPacket {
	if len(data) < 48 {
		return nil
	}
	return &TestPacket{
		SequenceNumber:     binary.BigEndian.Uint32(data[0:4]),
		Timestamp:        decodeNTPTimestamp(data[4:12]),
		ErrorEstimate:      binary.BigEndian.Uint16(data[12:14]),
		MBZ:               binary.BigEndian.Uint16(data[14:16]),
		ReceiveTimestamp:   decodeNTPTimestamp(data[16:24]),
		SenderSequence:     binary.BigEndian.Uint32(data[24:28]),
		SenderTimestamp:    decodeNTPTimestamp(data[28:36]),
		SenderErrorEstimate: binary.BigEndian.Uint16(data[36:38]),
		SenderMBZ:          binary.BigEndian.Uint16(data[38:40]),
	}
}

func encodeNTPTimestamp(buf []byte, ntp NTPTimestamp) {
	binary.BigEndian.PutUint32(buf[0:4], ntp.Seconds)
	binary.BigEndian.PutUint32(buf[4:8], ntp.Fraction)
}

func decodeNTPTimestamp(data []byte) NTPTimestamp {
	return NTPTimestamp{
		Seconds:  binary.BigEndian.Uint32(data[0:4]),
		Fraction: binary.BigEndian.Uint32(data[4:8]),
	}
}

func NTPSub(a, b NTPTimestamp) float64 {
	secs := int64(a.Seconds) - int64(b.Seconds)
	frac := int64(a.Fraction) - int64(b.Fraction)
	if frac < 0 {
		secs--
		frac += 1 << 32
	}
	return float64(secs) + float64(frac)/(1<<32)
}

func ModeToString(mode uint32) string {
	switch mode {
	case ModeUnAuthenticated:
		return "Unauthenticated"
	case ModeAuthenticated:
		return "Authenticated"
	case ModeEncrypted:
		return "Encrypted"
	default:
		return "Unknown"
	}
}

func DSCPToString(dscp uint8) string {
	switch dscp {
	case DSCPBE:
		return "BE (Best Effort)"
	case DSCPEF:
		return "EF (Expedited Forwarding)"
	case DSCPAF11:
		return "AF11"
	case DSCPAF12:
		return "AF12"
	case DSCPAF13:
		return "AF13"
	case DSCPAF21:
		return "AF21"
	case DSCPAF22:
		return "AF22"
	case DSCPAF23:
		return "AF23"
	case DSCPAF31:
		return "AF31"
	case DSCPAF32:
		return "AF32"
	case DSCPAF33:
		return "AF33"
	case DSCPAF41:
		return "AF41"
	case DSCPAF42:
		return "AF42"
	case DSCPAF43:
		return "AF43"
	case DSCPCS1:
		return "CS1"
	case DSCPCS2:
		return "CS2"
	case DSCPCS3:
		return "CS3"
	case DSCPCS4:
		return "CS4"
	case DSCPCS5:
		return "CS5"
	case DSCPCS6:
		return "CS6"
	case DSCPCS7:
		return "CS7"
	case DSCPVOICE:
		return "Voice"
	case DSCPVIDEO:
		return "Video"
	default:
		return fmt.Sprintf("DSCP 0x%02x", dscp)
	}
}

func DSCPToName(dscp uint8) string {
	switch dscp {
	case DSCPBE:
		return "BE"
	case DSCPEF:
		return "EF"
	case DSCPAF11:
		return "AF11"
	case DSCPAF12:
		return "AF12"
	case DSCPAF13:
		return "AF13"
	case DSCPAF21:
		return "AF21"
	case DSCPAF22:
		return "AF22"
	case DSCPAF23:
		return "AF23"
	case DSCPAF31:
		return "AF31"
	case DSCPAF32:
		return "AF32"
	case DSCPAF33:
		return "AF33"
	case DSCPAF41:
		return "AF41"
	case DSCPAF42:
		return "AF42"
	case DSCPAF43:
		return "AF43"
	case DSCPCS1:
		return "CS1"
	case DSCPCS2:
		return "CS2"
	case DSCPCS3:
		return "CS3"
	case DSCPCS4:
		return "CS4"
	case DSCPCS5:
		return "CS5"
	case DSCPCS6:
		return "CS6"
	case DSCPCS7:
		return "CS7"
	case DSCPVOICE:
		return "Voice"
	case DSCPVIDEO:
		return "Video"
	default:
		return fmt.Sprintf("0x%02x", dscp)
	}
}

package protocol

import (
	"encoding/binary"
	"time"
)

const (
	OWAMP_PORT                = 861
	MAX_PAYLOAD_SIZE          = 1472
	TIMESTAMP_SIZE            = 8
	SEQUENCE_SIZE             = 4
	SymmetricHeaderSize      = 28
	SymmetricPayloadSize     = MAX_PAYLOAD_SIZE - SymmetricHeaderSize
	ModeBasic       = 0
	ModeSymmetric   = 1
)

type OWAMPPacket struct {
	SequenceNumber uint32
	SendTimestamp  time.Time
	ReceiveTS      uint64
	Payload        []byte
}

func NewOWAMPPacket(seq uint32) *OWAMPPacket {
	return &OWAMPPacket{
		SequenceNumber: seq,
		SendTimestamp:  time.Now(),
		Payload:        make([]byte, MAX_PAYLOAD_SIZE-SEQUENCE_SIZE-TIMESTAMP_SIZE),
	}
}

func (p *OWAMPPacket) Marshal() []byte {
	p.SendTimestamp = time.Now()
	buf := make([]byte, MAX_PAYLOAD_SIZE)

	binary.BigEndian.PutUint32(buf[0:4], p.SequenceNumber)

	ts := uint64(p.SendTimestamp.UnixNano())
	binary.BigEndian.PutUint64(buf[4:12], ts)

	copy(buf[12:], p.Payload)

	return buf
}

func Unmarshal(data []byte) *OWAMPPacket {
	if len(data) < 12 {
		return nil
	}

	seq := binary.BigEndian.Uint32(data[0:4])
	tsNano := binary.BigEndian.Uint64(data[4:12])
	sendTime := time.Unix(0, int64(tsNano))

	return &OWAMPPacket{
		SequenceNumber: seq,
		SendTimestamp:  sendTime,
		Payload:        data[12:],
	}
}

type SymmetricResponse struct {
	SequenceNumber    uint32
	ClientSendTS      time.Time
	ServerReceiveTS   time.Time
	ServerSendTS      time.Time
	Payload           []byte
}

func NewSymmetricResponse(requestData []byte, serverReceiveTime time.Time) *SymmetricResponse {
	req := Unmarshal(requestData)
	if req == nil {
		return nil
	}

	return &SymmetricResponse{
		SequenceNumber:  req.SequenceNumber,
		ClientSendTS:    req.SendTimestamp,
		ServerReceiveTS: serverReceiveTime,
		ServerSendTS:    time.Now(),
		Payload:         req.Payload,
	}
}

func (r *SymmetricResponse) Marshal() []byte {
	buf := make([]byte, MAX_PAYLOAD_SIZE)

	binary.BigEndian.PutUint32(buf[0:4], r.SequenceNumber)
	binary.BigEndian.PutUint64(buf[4:12], uint64(r.ClientSendTS.UnixNano()))
	binary.BigEndian.PutUint64(buf[12:20], uint64(r.ServerReceiveTS.UnixNano()))
	binary.BigEndian.PutUint64(buf[20:28], uint64(r.ServerSendTS.UnixNano()))

	payloadLen := len(r.Payload)
	available := MAX_PAYLOAD_SIZE - SymmetricHeaderSize
	if payloadLen > available {
		payloadLen = available
	}
	copy(buf[SymmetricHeaderSize:], r.Payload[:payloadLen])

	return buf
}

func UnmarshalSymmetricResponse(data []byte) *SymmetricResponse {
	if len(data) < SymmetricHeaderSize {
		return nil
	}

	seq := binary.BigEndian.Uint32(data[0:4])
	t1Nano := int64(binary.BigEndian.Uint64(data[4:12]))
	t2Nano := int64(binary.BigEndian.Uint64(data[12:20]))
	t3Nano := int64(binary.BigEndian.Uint64(data[20:28]))

	return &SymmetricResponse{
		SequenceNumber:  seq,
		ClientSendTS:    time.Unix(0, t1Nano),
		ServerReceiveTS: time.Unix(0, t2Nano),
		ServerSendTS:    time.Unix(0, t3Nano),
		Payload:         data[SymmetricHeaderSize:],
	}
}

func IsSymmetricResponse(data []byte) bool {
	return len(data) >= SymmetricHeaderSize
}

type TestResult struct {
	SequenceNumber      uint32        `json:"sequence_number"`
	SendTime            string        `json:"send_time"`
	ReceiveTime         string        `json:"receive_time"`
	SendTimestamp       int64         `json:"send_timestamp_ns"`
	ReceiveTS           int64         `json:"receive_timestamp_ns"`
	OneWayDelay         time.Duration `json:"one_way_delay"`
	OneWayDelayMs       float64       `json:"one_way_delay_ms"`
	CompensatedDelay    time.Duration `json:"compensated_delay,omitempty"`
	CompensatedDelayMs  float64       `json:"compensated_delay_ms,omitempty"`
	NTPOffset           time.Duration `json:"ntp_offset,omitempty"`
	NTPOffsetMs         float64       `json:"ntp_offset_ms,omitempty"`
	CurrentIntervalMs   float64       `json:"current_interval_ms,omitempty"`
	LossRate            float64       `json:"loss_rate,omitempty"`
	PacketSize          int           `json:"packet_size"`
	Success             bool          `json:"success"`
	Error               string        `json:"error,omitempty"`
	ForwardDelay        time.Duration `json:"forward_delay,omitempty"`
	ForwardDelayMs      float64       `json:"forward_delay_ms,omitempty"`
	ReverseDelay        time.Duration `json:"reverse_delay,omitempty"`
	ReverseDelayMs      float64       `json:"reverse_delay_ms,omitempty"`
	RTT                 time.Duration `json:"rtt,omitempty"`
	RTTMs               float64       `json:"rtt_ms,omitempty"`
	ServerReceiveTime   string        `json:"server_receive_time,omitempty"`
	ServerSendTime      string        `json:"server_send_time,omitempty"`
	ServerReceiveTS     int64         `json:"server_receive_timestamp_ns,omitempty"`
	ServerSendTS        int64         `json:"server_send_timestamp_ns,omitempty"`
	CompensatedFwdDelay time.Duration `json:"compensated_fwd_delay,omitempty"`
	CompensatedFwdMs    float64       `json:"compensated_fwd_delay_ms,omitempty"`
	CompensatedRevDelay time.Duration `json:"compensated_rev_delay,omitempty"`
	CompensatedRevMs    float64       `json:"compensated_rev_delay_ms,omitempty"`
	IsSymmetric         bool          `json:"is_symmetric,omitempty"`
}

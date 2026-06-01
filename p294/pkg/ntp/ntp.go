package ntp

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"time"
)

const (
	DefaultNTP_PORT     = 123
	DefaultNTPServer    = "pool.ntp.org"
	DefaultNTPTimeout   = 5 * time.Second
	DefaultNTPAttempts  = 3
	ntpEpochOffset      = 2208988800
	ntpVersion          = 4
	ntpModeClient       = 3
)

type NTPPacket struct {
	LiVnMode           uint8
	Stratum            uint8
	Poll               int8
	Precision          int8
	RootDelay          uint32
	RootDispersion     uint32
	ReferenceID        uint32
	ReferenceTimestamp uint64
	OriginateTimestamp uint64
	ReceiveTimestamp   uint64
	TransmitTimestamp  uint64
}

type NTPResult struct {
	Offset         time.Duration `json:"offset"`
	RoundTripDelay time.Duration `json:"round_trip_delay"`
	ServerTime     time.Time     `json:"server_time"`
	LocalTime      time.Time     `json:"local_time"`
	Server         string        `json:"server"`
	Success        bool          `json:"success"`
	Error          string        `json:"error,omitempty"`
}

func NewNTPPacket() *NTPPacket {
	return &NTPPacket{
		LiVnMode: (0 << 6) | (ntpVersion << 3) | ntpModeClient,
	}
}

func (p *NTPPacket) Marshal() []byte {
	buf := make([]byte, 48)
	buf[0] = p.LiVnMode
	buf[1] = p.Stratum
	buf[2] = byte(p.Poll)
	buf[3] = byte(p.Precision)
	binary.BigEndian.PutUint32(buf[4:8], p.RootDelay)
	binary.BigEndian.PutUint32(buf[8:12], p.RootDispersion)
	binary.BigEndian.PutUint32(buf[12:16], p.ReferenceID)
	binary.BigEndian.PutUint64(buf[16:24], p.ReferenceTimestamp)
	binary.BigEndian.PutUint64(buf[24:32], p.OriginateTimestamp)
	binary.BigEndian.PutUint64(buf[32:40], p.ReceiveTimestamp)
	binary.BigEndian.PutUint64(buf[40:48], p.TransmitTimestamp)
	return buf
}

func UnmarshalNTPPacket(data []byte) (*NTPPacket, error) {
	if len(data) < 48 {
		return nil, fmt.Errorf("packet too short: %d bytes", len(data))
	}

	p := &NTPPacket{}
	p.LiVnMode = data[0]
	p.Stratum = data[1]
	p.Poll = int8(data[2])
	p.Precision = int8(data[3])
	p.RootDelay = binary.BigEndian.Uint32(data[4:8])
	p.RootDispersion = binary.BigEndian.Uint32(data[8:12])
	p.ReferenceID = binary.BigEndian.Uint32(data[12:16])
	p.ReferenceTimestamp = binary.BigEndian.Uint64(data[16:24])
	p.OriginateTimestamp = binary.BigEndian.Uint64(data[24:32])
	p.ReceiveTimestamp = binary.BigEndian.Uint64(data[32:40])
	p.TransmitTimestamp = binary.BigEndian.Uint64(data[40:48])

	return p, nil
}

func ntpToTime(ntpTs uint64) time.Time {
	seconds := ntpTs >> 32
	fraction := ntpTs & 0xFFFFFFFF
	nanoseconds := int64(float64(fraction) * 1e9 / 0x100000000)
	return time.Unix(int64(seconds)-ntpEpochOffset, nanoseconds)
}

func timeToNTP(t time.Time) uint64 {
	seconds := uint64(t.Unix() + ntpEpochOffset)
	fraction := uint64(float64(t.Nanosecond()) * 0x100000000 / 1e9)
	return (seconds << 32) | fraction
}

func MeasureOffset(server string, port int, timeout time.Duration) (*NTPResult, error) {
	if server == "" {
		server = DefaultNTPServer
	}
	if port == 0 {
		port = DefaultNTP_PORT
	}
	if timeout == 0 {
		timeout = DefaultNTPTimeout
	}

	addr, err := net.ResolveUDPAddr("udp", net.JoinHostPort(server, fmt.Sprintf("%d", port)))
	if err != nil {
		return &NTPResult{Success: false, Error: err.Error()}, err
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return &NTPResult{Success: false, Error: err.Error()}, err
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(timeout))

	reqPacket := NewNTPPacket()
	t1 := time.Now()
	reqPacket.TransmitTimestamp = timeToNTP(t1)

	_, err = conn.Write(reqPacket.Marshal())
	if err != nil {
		return &NTPResult{Success: false, Error: err.Error()}, err
	}

	buf := make([]byte, 48)
	n, _, err := conn.ReadFromUDP(buf)
	t4 := time.Now()

	if err != nil {
		return &NTPResult{
			Success: false,
			Error:   err.Error(),
			Server:  server,
		}, err
	}

	respPacket, err := UnmarshalNTPPacket(buf[:n])
	if err != nil {
		return &NTPResult{
			Success: false,
			Error:   err.Error(),
			Server:  server,
		}, err
	}

	t2 := ntpToTime(respPacket.ReceiveTimestamp)
	t3 := ntpToTime(respPacket.TransmitTimestamp)

	offset := ((t2.Sub(t1)) + (t3.Sub(t4))) / 2
	roundTripDelay := t4.Sub(t1) - t3.Sub(t2)

	return &NTPResult{
		Offset:         offset,
		RoundTripDelay: roundTripDelay,
		ServerTime:     t3,
		LocalTime:      t4,
		Server:         server,
		Success:        true,
	}, nil
}

func MeasureOffsetWithRetry(server string, port int, timeout time.Duration, attempts int) (*NTPResult, error) {
	if attempts <= 0 {
		attempts = DefaultNTPAttempts
	}

	var lastErr error
	var bestResult *NTPResult
	minDelay := time.Duration(1<<63 - 1)

	for i := 0; i < attempts; i++ {
		result, err := MeasureOffset(server, port, timeout)
		if err == nil && result.Success {
			if result.RoundTripDelay < minDelay {
				minDelay = result.RoundTripDelay
				bestResult = result
			}
		} else {
			lastErr = err
		}

		if i < attempts-1 {
			time.Sleep(500 * time.Millisecond)
		}
	}

	if bestResult != nil {
		return bestResult, nil
	}

	if lastErr != nil {
		return &NTPResult{Success: false, Error: lastErr.Error()}, lastErr
	}

	return nil, errors.New("failed to measure NTP offset after all attempts")
}

type NTPClient struct {
	Server      string
	Port        int
	Timeout     time.Duration
	Attempts    int
	lastOffset  time.Duration
	lastResult  *NTPResult
	lastMeasure time.Time
}

func NewNTPClient(server string, port int) *NTPClient {
	return &NTPClient{
		Server:   server,
		Port:     port,
		Timeout:  DefaultNTPTimeout,
		Attempts: DefaultNTPAttempts,
	}
}

func (c *NTPClient) Measure() (*NTPResult, error) {
	result, err := MeasureOffsetWithRetry(c.Server, c.Port, c.Timeout, c.Attempts)
	if err == nil && result.Success {
		c.lastOffset = result.Offset
		c.lastResult = result
		c.lastMeasure = time.Now()
	}
	return result, err
}

func (c *NTPClient) GetOffset() time.Duration {
	return c.lastOffset
}

func (c *NTPClient) CompensateTime(t time.Time) time.Time {
	return t.Add(c.lastOffset)
}

func (c *NTPClient) LastResult() *NTPResult {
	return c.lastResult
}

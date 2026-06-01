package client

import (
	"net"
	"strconv"
	"sync"
	"time"

	"github.com/owamp-client/pkg/adaptive"
	"github.com/owamp-client/pkg/ntp"
	"github.com/owamp-client/pkg/protocol"
)

type NTPConfig struct {
	Enabled      bool
	Server       string
	Port         int
	Timeout      time.Duration
	Attempts     int
}

type AdaptiveConfig struct {
	Enabled        bool
	MinInterval    time.Duration
	MaxInterval    time.Duration
	IncreaseFactor float64
	DecreaseFactor float64
	LossThreshold  float64
	WindowSize     int
}

type OWMPServerConfig struct {
	Address       string
	Port          int
	Timeout       time.Duration
	PacketCount   int
	Interval      time.Duration
	SymmetricMode bool
	NTP           NTPConfig
	Adaptive      AdaptiveConfig
}

type OWAMPClient struct {
	config         OWMPServerConfig
	conn           *net.UDPConn
	results        []*protocol.TestResult
	mu             sync.Mutex
	isRunning      bool
	ntpClient      *ntp.NTPClient
	ntpResult      *ntp.NTPResult
	ntpOffset      time.Duration
	rateController *adaptive.RateController
}

func NewOWAMPClient(config OWMPServerConfig) *OWAMPClient {
	if config.Port == 0 {
		config.Port = protocol.OWAMP_PORT
	}
	if config.Timeout == 0 {
		config.Timeout = 5 * time.Second
	}
	if config.PacketCount == 0 {
		config.PacketCount = 10
	}
	if config.Interval == 0 {
		config.Interval = 100 * time.Millisecond
	}

	return &OWAMPClient{
		config: config,
	}
}

func (c *OWAMPClient) Connect() error {
	addr, err := net.ResolveUDPAddr("udp", net.JoinHostPort(c.config.Address, strconv.Itoa(c.config.Port)))
	if err != nil {
		return err
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return err
	}

	c.conn = conn
	return nil
}

func (c *OWAMPClient) Close() error {
	if c.conn != nil {
		return c.conn.Close()
	}
	return nil
}

func (c *OWAMPClient) MeasureNTPOffset() (*ntp.NTPResult, error) {
	if !c.config.NTP.Enabled {
		return nil, nil
	}

	c.ntpClient = ntp.NewNTPClient(c.config.NTP.Server, c.config.NTP.Port)
	if c.config.NTP.Timeout > 0 {
		c.ntpClient.Timeout = c.config.NTP.Timeout
	}
	if c.config.NTP.Attempts > 0 {
		c.ntpClient.Attempts = c.config.NTP.Attempts
	}

	result, err := c.ntpClient.Measure()
	if err != nil {
		return result, err
	}

	c.ntpResult = result
	c.ntpOffset = result.Offset
	return result, nil
}

func (c *OWAMPClient) SendTestPacket(seq uint32) (*protocol.TestResult, error) {
	packet := protocol.NewOWAMPPacket(seq)
	data := packet.Marshal()

	sendTime := time.Now()
	packet.SendTimestamp = sendTime

	_, err := c.conn.Write(data)
	if err != nil {
		result := &protocol.TestResult{
			SequenceNumber: seq,
			Success:        false,
			Error:          err.Error(),
			SendTime:       sendTime.Format(time.RFC3339Nano),
			SendTimestamp:  sendTime.UnixNano(),
		}
		c.attachNTPAndRate(result)
		return result, err
	}

	buf := make([]byte, protocol.MAX_PAYLOAD_SIZE)
	c.conn.SetReadDeadline(time.Now().Add(c.config.Timeout))

	n, _, err := c.conn.ReadFromUDP(buf)
	receiveTime := time.Now()

	if err != nil {
		result := &protocol.TestResult{
			SequenceNumber: seq,
			SendTime:       sendTime.Format(time.RFC3339Nano),
			SendTimestamp:   sendTime.UnixNano(),
			ReceiveTime:    receiveTime.Format(time.RFC3339Nano),
			ReceiveTS:      receiveTime.UnixNano(),
			Success:        false,
			Error:          err.Error(),
			PacketSize:     len(data),
		}
		c.attachNTPAndRate(result)
		return result, err
	}

	if c.config.SymmetricMode && protocol.IsSymmetricResponse(buf[:n]) {
		return c.handleSymmetricResponse(buf[:n], sendTime, receiveTime, seq, n)
	}

	respPacket := protocol.Unmarshal(buf[:n])
	if respPacket == nil {
		result := &protocol.TestResult{
			SequenceNumber: seq,
			SendTime:       sendTime.Format(time.RFC3339Nano),
			SendTimestamp:  sendTime.UnixNano(),
			ReceiveTime:    receiveTime.Format(time.RFC3339Nano),
			ReceiveTS:      receiveTime.UnixNano(),
			Success:        false,
			Error:          "invalid response packet",
			PacketSize:     n,
		}
		c.attachNTPAndRate(result)
		return result, nil
	}

	delay := CalculateOneWayDelay(packet.SendTimestamp, receiveTime)

	result := &protocol.TestResult{
		SequenceNumber: seq,
		SendTime:       sendTime.Format(time.RFC3339Nano),
		ReceiveTime:    receiveTime.Format(time.RFC3339Nano),
		SendTimestamp:  sendTime.UnixNano(),
		ReceiveTS:      receiveTime.UnixNano(),
		OneWayDelay:    delay,
		OneWayDelayMs:  float64(delay.Nanoseconds()) / 1e6,
		PacketSize:     n,
		Success:        true,
	}
	c.attachNTPAndRate(result)

	return result, nil
}

func (c *OWAMPClient) handleSymmetricResponse(data []byte, sendTime, receiveTime time.Time, seq uint32, n int) (*protocol.TestResult, error) {
	resp := protocol.UnmarshalSymmetricResponse(data)
	if resp == nil {
		result := &protocol.TestResult{
			SequenceNumber: seq,
			SendTime:       sendTime.Format(time.RFC3339Nano),
			SendTimestamp:  sendTime.UnixNano(),
			ReceiveTime:    receiveTime.Format(time.RFC3339Nano),
			ReceiveTS:      receiveTime.UnixNano(),
			Success:        false,
			Error:          "invalid symmetric response",
			PacketSize:     n,
		}
		c.attachNTPAndRate(result)
		return result, nil
	}

	t1 := resp.ClientSendTS
	t2 := resp.ServerReceiveTS
	t3 := resp.ServerSendTS
	t4 := receiveTime

	forwardDelay := t2.Sub(t1)
	reverseDelay := t4.Sub(t3)
	rtt := (t4.Sub(t1)) - (t3.Sub(t2))

	result := &protocol.TestResult{
		SequenceNumber:  seq,
		SendTime:        sendTime.Format(time.RFC3339Nano),
		ReceiveTime:     receiveTime.Format(time.RFC3339Nano),
		SendTimestamp:    sendTime.UnixNano(),
		ReceiveTS:       receiveTime.UnixNano(),
		OneWayDelay:     forwardDelay,
		OneWayDelayMs:   float64(forwardDelay.Nanoseconds()) / 1e6,
		PacketSize:      n,
		Success:         true,
		ForwardDelay:    forwardDelay,
		ForwardDelayMs:  float64(forwardDelay.Nanoseconds()) / 1e6,
		ReverseDelay:    reverseDelay,
		ReverseDelayMs:  float64(reverseDelay.Nanoseconds()) / 1e6,
		RTT:             rtt,
		RTTMs:           float64(rtt.Nanoseconds()) / 1e6,
		ServerReceiveTime: t2.Format(time.RFC3339Nano),
		ServerSendTime:    t3.Format(time.RFC3339Nano),
		ServerReceiveTS:   t2.UnixNano(),
		ServerSendTS:      t3.UnixNano(),
		IsSymmetric:     true,
	}

	if c.ntpOffset != 0 {
		compFwd := forwardDelay - c.ntpOffset
		compRev := reverseDelay + c.ntpOffset
		compTotal := receiveTime.Sub(sendTime) - c.ntpOffset

		result.CompensatedDelay = compTotal
		result.CompensatedDelayMs = float64(compTotal.Nanoseconds()) / 1e6
		result.NTPOffset = c.ntpOffset
		result.NTPOffsetMs = float64(c.ntpOffset.Nanoseconds()) / 1e6
		result.CompensatedFwdDelay = compFwd
		result.CompensatedFwdMs = float64(compFwd.Nanoseconds()) / 1e6
		result.CompensatedRevDelay = compRev
		result.CompensatedRevMs = float64(compRev.Nanoseconds()) / 1e6
	}

	c.attachRateInfo(result)

	return result, nil
}

func (c *OWAMPClient) attachNTPAndRate(result *protocol.TestResult) {
	if c.ntpOffset != 0 && !result.IsSymmetric {
		compDelay := CalculateCompensatedDelay(
			time.Unix(0, result.SendTimestamp),
			time.Unix(0, result.ReceiveTS),
			c.ntpOffset,
		)
		result.CompensatedDelay = compDelay
		result.CompensatedDelayMs = float64(compDelay.Nanoseconds()) / 1e6
		result.NTPOffset = c.ntpOffset
		result.NTPOffsetMs = float64(c.ntpOffset.Nanoseconds()) / 1e6
	}
	c.attachRateInfo(result)
}

func (c *OWAMPClient) attachRateInfo(result *protocol.TestResult) {
	if c.rateController != nil {
		result.CurrentIntervalMs = float64(c.rateController.GetInterval().Nanoseconds()) / 1e6
		result.LossRate = c.rateController.GetLossRate()
	}
}

func (c *OWAMPClient) initRateController() {
	if !c.config.Adaptive.Enabled {
		return
	}

	rcConfig := adaptive.RateControlConfig{
		MinInterval:     c.config.Adaptive.MinInterval,
		MaxInterval:     c.config.Adaptive.MaxInterval,
		InitialInterval: c.config.Interval,
		IncreaseFactor:  c.config.Adaptive.IncreaseFactor,
		DecreaseFactor:  c.config.Adaptive.DecreaseFactor,
		LossThreshold:   c.config.Adaptive.LossThreshold,
		WindowSize:      c.config.Adaptive.WindowSize,
	}
	c.rateController = adaptive.NewRateController(rcConfig)
}

func (c *OWAMPClient) RunTest() ([]*protocol.TestResult, error) {
	if err := c.Connect(); err != nil {
		return nil, err
	}
	defer c.Close()

	c.mu.Lock()
	c.results = make([]*protocol.TestResult, 0, c.config.PacketCount)
	c.isRunning = true
	c.mu.Unlock()

	_, _ = c.MeasureNTPOffset()

	c.initRateController()

	currentInterval := c.config.Interval

	for i := 0; i < c.config.PacketCount; i++ {
		if !c.IsRunning() {
			break
		}

		result, _ := c.SendTestPacket(uint32(i + 1))

		c.mu.Lock()
		c.results = append(c.results, result)
		c.mu.Unlock()

		if c.config.Adaptive.Enabled && c.rateController != nil {
			c.rateController.RecordResult(result.Success)

			if c.rateController.ShouldAdjust() {
				currentInterval = c.rateController.Adjust()
			}
		}

		if i < c.config.PacketCount-1 {
			time.Sleep(currentInterval)
		}
	}

	c.mu.Lock()
	c.isRunning = false
	c.mu.Unlock()

	return c.results, nil
}

func (c *OWAMPClient) Stop() {
	c.mu.Lock()
	c.isRunning = false
	c.mu.Unlock()
}

func (c *OWAMPClient) GetResults() []*protocol.TestResult {
	c.mu.Lock()
	defer c.mu.Unlock()

	results := make([]*protocol.TestResult, len(c.results))
	copy(results, c.results)
	return results
}

func (c *OWAMPClient) IsRunning() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.isRunning
}

func (c *OWAMPClient) GetNTPResult() *ntp.NTPResult {
	return c.ntpResult
}

func (c *OWAMPClient) GetRateControllerStats() map[string]interface{} {
	if c.rateController == nil {
		return nil
	}
	return c.rateController.GetStats()
}

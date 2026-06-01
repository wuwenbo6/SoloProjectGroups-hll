package modbus

import (
	"io"
	"sync"
	"time"

	"go.bug.st/serial"
)

type SerialConfig struct {
	Port     string
	BaudRate int
	DataBits int
	Parity   string
	StopBits int
}

type RTUClient struct {
	mu       sync.Mutex
	port     serial.Port
	portName string
	config   SerialConfig
}

func NewRTUClient(config SerialConfig) (*RTUClient, error) {
	mode := &serial.Mode{
		BaudRate: config.BaudRate,
		DataBits: config.DataBits,
		Parity:   parseParity(config.Parity),
		StopBits: parseStopBits(config.StopBits),
	}
	port, err := serial.Open(config.Port, mode)
	if err != nil {
		return nil, err
	}
	return &RTUClient{
		port:     port,
		portName: config.Port,
		config:   config,
	}, nil
}

func (c *RTUClient) PortName() string {
	return c.portName
}

func (c *RTUClient) Close() error {
	if c.port != nil {
		return c.port.Close()
	}
	return nil
}

func (c *RTUClient) SendAndReceive(data []byte, timeout time.Duration) ([]byte, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.port == nil {
		return nil, io.ErrClosedPipe
	}
	if err := c.port.SetReadTimeout(timeout); err != nil {
		return nil, err
	}
	if _, err := c.port.Write(data); err != nil {
		return nil, err
	}
	buf := make([]byte, 256)
	n, err := c.port.Read(buf)
	if err != nil {
		return nil, err
	}
	return buf[:n], nil
}

func parseParity(p string) serial.Parity {
	switch p {
	case "even":
		return serial.EvenParity
	case "odd":
		return serial.OddParity
	case "mark":
		return serial.MarkParity
	case "space":
		return serial.SpaceParity
	default:
		return serial.NoParity
	}
}

func parseStopBits(s int) serial.StopBits {
	switch s {
	case 2:
		return serial.TwoStopBits
	default:
		return serial.OneStopBit
	}
}

func CRC16(data []byte) uint16 {
	crc := uint16(0xFFFF)
	for _, b := range data {
		crc ^= uint16(b)
		for i := 0; i < 8; i++ {
			if crc&1 == 1 {
				crc = (crc >> 1) ^ 0xA001
			} else {
				crc >>= 1
			}
		}
	}
	return crc
}

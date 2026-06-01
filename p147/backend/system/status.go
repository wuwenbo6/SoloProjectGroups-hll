package system

import (
	"net"
	"sync"
)

type Status struct {
	mu               sync.RWMutex
	ModbusTCPPort    int               `json:"modbusTcpPort"`
	HTTPPort         int               `json:"httpPort"`
	ModbusTCPRunning bool              `json:"modbusTcpRunning"`
	HTTPRunning      bool              `json:"httpRunning"`
	SerialErrors     map[int]string    `json:"serialErrors"`
	StartupTime      string            `json:"startupTime"`
}

func NewStatus() *Status {
	return &Status{
		SerialErrors: make(map[int]string),
	}
}

func (s *Status) SetModbusTCPPort(port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ModbusTCPPort = port
}

func (s *Status) SetHTTPPort(port int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.HTTPPort = port
}

func (s *Status) SetModbusTCPRunning(running bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ModbusTCPRunning = running
}

func (s *Status) SetHTTPRunning(running bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.HTTPRunning = running
}

func (s *Status) SetSerialError(routeID int, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if errMsg == "" {
		delete(s.SerialErrors, routeID)
	} else {
		s.SerialErrors[routeID] = errMsg
	}
}

func (s *Status) ClearSerialError(routeID int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.SerialErrors, routeID)
}

func (s *Status) Get() Status {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return Status{
		ModbusTCPPort:    s.ModbusTCPPort,
		HTTPPort:         s.HTTPPort,
		ModbusTCPRunning: s.ModbusTCPRunning,
		HTTPRunning:      s.HTTPRunning,
		SerialErrors:     copyMap(s.SerialErrors),
		StartupTime:      s.StartupTime,
	}
}

func copyMap(m map[int]string) map[int]string {
	c := make(map[int]string, len(m))
	for k, v := range m {
		c[k] = v
	}
	return c
}

func TryListenTCP(startPort int, maxAttempts int) (net.Listener, int, error) {
	for i := 0; i < maxAttempts; i++ {
		port := startPort + i
		addr := ":" + itoa(port)
		listener, err := net.Listen("tcp", addr)
		if err == nil {
			return listener, port, nil
		}
	}
	return nil, 0, net.ErrClosed
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte(n%10) + '0'
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

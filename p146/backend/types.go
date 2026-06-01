package backend

import (
	"net"
	"sync"
	"time"
)

type SlaveConfig struct {
	ID   uint8
	Port int
	Name string
}

type SimulatorConfig struct {
	Slaves []SlaveConfig
}

type ModbusRequest struct {
	LogID        uint64    `json:"log_id"`
	Timestamp    time.Time `json:"timestamp"`
	SourceIP     string    `json:"source_ip"`
	SlaveID      uint8     `json:"slave_id"`
	SlaveName    string    `json:"slave_name"`
	FunctionCode uint8     `json:"function_code"`
	FunctionName string    `json:"function_name"`
	Data         []byte    `json:"data"`
	TrapTriggered bool     `json:"trap_triggered"`
	TrapName     string    `json:"trap_name,omitempty"`
}

type TrapConfig struct {
	ID           string `json:"id"`
	SlaveID      uint8  `json:"slave_id"`
	FunctionCode uint8  `json:"function_code"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Type         string `json:"type"`
	Enabled      bool   `json:"enabled"`
}

type SlaveStatus struct {
	ID          uint8   `json:"id"`
	Name        string  `json:"name"`
	Port        int     `json:"port"`
	Running     bool    `json:"running"`
	RequestCount int64  `json:"request_count"`
}

type ModbusSlave struct {
	config       SlaveConfig
	listener     net.Listener
	running      bool
	requestCount int64
	mu           sync.RWMutex
	simulator    *ModbusSimulator
}

const (
	MaxLogBufferSize = 10000
	LogQueueSize     = 100000
)

type ModbusSimulator struct {
	config         *SimulatorConfig
	slaves         map[uint8]*ModbusSlave
	logs           []ModbusRequest
	logsHead       int
	logsTail       int
	logsCount      uint64
	nextLogID      uint64
	logQueue       chan ModbusRequest
	logsMu         sync.RWMutex
	Traps          map[string]TrapConfig
	trapsMu        sync.RWMutex
	stopLogWorker  chan struct{}
	Fingerprint    *FingerprintEngine
	Honeypot       *HoneypotManager
}

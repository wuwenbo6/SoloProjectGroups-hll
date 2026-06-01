package sctp

import (
	"sync"
	"time"
)

type PathStatus string

const (
	PathStatusActive  PathStatus = "active"
	PathStatusStandby PathStatus = "standby"
	PathStatusFailed  PathStatus = "failed"
	PathStatusUnknown PathStatus = "unknown"
)

type Path struct {
	ID              string     `json:"id"`
	SourceIP        string     `json:"source_ip"`
	DestIP          string     `json:"dest_ip"`
	Status          PathStatus `json:"status"`
	RTT             int64      `json:"rtt_ms"`
	LastHeartbeat   time.Time  `json:"last_heartbeat"`
	HeartbeatMissed int        `json:"heartbeat_missed"`
	IsPrimary       bool       `json:"is_primary"`
	Priority        int        `json:"priority"`
}

type SwitchStats struct {
	TotalSwitches      int            `json:"total_switches"`
	AvgSwitchTimeMs    float64        `json:"avg_switch_time_ms"`
	MedianSwitchTimeMs float64        `json:"median_switch_time_ms"`
	MinSwitchTimeMs    int64          `json:"min_switch_time_ms"`
	MaxSwitchTimeMs    int64          `json:"max_switch_time_ms"`
	P95SwitchTimeMs    float64        `json:"p95_switch_time_ms"`
	P99SwitchTimeMs    float64        `json:"p99_switch_time_ms"`
	TotalDataMs        int64          `json:"total_data_ms"`
	LastSwitchTime     time.Time      `json:"last_switch_time"`
	FailuresByReason   map[string]int `json:"failures_by_reason"`
}

type PathSwitchEvent struct {
	ID           int       `json:"id"`
	Timestamp    time.Time `json:"timestamp"`
	FromPathID   string    `json:"from_path_id"`
	FromSourceIP string    `json:"from_source_ip"`
	FromDestIP   string    `json:"from_dest_ip"`
	ToPathID     string    `json:"to_path_id"`
	ToSourceIP   string    `json:"to_source_ip"`
	ToDestIP     string    `json:"to_dest_ip"`
	Reason       string    `json:"reason"`
	SwitchTimeMs int64     `json:"switch_time_ms"`
}

type EndpointStatus struct {
	ID                  string            `json:"id"`
	Name                string            `json:"name"`
	Paths               []*Path           `json:"paths"`
	ActivePathID        string            `json:"active_path_id"`
	SwitchHistory       []PathSwitchEvent `json:"switch_history"`
	HeartbeatInterval   time.Duration     `json:"heartbeat_interval_ms"`
	MaxMissedHeartbeats int               `json:"max_missed_heartbeats"`
	IsRunning           bool              `json:"is_running"`
	BufferQueueSize     int               `json:"buffer_queue_size"`
	BufferQueue         []DataMsg         `json:"buffer_queue"`
	IsPathVerified      bool              `json:"is_path_verified"`
	BufferEvents        []BufferEvent     `json:"buffer_events"`
	ReceivedData        []DataMsg         `json:"received_data"`
}

type SimulatorConfig struct {
	EndpointAName       string
	EndpointBName       string
	EndpointAIPs        []string
	EndpointBIPs        []string
	HeartbeatInterval   time.Duration
	MaxMissedHeartbeats int
}

type HeartbeatMsg struct {
	FromEndpoint string
	FromIP       string
	ToIP         string
	Timestamp    time.Time
	SeqNum       uint64
}

type HeartbeatAck struct {
	FromEndpoint string
	FromIP       string
	ToIP         string
	Timestamp    time.Time
	SeqNum       uint64
	RTT          time.Duration
}

type DataMsg struct {
	FromEndpoint string    `json:"from_endpoint"`
	FromIP       string    `json:"from_ip"`
	ToIP         string    `json:"to_ip"`
	Timestamp    time.Time `json:"timestamp"`
	SeqNum       uint64    `json:"seq_num"`
	Content      string    `json:"content"`
	IsBuffered   bool      `json:"is_buffered"`
}

type DataAck struct {
	FromEndpoint string    `json:"from_endpoint"`
	FromIP       string    `json:"from_ip"`
	ToIP         string    `json:"to_ip"`
	Timestamp    time.Time `json:"timestamp"`
	SeqNum       uint64    `json:"seq_num"`
	Received     bool      `json:"received"`
}

type BufferEvent struct {
	ID         int       `json:"id"`
	Timestamp  time.Time `json:"timestamp"`
	Type       string    `json:"type"`
	DataSeqNum uint64    `json:"data_seq_num"`
	PathID     string    `json:"path_id"`
	Message    string    `json:"message"`
}

type Endpoint struct {
	mu                  sync.RWMutex
	id                  string
	name                string
	paths               []*Path
	activePathID        string
	switchHistory       []PathSwitchEvent
	switchCount         int
	heartbeatInterval   time.Duration
	maxMissedHeartbeats int
	isRunning           bool
	heartbeatChan       chan HeartbeatMsg
	heartbeatAckChan    chan HeartbeatAck
	stopChan            chan struct{}
	peer                *Endpoint
	eventCallback       func(PathSwitchEvent)
	seqNum              uint64
	dataSeqNum          uint64
	dataChan            chan DataMsg
	dataAckChan         chan DataAck
	bufferQueue         []DataMsg
	isPathVerified      bool
	bufferEvents        []BufferEvent
	bufferEventCount    int
	bufferCallback      func(BufferEvent)
	receivedData        []DataMsg
}

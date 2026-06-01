package mlag

import (
	"sync"
	"time"
)

type Role string

const (
	RoleMaster  Role = "master"
	RoleBackup  Role = "backup"
	RoleUnknown Role = "unknown"
)

type PortState string

const (
	PortStateUp      PortState = "up"
	PortStateDown    PortState = "down"
	PortStateBlocked PortState = "blocked"
)

type LacpState struct {
	PortID        string    `json:"port_id"`
	State         string    `json:"state"`
	ActorKey      uint16    `json:"actor_key"`
	PartnerKey    uint16    `json:"partner_key"`
	ActorSystem   string    `json:"actor_system"`
	PartnerSystem string    `json:"partner_system"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type Port struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	State     PortState  `json:"state"`
	LacpState *LacpState `json:"lacp_state,omitempty"`
}

type HeartbeatInfo struct {
	SwitchID   string      `json:"switch_id"`
	Role       Role        `json:"role"`
	Timestamp  time.Time   `json:"timestamp"`
	SeqNum     uint64      `json:"seq_num"`
	Alive      bool        `json:"alive"`
	Ports      []Port      `json:"ports"`
	LacpStates []LacpState `json:"lacp_states"`
}

type MacMoveState string

const (
	MacMoveNormal  MacMoveState = "normal"
	MacMoveDrift   MacMoveState = "drift"
	MacMoveBlocked MacMoveState = "blocked"
)

type MacEntry struct {
	MACAddress string       `json:"mac_address"`
	PortID     string       `json:"port_id"`
	VLAN       uint16       `json:"vlan"`
	MoveCount  int          `json:"move_count"`
	State      MacMoveState `json:"state"`
	LastSeen   time.Time    `json:"last_seen"`
	FirstSeen  time.Time    `json:"first_seen"`
	LastMoveAt time.Time    `json:"last_move_at"`
	EncapMAC   string       `json:"encap_mac"`
}

type MacTable struct {
	Entries        map[string]*MacEntry
	MaxEntries     int
	DriftWindow    time.Duration
	DriftThreshold int
}

type FailbackState string

const (
	FailbackNone    FailbackState = "none"
	FailbackWaiting FailbackState = "waiting"
	FailbackReady   FailbackState = "ready"
)

type MlagConfig struct {
	DomainID          string
	PeerAddress       string
	LocalAddress      string
	HeartbeatInterval time.Duration
	DeadInterval      time.Duration
	Priority          int
	FailbackTimer     time.Duration
	MacDriftWindow    time.Duration
	MacDriftThreshold int
}

type Switch struct {
	mu              sync.RWMutex
	ID              string
	Name            string
	Role            Role
	Config          MlagConfig
	Ports           map[string]*Port
	Peer            *Switch
	PeerInfo        *HeartbeatInfo
	LastHeartbeat   time.Time
	SeqNum          uint64
	Running         bool
	stopChan        chan struct{}
	electionWon     bool
	MacTable        *MacTable
	FailbackState   FailbackState
	FailbackStartAt time.Time
	WasMasterBefore bool
	PeerWasDown     bool
	SystemMAC       string
	HeartbeatLogger *HeartbeatLogger
	LastConsistency *ConsistencyReport
}

type FailbackStatus struct {
	State     FailbackState `json:"state"`
	Remaining string        `json:"remaining"`
	Total     string        `json:"total"`
	StartedAt string        `json:"started_at"`
}

type ConsistencyStatus string

const (
	ConsistencyOK       ConsistencyStatus = "ok"
	ConsistencyMismatch ConsistencyStatus = "mismatch"
	ConsistencyError    ConsistencyStatus = "error"
)

type ConsistencyItem struct {
	Category    string            `json:"category"`
	LocalValue  string            `json:"local_value"`
	PeerValue   string            `json:"peer_value"`
	Status      ConsistencyStatus `json:"status"`
	Description string            `json:"description"`
}

type ConsistencyReport struct {
	OverallStatus ConsistencyStatus `json:"overall_status"`
	CheckedAt     time.Time         `json:"checked_at"`
	Items         []ConsistencyItem `json:"items"`
	MismatchCount int               `json:"mismatch_count"`
	OKCount       int               `json:"ok_count"`
}

type HeartbeatRecord struct {
	ID        uint64    `json:"id"`
	Source    string    `json:"source"`
	Dest      string    `json:"dest"`
	SeqNum    uint64    `json:"seq_num"`
	Role      Role      `json:"role"`
	Timestamp time.Time `json:"timestamp"`
	LatencyMs int64     `json:"latency_ms"`
	Received  bool      `json:"received"`
	PeerAlive bool      `json:"peer_alive"`
}

type HeartbeatLogger struct {
	mu         sync.RWMutex
	records    []HeartbeatRecord
	maxRecords int
	nextID     uint64
}

type SwitchStatus struct {
	ID              string             `json:"id"`
	Name            string             `json:"name"`
	Role            Role               `json:"role"`
	UpTime          string             `json:"uptime"`
	LastHeartbeat   string             `json:"last_heartbeat"`
	PeerAlive       bool               `json:"peer_alive"`
	PeerRole        Role               `json:"peer_role"`
	Ports           []Port             `json:"ports"`
	LacpStates      []LacpState        `json:"lacp_states"`
	Failback        FailbackStatus     `json:"failback"`
	MacEntries      []MacEntry         `json:"mac_entries"`
	MacDriftCount   int                `json:"mac_drift_count"`
	MacBlockedCount int                `json:"mac_blocked_count"`
	Consistency     *ConsistencyReport `json:"consistency,omitempty"`
	HeartbeatCount  int                `json:"heartbeat_count"`
}

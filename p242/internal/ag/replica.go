package ag

import (
	"fmt"
	"sync"
	"time"
)

type ReplicaRole string

const (
	Primary   ReplicaRole = "PRIMARY"
	Secondary ReplicaRole = "SECONDARY"
)

type AvailabilityMode string

const (
	SynchronousCommit  AvailabilityMode = "SYNCHRONOUS_COMMIT"
	AsynchronousCommit AvailabilityMode = "ASYNCHRONOUS_COMMIT"
)

type SyncState string

const (
	Synchronized     SyncState = "SYNCHRONIZED"
	Synchronizing    SyncState = "SYNCHRONIZING"
	NotSynchronized  SyncState = "NOT_SYNCHRONIZED"
	Reverting        SyncState = "REVERTING"
)

type Replica struct {
	Name             string           `json:"name"`
	Host             string           `json:"host"`
	Port             int              `json:"port"`
	Role             ReplicaRole      `json:"role"`
	AvailabilityMode AvailabilityMode `json:"availability_mode"`
	SyncState        SyncState        `json:"sync_state"`
	SyncHealth       string           `json:"sync_health"`
	LastSyncTime     time.Time        `json:"last_sync_time"`
	LSN              int64            `json:"lsn"`
	IsConnected      bool             `json:"is_connected"`
	mu               sync.RWMutex
}

type ReplicaStatus struct {
	Name             string           `json:"name"`
	Host             string           `json:"host"`
	Port             int              `json:"port"`
	Role             ReplicaRole      `json:"role"`
	AvailabilityMode AvailabilityMode `json:"availability_mode"`
	SyncState        SyncState        `json:"sync_state"`
	SyncHealth       string           `json:"sync_health"`
	LastSyncTime     time.Time        `json:"last_sync_time"`
	LSN              int64            `json:"lsn"`
	IsConnected      bool             `json:"is_connected"`
	ConnectionURL    string           `json:"connection_url"`
}

func NewReplica(name string, host string, port int, mode AvailabilityMode) *Replica {
	return &Replica{
		Name:             name,
		Host:             host,
		Port:             port,
		Role:             Secondary,
		AvailabilityMode: mode,
		SyncState:        NotSynchronized,
		SyncHealth:       "HEALTHY",
		LastSyncTime:     time.Now(),
		LSN:              0,
		IsConnected:      true,
	}
}

func (r *Replica) GetStatus() ReplicaStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return ReplicaStatus{
		Name:             r.Name,
		Host:             r.Host,
		Port:             r.Port,
		Role:             r.Role,
		AvailabilityMode: r.AvailabilityMode,
		SyncState:        r.SyncState,
		SyncHealth:       r.SyncHealth,
		LastSyncTime:     r.LastSyncTime,
		LSN:              r.LSN,
		IsConnected:      r.IsConnected,
		ConnectionURL:    fmt.Sprintf("http://%s:%d", r.Host, r.Port),
	}
}

func (r *Replica) SetRole(role ReplicaRole) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Role = role
}

func (r *Replica) SetSyncState(state SyncState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.SyncState = state
}

func (r *Replica) UpdateLSN(lsn int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.LSN = lsn
	r.LastSyncTime = time.Now()
}

func (r *Replica) SetConnected(connected bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.IsConnected = connected
}

func (r *Replica) SetSyncHealth(health string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.SyncHealth = health
}

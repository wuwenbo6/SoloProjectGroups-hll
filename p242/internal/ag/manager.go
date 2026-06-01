package ag

import (
	"fmt"
	"log"
	"math/rand"
	"sync"
	"time"
)

type FailoverRecord struct {
	ID          int       `json:"id"`
	OldPrimary  string    `json:"old_primary"`
	NewPrimary  string    `json:"new_primary"`
	Timestamp   time.Time `json:"timestamp"`
	Reason      string    `json:"reason"`
	Manual      bool      `json:"manual"`
}

type AGStatus struct {
	Name            string           `json:"name"`
	PrimaryReplica  string           `json:"primary_replica"`
	ListenerIP      string           `json:"listener_ip"`
	ListenerPort    int              `json:"listener_port"`
	Replicas        []ReplicaStatus  `json:"replicas"`
	QuorumType      string           `json:"quorum_type"`
	OverallHealth   string           `json:"overall_health"`
	LastFailover    time.Time        `json:"last_failover,omitempty"`
	FailoverCount   int              `json:"failover_count"`
	SyncSuspended   bool             `json:"sync_suspended"`
}

type FailoverCallback func(oldPrimary, newPrimary string)

type AvailabilityGroup struct {
	Name               string
	Replicas           map[string]*Replica
	PrimaryName        string
	ListenerIP         string
	ListenerPort       int
	lastFailover       time.Time
	failoverCount      int
	globalLSN          int64
	failoverCallbacks  []FailoverCallback
	failoverHistory    []FailoverRecord
	syncSuspended      bool
	mu                 sync.RWMutex
}

func NewAvailabilityGroup() *AvailabilityGroup {
	return &AvailabilityGroup{
		Name:            "AG-Simulator",
		Replicas:        make(map[string]*Replica),
		PrimaryName:     "",
		ListenerIP:      "127.0.0.1",
		ListenerPort:    8080,
		failoverHistory: make([]FailoverRecord, 0),
	}
}

func (ag *AvailabilityGroup) AddReplica(name string, host string, port int, mode AvailabilityMode) error {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	if _, exists := ag.Replicas[name]; exists {
		return fmt.Errorf("replica %s already exists", name)
	}

	ag.Replicas[name] = NewReplica(name, host, port, mode)
	log.Printf("Replica %s added (%s:%d, mode=%s)", name, host, port, mode)
	return nil
}

func (ag *AvailabilityGroup) RemoveReplica(name string) error {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	if _, exists := ag.Replicas[name]; !exists {
		return fmt.Errorf("replica %s not found", name)
	}

	if ag.PrimaryName == name {
		return fmt.Errorf("cannot remove primary replica %s", name)
	}

	delete(ag.Replicas, name)
	log.Printf("Replica %s removed", name)
	return nil
}

func (ag *AvailabilityGroup) SetPrimary(name string) error {
	return ag.SetPrimaryWithReason(name, "manual", true)
}

func (ag *AvailabilityGroup) SetPrimaryWithReason(name, reason string, isManual bool) error {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	replica, exists := ag.Replicas[name]
	if !exists {
		return fmt.Errorf("replica %s not found", name)
	}

	if !replica.IsConnected {
		return fmt.Errorf("replica %s is not connected", name)
	}

	oldPrimary := ag.PrimaryName
	if oldPrimary != "" {
		if oldReplica, ok := ag.Replicas[oldPrimary]; ok {
			oldReplica.SetRole(Secondary)
			oldReplica.SetSyncState(Synchronizing)
		}
	}

	ag.PrimaryName = name
	replica.SetRole(Primary)
	replica.SetSyncState(Synchronized)
	ag.lastFailover = time.Now()
	ag.failoverCount++

	record := FailoverRecord{
		ID:         ag.failoverCount,
		OldPrimary: oldPrimary,
		NewPrimary: name,
		Timestamp:  ag.lastFailover,
		Reason:     reason,
		Manual:     isManual,
	}
	ag.failoverHistory = append(ag.failoverHistory, record)

	for _, r := range ag.Replicas {
		if r.Name != name {
			r.SetSyncState(Synchronizing)
		}
	}

	log.Printf("Primary replica changed: %s -> %s (reason: %s, manual: %v)", oldPrimary, name, reason, isManual)

	go ag.notifyFailoverCallbacks(oldPrimary, name)
	return nil
}

func (ag *AvailabilityGroup) OnFailover(callback FailoverCallback) {
	ag.mu.Lock()
	defer ag.mu.Unlock()
	ag.failoverCallbacks = append(ag.failoverCallbacks, callback)
}

func (ag *AvailabilityGroup) notifyFailoverCallbacks(oldPrimary, newPrimary string) {
	ag.mu.RLock()
	callbacks := make([]FailoverCallback, len(ag.failoverCallbacks))
	copy(callbacks, ag.failoverCallbacks)
	ag.mu.RUnlock()

	for _, cb := range callbacks {
		cb(oldPrimary, newPrimary)
	}
}

func (ag *AvailabilityGroup) GetReadableReplicas() []*Replica {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	var replicas []*Replica
	for _, r := range ag.Replicas {
		if r.IsConnected {
			replicas = append(replicas, r)
		}
	}
	return replicas
}

func (ag *AvailabilityGroup) SelectReadOnlyReplica() *Replica {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	var secondaries []*Replica
	for _, r := range ag.Replicas {
		if r.Role == Secondary && r.IsConnected && r.SyncState == Synchronized {
			secondaries = append(secondaries, r)
		}
	}

	if len(secondaries) == 0 {
		if ag.PrimaryName != "" {
			return ag.Replicas[ag.PrimaryName]
		}
		return nil
	}

	idx := rand.Intn(len(secondaries))
	return secondaries[idx]
}

func (ag *AvailabilityGroup) GetPrimary() *Replica {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	if ag.PrimaryName == "" {
		return nil
	}
	return ag.Replicas[ag.PrimaryName]
}

func (ag *AvailabilityGroup) GetReplica(name string) (*Replica, bool) {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	r, exists := ag.Replicas[name]
	return r, exists
}

func (ag *AvailabilityGroup) GetStatus() AGStatus {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	status := AGStatus{
		Name:           ag.Name,
		PrimaryReplica: ag.PrimaryName,
		ListenerIP:     ag.ListenerIP,
		ListenerPort:   ag.ListenerPort,
		QuorumType:     "NODE_MAJORITY",
		LastFailover:   ag.lastFailover,
		FailoverCount:  ag.failoverCount,
		SyncSuspended:  ag.syncSuspended,
		Replicas:       make([]ReplicaStatus, 0, len(ag.Replicas)),
	}

	healthyCount := 0
	for _, r := range ag.Replicas {
		s := r.GetStatus()
		status.Replicas = append(status.Replicas, s)
		if s.IsConnected && s.SyncHealth == "HEALTHY" {
			healthyCount++
		}
	}

	switch {
	case healthyCount == len(ag.Replicas):
		status.OverallHealth = "HEALTHY"
	case healthyCount >= len(ag.Replicas)/2+1:
		status.OverallHealth = "WARNING"
	default:
		status.OverallHealth = "CRITICAL"
	}

	return status
}

func (ag *AvailabilityGroup) Failover(targetName string) error {
	log.Printf("Starting failover to %s...", targetName)

	if err := ag.SetPrimary(targetName); err != nil {
		return fmt.Errorf("failover failed: %w", err)
	}

	log.Printf("Failover completed successfully to %s", targetName)
	return nil
}

func (ag *AvailabilityGroup) StartSyncLoop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		ag.syncReplicas()
	}
}

func (ag *AvailabilityGroup) syncReplicas() {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	primary, exists := ag.Replicas[ag.PrimaryName]
	if !exists || primary.Role != Primary {
		return
	}

	if ag.syncSuspended {
		return
	}

	ag.globalLSN++
	primary.UpdateLSN(ag.globalLSN)

	for name, replica := range ag.Replicas {
		if name == ag.PrimaryName || !replica.IsConnected {
			continue
		}

		delay := time.Duration(0)
		if replica.AvailabilityMode == AsynchronousCommit {
			delay = time.Duration(rand.Intn(500)) * time.Millisecond
		}

		time.Sleep(delay)

		replica.UpdateLSN(ag.globalLSN)

		switch replica.AvailabilityMode {
		case SynchronousCommit:
			if replica.LSN >= primary.LSN {
				replica.SetSyncState(Synchronized)
				replica.SetSyncHealth("HEALTHY")
			} else {
				replica.SetSyncState(Synchronizing)
				replica.SetSyncHealth("PARTIALLY_HEALTHY")
			}
		case AsynchronousCommit:
			latency := primary.LSN - replica.LSN
			switch {
			case latency <= 5:
				replica.SetSyncState(Synchronized)
				replica.SetSyncHealth("HEALTHY")
			case latency <= 20:
				replica.SetSyncState(Synchronizing)
				replica.SetSyncHealth("PARTIALLY_HEALTHY")
			default:
				replica.SetSyncState(Synchronizing)
				replica.SetSyncHealth("NOT_HEALTHY")
			}
		}
	}
}

func (ag *AvailabilityGroup) SimulateReplicaFailure(name string) error {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	replica, exists := ag.Replicas[name]
	if !exists {
		return fmt.Errorf("replica %s not found", name)
	}

	replica.SetConnected(false)
	replica.SetSyncState(NotSynchronized)
	replica.SetSyncHealth("CRITICAL")
	log.Printf("Replica %s simulated failure", name)

	if name == ag.PrimaryName {
		go ag.automaticFailover()
	}

	return nil
}

func (ag *AvailabilityGroup) SimulateReplicaRecovery(name string) error {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	replica, exists := ag.Replicas[name]
	if !exists {
		return fmt.Errorf("replica %s not found", name)
	}

	replica.SetConnected(true)
	replica.SetSyncState(Synchronizing)
	replica.SetSyncHealth("PARTIALLY_HEALTHY")
	log.Printf("Replica %s recovered, starting resync", name)

	return nil
}

func (ag *AvailabilityGroup) SuspendSync(reason string) {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	if !ag.syncSuspended {
		ag.syncSuspended = true
		log.Printf("Data synchronization suspended (reason: %s)", reason)
	}
}

func (ag *AvailabilityGroup) ResumeSync() {
	ag.mu.Lock()
	defer ag.mu.Unlock()

	if ag.syncSuspended {
		ag.syncSuspended = false
		log.Printf("Data synchronization resumed")
	}
}

func (ag *AvailabilityGroup) IsSyncSuspended() bool {
	ag.mu.RLock()
	defer ag.mu.RUnlock()
	return ag.syncSuspended
}

func (ag *AvailabilityGroup) GetFailoverHistory() []FailoverRecord {
	ag.mu.RLock()
	defer ag.mu.RUnlock()

	history := make([]FailoverRecord, len(ag.failoverHistory))
	copy(history, ag.failoverHistory)

	for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
		history[i], history[j] = history[j], history[i]
	}

	return history
}

func (ag *AvailabilityGroup) automaticFailover() {
	time.Sleep(1 * time.Second)

	ag.mu.RLock()
	var candidates []string
	for name, r := range ag.Replicas {
		if r.IsConnected && r.AvailabilityMode == SynchronousCommit {
			candidates = append(candidates, name)
		}
	}
	ag.mu.RUnlock()

	if len(candidates) == 0 {
		log.Println("Automatic failover failed: no suitable candidates")
		return
	}

	target := candidates[0]
	if err := ag.SetPrimaryWithReason(target, "automatic_failover", false); err != nil {
		log.Printf("Automatic failover error: %v", err)
	}
}

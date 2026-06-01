package lease

import (
	"sync"
	"time"
)

type LeaseType string

const (
	LeaseTypeRead  LeaseType = "READ"
	LeaseTypeWrite LeaseType = "WRITE"
	LeaseTypeBatch LeaseType = "BATCH"
)

type LeaseState string

const (
	LeaseStateGranted     LeaseState = "GRANTED"
	LeaseStateBreaking    LeaseState = "BREAKING"
	LeaseStateBroken      LeaseState = "BROKEN"
	LeaseStateDowngrading LeaseState = "DOWNGRADING"
	LeaseStateExpired     LeaseState = "EXPIRED"
)

const (
	MaxBreakRetries    = 3
	BreakRetryInterval = 200 * time.Millisecond
	DefaultLeaseTTL    = 5 * time.Minute
	TimeoutCheckInterval = 1 * time.Second
)

type Lease struct {
	ID              string
	ClientID        string
	FileName        string
	Type            LeaseType
	OriginalType    LeaseType
	State           LeaseState
	GrantedAt       time.Time
	ExpiresAt       time.Time
	BreakAcked      bool
	BreakRetryCount int
	Downgraded      bool
}

type LeaseEvent struct {
	Type        string
	ClientID    string
	FileName    string
	LeaseID     string
	Reason      string
	Time        time.Time
	RetryCount  int
	MaxRetries  int
	OldType     LeaseType
	NewType     LeaseType
}

type ChangeLogEntry struct {
	ID        int64     `json:"id"`
	LeaseID   string    `json:"leaseId"`
	ClientID  string    `json:"clientId"`
	FileName  string    `json:"fileName"`
	EventType string    `json:"eventType"`
	OldState  LeaseState `json:"oldState,omitempty"`
	NewState  LeaseState `json:"newState,omitempty"`
	OldType   LeaseType  `json:"oldType,omitempty"`
	NewType   LeaseType  `json:"newType,omitempty"`
	Reason    string    `json:"reason,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type LeaseManager struct {
	mu              sync.RWMutex
	leases          map[string]*Lease
	clients         map[string]chan LeaseEvent
	clientResponses map[string]chan bool
	fileLeases      map[string][]*Lease
	eventChan       chan LeaseEvent
	listeners       []chan LeaseEvent
	listenerMu      sync.RWMutex
	changeLog       []ChangeLogEntry
	changeLogMu     sync.RWMutex
	changeLogID     int64
	leaseTTL        time.Duration
	stopChan        chan struct{}
}

func NewLeaseManager() *LeaseManager {
	lm := &LeaseManager{
		leases:          make(map[string]*Lease),
		clients:         make(map[string]chan LeaseEvent),
		clientResponses: make(map[string]chan bool),
		fileLeases:      make(map[string][]*Lease),
		eventChan:       make(chan LeaseEvent, 100),
		changeLog:       make([]ChangeLogEntry, 0),
		leaseTTL:        DefaultLeaseTTL,
		stopChan:        make(chan struct{}),
	}
	go lm.eventLoop()
	go lm.timeoutChecker()
	return lm
}

func (lm *LeaseManager) Stop() {
	close(lm.stopChan)
}

func (lm *LeaseManager) SetLeaseTTL(ttl time.Duration) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	lm.leaseTTL = ttl
}

func (lm *LeaseManager) GetLeaseTTL() time.Duration {
	lm.mu.RLock()
	defer lm.mu.RUnlock()
	return lm.leaseTTL
}

func (lm *LeaseManager) timeoutChecker() {
	ticker := time.NewTicker(TimeoutCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-lm.stopChan:
			return
		case <-ticker.C:
			lm.reclaimExpiredLeases()
		}
	}
}

func (lm *LeaseManager) reclaimExpiredLeases() {
	lm.mu.Lock()
	var expired []*Lease
	now := time.Now()

	for _, lease := range lm.leases {
		if lease.State == LeaseStateGranted && !lease.ExpiresAt.IsZero() && now.After(lease.ExpiresAt) {
			lease.State = LeaseStateExpired
			expired = append(expired, lease)
		}
	}
	lm.mu.Unlock()

	for _, lease := range expired {
		lm.emitEvent(LeaseEvent{
			Type:     "LEASE_EXPIRED",
			ClientID: lease.ClientID,
			FileName: lease.FileName,
			LeaseID:  lease.ID,
			Reason:   "Lease TTL expired, automatically reclaimed",
			Time:     time.Now(),
		})

		lm.logChange(ChangeLogEntry{
			LeaseID:   lease.ID,
			ClientID:  lease.ClientID,
			FileName:  lease.FileName,
			EventType: "LEASE_EXPIRED",
			OldState:  LeaseStateGranted,
			NewState:  LeaseStateExpired,
			OldType:   lease.Type,
			NewType:   lease.Type,
			Reason:    "Lease TTL expired",
			Timestamp: time.Now(),
		})

		lm.ReleaseLease(lease.ID)
	}
}

func (lm *LeaseManager) logChange(entry ChangeLogEntry) {
	lm.changeLogMu.Lock()
	defer lm.changeLogMu.Unlock()
	lm.changeLogID++
	entry.ID = lm.changeLogID
	lm.changeLog = append(lm.changeLog, entry)
}

func (lm *LeaseManager) GetChangeLog() []ChangeLogEntry {
	lm.changeLogMu.RLock()
	defer lm.changeLogMu.RUnlock()
	result := make([]ChangeLogEntry, len(lm.changeLog))
	copy(result, lm.changeLog)
	return result
}

func (lm *LeaseManager) GetChangeLogSince(since time.Time) []ChangeLogEntry {
	lm.changeLogMu.RLock()
	defer lm.changeLogMu.RUnlock()
	var result []ChangeLogEntry
	for _, entry := range lm.changeLog {
		if entry.Timestamp.After(since) {
			result = append(result, entry)
		}
	}
	return result
}

func (lm *LeaseManager) ClearChangeLog() {
	lm.changeLogMu.Lock()
	defer lm.changeLogMu.Unlock()
	lm.changeLog = make([]ChangeLogEntry, 0)
	lm.changeLogID = 0
}

func (lm *LeaseManager) emitEvent(event LeaseEvent) {
	lm.eventChan <- event
}

func (lm *LeaseManager) eventLoop() {
	for event := range lm.eventChan {
		lm.listenerMu.RLock()
		for _, listener := range lm.listeners {
			select {
			case listener <- event:
			default:
			}
		}
		lm.listenerMu.RUnlock()
	}
}

func (lm *LeaseManager) Subscribe() chan LeaseEvent {
	ch := make(chan LeaseEvent, 10)
	lm.listenerMu.Lock()
	lm.listeners = append(lm.listeners, ch)
	lm.listenerMu.Unlock()
	return ch
}

func (lm *LeaseManager) Unsubscribe(ch chan LeaseEvent) {
	lm.listenerMu.Lock()
	for i, listener := range lm.listeners {
		if listener == ch {
			lm.listeners = append(lm.listeners[:i], lm.listeners[i+1:]...)
			break
		}
	}
	lm.listenerMu.Unlock()
	close(ch)
}

func (lm *LeaseManager) RegisterClient(clientID string, ch chan LeaseEvent) chan bool {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	lm.clients[clientID] = ch
	responseChan := make(chan bool, 1)
	lm.clientResponses[clientID] = responseChan
	return responseChan
}

func (lm *LeaseManager) UnregisterClient(clientID string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()
	delete(lm.clients, clientID)
	if ch, exists := lm.clientResponses[clientID]; exists {
		close(ch)
		delete(lm.clientResponses, clientID)
	}
}

func (lm *LeaseManager) AcknowledgeLeaseBreak(clientID string) {
	lm.mu.RLock()
	ch, exists := lm.clientResponses[clientID]
	lm.mu.RUnlock()
	if exists {
		select {
		case ch <- true:
		default:
		}
	}
}

func (lm *LeaseManager) RequestLease(clientID, fileName string, leaseType LeaseType) (*Lease, error) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	leaseID := clientID + "-" + fileName + "-" + string(leaseType)
	
	if lease, exists := lm.leases[leaseID]; exists {
		return lease, nil
	}

	ttl := lm.leaseTTL

	lease := &Lease{
		ID:           leaseID,
		ClientID:     clientID,
		FileName:     fileName,
		Type:         leaseType,
		OriginalType: leaseType,
		State:        LeaseStateGranted,
		GrantedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(ttl),
	}

	lm.leases[leaseID] = lease
	lm.fileLeases[fileName] = append(lm.fileLeases[fileName], lease)

	lm.eventChan <- LeaseEvent{
		Type:     "LEASE_GRANTED",
		ClientID: clientID,
		FileName: fileName,
		LeaseID:  leaseID,
		Time:     time.Now(),
	}

	lm.logChange(ChangeLogEntry{
		LeaseID:   leaseID,
		ClientID:  clientID,
		FileName:  fileName,
		EventType: "LEASE_GRANTED",
		NewState:  LeaseStateGranted,
		NewType:   leaseType,
		Reason:    "Lease requested and granted",
		Timestamp: time.Now(),
	})

	return lease, nil
}

func (lm *LeaseManager) BreakLeasesForFile(fileName, excludingClientID, reason string) []*Lease {
	lm.mu.Lock()

	var leasesToBreak []*Lease
	leases := lm.fileLeases[fileName]

	for _, lease := range leases {
		if lease.ClientID != excludingClientID && lease.State == LeaseStateGranted {
			lease.State = LeaseStateBreaking
			lease.BreakRetryCount = 0
			leasesToBreak = append(leasesToBreak, lease)

			lm.eventChan <- LeaseEvent{
				Type:     "LEASE_BREAKING",
				ClientID: lease.ClientID,
				FileName: fileName,
				LeaseID:  lease.ID,
				Reason:   reason,
				Time:     time.Now(),
			}
		}
	}

	lm.mu.Unlock()

	for _, lease := range leasesToBreak {
		go lm.breakLeaseWithRetry(lease, reason)
	}

	return leasesToBreak
}

func (lm *LeaseManager) breakLeaseWithRetry(lease *Lease, reason string) {
	clientID := lease.ClientID
	leaseID := lease.ID
	fileName := lease.FileName

	var responseChan chan bool
	lm.mu.RLock()
	if ch, exists := lm.clientResponses[clientID]; exists {
		responseChan = ch
	}
	lm.mu.RUnlock()

	for retry := 0; retry < MaxBreakRetries; retry++ {
		lm.mu.Lock()
		lease.BreakRetryCount = retry + 1
		lm.mu.Unlock()

		lm.eventChan <- LeaseEvent{
			Type:       "LEASE_BREAK",
			ClientID:   clientID,
			FileName:   fileName,
			LeaseID:    leaseID,
			Reason:     reason,
			Time:       time.Now(),
			RetryCount: retry + 1,
			MaxRetries: MaxBreakRetries,
		}

		lm.mu.RLock()
		clientChan, clientExists := lm.clients[clientID]
		lm.mu.RUnlock()

		if clientExists {
			select {
			case clientChan <- LeaseEvent{
				Type:       "LEASE_BREAK",
				ClientID:   clientID,
				FileName:   fileName,
				LeaseID:    leaseID,
				Reason:     reason,
				Time:       time.Now(),
				RetryCount: retry + 1,
				MaxRetries: MaxBreakRetries,
			}:
			default:
			}
		}

		select {
		case <-responseChan:
			lm.acknowledgeLeaseBreak(leaseID, "Client acknowledged")
			return
		case <-time.After(BreakRetryInterval):
		}
	}

	lm.eventChan <- LeaseEvent{
		Type:     "LEASE_BREAK_FORCE",
		ClientID: clientID,
		FileName: fileName,
		LeaseID:  leaseID,
		Reason:   "Client unresponsive after 3 retries, force disconnect",
		Time:     time.Now(),
	}

	lm.acknowledgeLeaseBreak(leaseID, "Forced - client unresponsive")
}

func (lm *LeaseManager) acknowledgeLeaseBreak(leaseID, reason string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if lease, exists := lm.leases[leaseID]; exists {
		oldState := lease.State
		lease.State = LeaseStateBroken
		lease.BreakAcked = true

		lm.eventChan <- LeaseEvent{
			Type:     "LEASE_BROKEN",
			ClientID: lease.ClientID,
			FileName: lease.FileName,
			LeaseID:  leaseID,
			Reason:   reason,
			Time:     time.Now(),
		}

		lm.logChange(ChangeLogEntry{
			LeaseID:   leaseID,
			ClientID:  lease.ClientID,
			FileName:  lease.FileName,
			EventType: "LEASE_BROKEN",
			OldState:  oldState,
			NewState:  LeaseStateBroken,
			OldType:   lease.Type,
			NewType:   lease.Type,
			Reason:    reason,
			Timestamp: time.Now(),
		})
	}
}

func (lm *LeaseManager) DowngradeLeasesForFile(fileName, requestingClientID string, reason string) []*Lease {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	var downgradedLeases []*Lease
	leases := lm.fileLeases[fileName]

	for _, lease := range leases {
		if lease.ClientID != requestingClientID && 
		   lease.State == LeaseStateGranted && 
		   (lease.Type == LeaseTypeWrite || lease.Type == LeaseTypeBatch) {
			
			oldType := lease.Type
			lease.Type = LeaseTypeRead
			lease.Downgraded = true
			lease.State = LeaseStateDowngrading
			downgradedLeases = append(downgradedLeases, lease)

			lm.eventChan <- LeaseEvent{
				Type:     "LEASE_DOWNGRADING",
				ClientID: lease.ClientID,
				FileName: fileName,
				LeaseID:  lease.ID,
				Reason:   reason,
				Time:     time.Now(),
				OldType:  oldType,
				NewType:  LeaseTypeRead,
			}

			lm.mu.Unlock()
			if clientChan, exists := lm.clients[lease.ClientID]; exists {
				select {
				case clientChan <- LeaseEvent{
					Type:     "LEASE_DOWNGRADE",
					ClientID: lease.ClientID,
					FileName: fileName,
					LeaseID:  lease.ID,
					Reason:   reason,
					Time:     time.Now(),
					OldType:  oldType,
					NewType:  LeaseTypeRead,
				}:
				default:
				}
			}
			lm.mu.Lock()

			go func(l *Lease, old LeaseType) {
				time.Sleep(50 * time.Millisecond)
				lm.completeLeaseDowngrade(l.ID, old)
			}(lease, oldType)
		}
	}

	return downgradedLeases
}

func (lm *LeaseManager) completeLeaseDowngrade(leaseID string, oldType LeaseType) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if lease, exists := lm.leases[leaseID]; exists {
		lease.State = LeaseStateGranted

		lm.eventChan <- LeaseEvent{
			Type:     "LEASE_DOWNGRADED",
			ClientID: lease.ClientID,
			FileName: lease.FileName,
			LeaseID:  leaseID,
			Reason:   "Downgrade complete",
			Time:     time.Now(),
			OldType:  oldType,
			NewType:  LeaseTypeRead,
		}

		lm.logChange(ChangeLogEntry{
			LeaseID:   leaseID,
			ClientID:  lease.ClientID,
			FileName:  lease.FileName,
			EventType: "LEASE_DOWNGRADED",
			OldState:  LeaseStateDowngrading,
			NewState:  LeaseStateGranted,
			OldType:   oldType,
			NewType:   LeaseTypeRead,
			Reason:    "Downgrade complete",
			Timestamp: time.Now(),
		})
	}
}

func (lm *LeaseManager) ReleaseLease(leaseID string) {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	if lease, exists := lm.leases[leaseID]; exists {
		oldState := lease.State
		delete(lm.leases, leaseID)

		leases := lm.fileLeases[lease.FileName]
		for i, l := range leases {
			if l.ID == leaseID {
				lm.fileLeases[lease.FileName] = append(leases[:i], leases[i+1:]...)
				break
			}
		}

		lm.eventChan <- LeaseEvent{
			Type:     "LEASE_RELEASED",
			ClientID: lease.ClientID,
			FileName: lease.FileName,
			LeaseID:  leaseID,
			Time:     time.Now(),
		}

		lm.logChange(ChangeLogEntry{
			LeaseID:   leaseID,
			ClientID:  lease.ClientID,
			FileName:  lease.FileName,
			EventType: "LEASE_RELEASED",
			OldState:  oldState,
			OldType:   lease.Type,
			NewType:   lease.Type,
			Reason:    "Lease released",
			Timestamp: time.Now(),
		})
	}
}

func (lm *LeaseManager) GetAllLeases() []*Lease {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	leases := make([]*Lease, 0, len(lm.leases))
	for _, lease := range lm.leases {
		leases = append(leases, lease)
	}
	return leases
}

func (lm *LeaseManager) GetLeasesByFile(fileName string) []*Lease {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	if leases, exists := lm.fileLeases[fileName]; exists {
		result := make([]*Lease, len(leases))
		copy(result, leases)
		return result
	}
	return nil
}

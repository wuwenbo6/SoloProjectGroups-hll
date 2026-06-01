package gtpv1

import (
	"container/list"
	"fmt"
	"sync"
	"time"
)

const (
	DefaultSequenceWindowSize = 32
	MaxBufferedPackets        = 100
	PacketBufferTimeout       = 5 * time.Second
)

type BufferedPacket struct {
	SequenceNumber uint16
	Data           []byte
	Timestamp      time.Time
}

type SequenceManager struct {
	mu              sync.RWMutex
	teidManagers    map[uint32]*TEIDSequenceManager
	windowSize      int
	maxBuffered     int
	bufferTimeout   time.Duration
	forwardCallback func(teid uint32, data []byte, seq uint16)
}

type TEIDSequenceManager struct {
	nextExpectedSeq  uint16
	highestReceived  uint16
	buffer           *list.List
	lastForwardTime  time.Time
	packetsReceived  uint64
	packetsForwarded uint64
	packetsDropped   uint64
	packetsReordered uint64
	duplicates       uint64
}

func NewSequenceManager(windowSize int, maxBuffered int, bufferTimeout time.Duration) *SequenceManager {
	if windowSize <= 0 {
		windowSize = DefaultSequenceWindowSize
	}
	if maxBuffered <= 0 {
		maxBuffered = MaxBufferedPackets
	}
	if bufferTimeout <= 0 {
		bufferTimeout = PacketBufferTimeout
	}

	sm := &SequenceManager{
		teidManagers:  make(map[uint32]*TEIDSequenceManager),
		windowSize:    windowSize,
		maxBuffered:   maxBuffered,
		bufferTimeout: bufferTimeout,
	}

	go sm.cleanupRoutine()

	return sm
}

func (sm *SequenceManager) SetForwardCallback(cb func(teid uint32, data []byte, seq uint16)) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.forwardCallback = cb
}

func (sm *SequenceManager) getTEIDManager(teid uint32) *TEIDSequenceManager {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	tm, exists := sm.teidManagers[teid]
	if !exists {
		tm = &TEIDSequenceManager{
			nextExpectedSeq: 0,
			highestReceived: 0,
			buffer:          list.New(),
			lastForwardTime: time.Now(),
		}
		sm.teidManagers[teid] = tm
	}
	return tm
}

func (sm *SequenceManager) HandlePacket(teid uint32, seq uint16, data []byte) bool {
	tm := sm.getTEIDManager(teid)

	sm.mu.Lock()
	defer sm.mu.Unlock()

	tm.packetsReceived++

	if seq == tm.nextExpectedSeq {
		sm.forwardPacket(teid, seq, data, tm)
		tm.nextExpectedSeq++
		tm.lastForwardTime = time.Now()

		sm.processBuffer(teid, tm)
		return true
	}

	if sm.isDuplicate(seq, tm.nextExpectedSeq) {
		tm.duplicates++
		return false
	}

	if sm.isOutsideWindow(seq, tm.nextExpectedSeq) {
		tm.packetsDropped++
		return false
	}

	sm.bufferPacket(teid, seq, data, tm)
	return true
}

func (sm *SequenceManager) isDuplicate(seq, expected uint16) bool {
	diff := int(expected) - int(seq)
	if diff > 0 && diff <= sm.windowSize {
		return true
	}
	return false
}

func (sm *SequenceManager) isOutsideWindow(seq, expected uint16) bool {
	diff := int(seq) - int(expected)
	if diff > sm.windowSize {
		return true
	}
	return false
}

func (sm *SequenceManager) forwardPacket(teid uint32, seq uint16, data []byte, tm *TEIDSequenceManager) {
	tm.packetsForwarded++
	if sm.forwardCallback != nil {
		sm.forwardCallback(teid, data, seq)
	}
}

func (sm *SequenceManager) bufferPacket(teid uint32, seq uint16, data []byte, tm *TEIDSequenceManager) {
	if tm.buffer.Len() >= sm.maxBuffered {
		tm.packetsDropped++
		return
	}

	pkt := &BufferedPacket{
		SequenceNumber: seq,
		Data:           data,
		Timestamp:      time.Now(),
	}

	inserted := false
	for e := tm.buffer.Front(); e != nil; e = e.Next() {
		buffered := e.Value.(*BufferedPacket)
		if seq < buffered.SequenceNumber {
			tm.buffer.InsertBefore(pkt, e)
			inserted = true
			break
		} else if seq == buffered.SequenceNumber {
			tm.duplicates++
			return
		}
	}

	if !inserted {
		tm.buffer.PushBack(pkt)
	}

	if seq > tm.highestReceived {
		tm.highestReceived = seq
	}
}

func (sm *SequenceManager) processBuffer(teid uint32, tm *TEIDSequenceManager) {
	for tm.buffer.Len() > 0 {
		front := tm.buffer.Front()
		pkt := front.Value.(*BufferedPacket)

		if pkt.SequenceNumber == tm.nextExpectedSeq {
			tm.buffer.Remove(front)
			sm.forwardPacket(teid, pkt.SequenceNumber, pkt.Data, tm)
			tm.nextExpectedSeq++
			tm.packetsReordered++
			tm.lastForwardTime = time.Now()
		} else if pkt.SequenceNumber < tm.nextExpectedSeq {
			tm.buffer.Remove(front)
			tm.duplicates++
		} else {
			break
		}
	}
}

func (sm *SequenceManager) cleanupRoutine() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		sm.cleanupExpired()
	}
}

func (sm *SequenceManager) cleanupExpired() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	now := time.Now()
	for _, tm := range sm.teidManagers {
		if tm.buffer.Len() == 0 {
			continue
		}

		var next *list.Element
		for e := tm.buffer.Front(); e != nil; e = next {
			next = e.Next()
			pkt := e.Value.(*BufferedPacket)

			if now.Sub(pkt.Timestamp) > sm.bufferTimeout {
				tm.buffer.Remove(e)
				tm.packetsDropped++
			}
		}
	}
}

func (sm *SequenceManager) GetStats(teid uint32) map[string]uint64 {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	tm, exists := sm.teidManagers[teid]
	if !exists {
		return nil
	}

	return map[string]uint64{
		"packetsReceived":  tm.packetsReceived,
		"packetsForwarded": tm.packetsForwarded,
		"packetsDropped":   tm.packetsDropped,
		"packetsReordered": tm.packetsReordered,
		"duplicates":       tm.duplicates,
		"buffered":         uint64(tm.buffer.Len()),
		"nextExpectedSeq":  uint64(tm.nextExpectedSeq),
		"highestReceived":  uint64(tm.highestReceived),
	}
}

func (sm *SequenceManager) GetAllStats() map[uint32]map[string]uint64 {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	stats := make(map[uint32]map[string]uint64, len(sm.teidManagers))
	for teid, tm := range sm.teidManagers {
		stats[teid] = map[string]uint64{
			"packetsReceived":  tm.packetsReceived,
			"packetsForwarded": tm.packetsForwarded,
			"packetsDropped":   tm.packetsDropped,
			"packetsReordered": tm.packetsReordered,
			"duplicates":       tm.duplicates,
			"buffered":         uint64(tm.buffer.Len()),
			"nextExpectedSeq":  uint64(tm.nextExpectedSeq),
			"highestReceived":  uint64(tm.highestReceived),
		}
	}
	return stats
}

func (sm *SequenceManager) ResetTEID(teid uint32) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	delete(sm.teidManagers, teid)
}

func (sm *SequenceManager) ResetAll() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.teidManagers = make(map[uint32]*TEIDSequenceManager)
}

func (sm *SequenceManager) GenerateNextSequence(teid uint32) uint16 {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	tm, exists := sm.teidManagers[teid]
	if !exists {
		tm = &TEIDSequenceManager{
			nextExpectedSeq: 0,
			highestReceived: 0,
			buffer:          list.New(),
			lastForwardTime: time.Now(),
		}
		sm.teidManagers[teid] = tm
	}

	seq := tm.highestReceived
	tm.highestReceived++
	return seq
}

func (sm *SequenceManager) FlushBuffer(teid uint32) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	tm, exists := sm.teidManagers[teid]
	if !exists {
		return 0
	}

	count := tm.buffer.Len()
	tm.buffer.Init()
	return count
}

func (sm *SequenceManager) ForceForwardAll(teid uint32) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	tm, exists := sm.teidManagers[teid]
	if !exists || tm.buffer.Len() == 0 {
		return 0
	}

	forwarded := 0
	for tm.buffer.Len() > 0 {
		front := tm.buffer.Front()
		pkt := front.Value.(*BufferedPacket)
		tm.buffer.Remove(front)
		sm.forwardPacket(teid, pkt.SequenceNumber, pkt.Data, tm)
		tm.nextExpectedSeq = pkt.SequenceNumber + 1
		forwarded++
	}

	return forwarded
}

func (sm *SequenceManager) DumpBuffer(teid uint32) []uint16 {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	tm, exists := sm.teidManagers[teid]
	if !exists {
		return nil
	}

	seqs := make([]uint16, 0, tm.buffer.Len())
	for e := tm.buffer.Front(); e != nil; e = e.Next() {
		pkt := e.Value.(*BufferedPacket)
		seqs = append(seqs, pkt.SequenceNumber)
	}
	return seqs
}

func (sm *SequenceManager) String() string {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	return fmt.Sprintf("SequenceManager: %d TEIDs, window=%d, maxBuffer=%d, timeout=%v",
		len(sm.teidManagers), sm.windowSize, sm.maxBuffered, sm.bufferTimeout)
}

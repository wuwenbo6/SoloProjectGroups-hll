package ptp

import (
	"sync"
)

type Master struct {
	clock          *Clock
	network       *NetworkSimulator
	sequenceID    uint16
	portID        uint16
	mu            sync.Mutex
	pdelayRecords  map[uint16]Timestamp
}

func NewMaster(portID uint16, clock *Clock, network *NetworkSimulator) *Master {
	return &Master{
		clock:        clock,
		network:      network,
		sequenceID:   0,
		portID:     portID,
		pdelayRecords: make(map[uint16]Timestamp),
	}
}

func (m *Master) SendSync() *PTPMessage {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.sequenceID++
	return &PTPMessage{
		MsgType:      MsgSync,
		SequenceID: m.sequenceID,
		SourcePortID: m.portID,
		Timestamp:  m.clock.Now(),
	}
}

func (m *Master) SendFollowUp(syncMsg *PTPMessage) *PTPMessage {
	return &PTPMessage{
		MsgType:      MsgFollowUp,
		SequenceID:   syncMsg.SequenceID,
		SourcePortID: m.portID,
		Timestamp:  syncMsg.Timestamp,
		CorrectionNs: 0,
	}
}

func (m *Master) HandlePdelayReq(req *PTPMessage) *PTPMessage {
	m.mu.Lock()
	defer m.mu.Unlock()

	t2 := m.clock.Now()
	t3 := t2

	return &PTPMessage{
		MsgType:          MsgPdelayResp,
		SequenceID:       req.SequenceID,
		SourcePortID:     m.portID,
		Timestamp:        t3,
		ReceiveTimestamp: t2,
	}
}

func (m *Master) GetT4(sequenceID uint16) (Timestamp, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	t4, ok := m.pdelayRecords[sequenceID]
	return t4, ok
}

func (m *Master) ClearPdelayRecord(sequenceID uint16) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.pdelayRecords, sequenceID)
}

func (m *Master) Now() Timestamp {
	return m.clock.Now()
}

func (m *Master) GetClock() *Clock {
	return m.clock
}

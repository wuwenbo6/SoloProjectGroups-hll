package ptp

import (
	"sync"
	"time"
)

type Slave struct {
	clock            *Clock
	network          *NetworkSimulator
	master           *Master
	portID           uint16
	sequenceID       uint16
	mu               sync.Mutex
	lastSyncTime     Timestamp
	lastPathDelay    int64
	lastOffset       int64
	syncCount        uint64
	metricsHistory   []SyncMetrics
	maxHistorySize   int

	t2Records        map[uint16]Timestamp
	t3Records        map[uint16]Timestamp

	freqCorrection   float64
	freqIntegral     float64
	rateRatioEst     *RateRatioEstimator
	lastRateRatio    float64
}

type PIController struct {
	kp          float64
	ki          float64
	integral    float64
	maxIntegral float64
}

func NewPIController(kp, ki, maxIntegral float64) *PIController {
	return &PIController{
		kp:          kp,
		ki:          ki,
		integral:    0,
		maxIntegral: maxIntegral,
	}
}

func (pi *PIController) Update(offset int64, dt time.Duration) float64 {
	pi.integral += float64(offset) * dt.Seconds()
	if pi.integral > pi.maxIntegral {
		pi.integral = pi.maxIntegral
	} else if pi.integral < -pi.maxIntegral {
		pi.integral = -pi.maxIntegral
	}

	return pi.kp*float64(offset) + pi.ki*pi.integral
}

func (pi *PIController) Reset() {
	pi.integral = 0
}

func NewSlave(portID uint16, clock *Clock, network *NetworkSimulator, master *Master) *Slave {
	return &Slave{
		clock:           clock,
		network:         network,
		master:          master,
		portID:          portID,
		sequenceID:      0,
		t2Records:       make(map[uint16]Timestamp),
		t3Records:       make(map[uint16]Timestamp),
		maxHistorySize:  1000,
		rateRatioEst:    NewRateRatioEstimator(0.1),
		lastRateRatio:   1.0,
	}
}

func (s *Slave) SendPdelayReq() *PTPMessage {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.sequenceID++
	t1 := s.clock.Now()
	s.t3Records[s.sequenceID] = t1

	return &PTPMessage{
		MsgType:      MsgPdelayReq,
		SequenceID:   s.sequenceID,
		SourcePortID: s.portID,
		Timestamp:    t1,
	}
}

func (s *Slave) ReceiveSync(syncMsg *PTPMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t2 := s.clock.Now()
	s.t2Records[syncMsg.SequenceID] = t2
}

func (s *Slave) RecordSyncReceive(sequenceID uint16, t2 Timestamp) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.t2Records[sequenceID] = t2
}

func (s *Slave) ReceiveFollowUp(followUpMsg *PTPMessage) (int64, int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t2, ok := s.t2Records[followUpMsg.SequenceID]
	if !ok {
		return 0, 0, false
	}

	t1 := followUpMsg.Timestamp

	if s.lastPathDelay == 0 {
		return 0, 0, false
	}

	offset := t2.Nanoseconds() - t1.Nanoseconds() - s.lastPathDelay

	s.lastOffset = offset
	s.lastSyncTime = t2
	s.syncCount++

	rawT2 := t2.Nanoseconds() - s.clock.GetOffset()
	s.lastRateRatio = s.rateRatioEst.Update(t1.Nanoseconds(), rawT2)

	delete(s.t2Records, followUpMsg.SequenceID)

	return offset, s.lastPathDelay, true
}

func (s *Slave) ReceivePdelayResp(respMsg *PTPMessage) (int64, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t1, ok := s.t3Records[respMsg.SequenceID]
	if !ok {
		return 0, false
	}

	t4 := s.clock.Now()
	t2 := respMsg.ReceiveTimestamp
	t3 := respMsg.Timestamp

	pathDelay := ((t4.Nanoseconds() - t1.Nanoseconds()) - (t3.Nanoseconds() - t2.Nanoseconds())) / 2

	s.lastPathDelay = pathDelay

	delete(s.t3Records, respMsg.SequenceID)

	return pathDelay, true
}

func (s *Slave) ReceivePdelayRespWithTimestamps(respMsg *PTPMessage, t4 Timestamp) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t1, ok := s.t3Records[respMsg.SequenceID]
	if !ok {
		return
	}

	t2 := respMsg.ReceiveTimestamp
	t3 := respMsg.Timestamp

	pathDelay := ((t4.Nanoseconds() - t1.Nanoseconds()) - (t3.Nanoseconds() - t2.Nanoseconds())) / 2

	s.lastPathDelay = pathDelay

	delete(s.t3Records, respMsg.SequenceID)
}

func (s *Slave) AdjustClock(offset int64, dt time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	dtSec := dt.Seconds()
	if dtSec < 0.01 {
		dtSec = 0.125
	}

	kp := 2.0 / dtSec
	ki := 0.5 / dtSec

	s.freqIntegral += float64(offset) * dtSec
	maxIntegral := 1e-3
	if s.freqIntegral > maxIntegral {
		s.freqIntegral = maxIntegral
	} else if s.freqIntegral < -maxIntegral {
		s.freqIntegral = -maxIntegral
	}

	s.freqCorrection = -(kp*float64(offset)*1e-9 + ki*s.freqIntegral*1e-9)

	if s.freqCorrection > 5e-3 {
		s.freqCorrection = 5e-3
	} else if s.freqCorrection < -5e-3 {
		s.freqCorrection = -5e-3
	}

	s.clock.SetFreqCorrection(s.freqCorrection)
}

func (s *Slave) RecordMetrics(t1, t2, t3, t4 Timestamp) {
	s.mu.Lock()
	defer s.mu.Unlock()

	masterTime := s.master.Now().Nanoseconds()
	slaveTime := s.clock.Now().Nanoseconds()
	syncError := slaveTime - masterTime

	metrics := SyncMetrics{
		Timestamp:         time.Now(),
		PathDelay:         s.lastPathDelay,
		ClockOffset:       s.lastOffset,
		MasterTime:        masterTime,
		SlaveTime:         slaveTime,
		SyncError:         syncError,
		T1:                t1.Nanoseconds(),
		T2:                t2.Nanoseconds(),
		T3:                t3.Nanoseconds(),
		T4:                t4.Nanoseconds(),
		RateRatio:         s.lastRateRatio,
		MasterTemperature: s.master.GetClock().GetTemperature(),
		SlaveTemperature:  s.clock.GetTemperature(),
		MasterFreqOffset:  s.master.GetClock().GetTempFreqOffset(),
		SlaveFreqOffset:   s.clock.GetTempFreqOffset(),
	}

	s.metricsHistory = append(s.metricsHistory, metrics)
	if len(s.metricsHistory) > s.maxHistorySize {
		s.metricsHistory = s.metricsHistory[1:]
	}
}

func (s *Slave) GetMetrics() []SyncMetrics {
	s.mu.Lock()
	defer s.mu.Unlock()

	result := make([]SyncMetrics, len(s.metricsHistory))
	copy(result, s.metricsHistory)
	return result
}

func (s *Slave) GetLastMetrics() (SyncMetrics, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.metricsHistory) == 0 {
		return SyncMetrics{}, false
	}
	return s.metricsHistory[len(s.metricsHistory)-1], true
}

func (s *Slave) Now() Timestamp {
	return s.clock.Now()
}

func (s *Slave) GetClock() *Clock {
	return s.clock
}

func (s *Slave) GetLastPathDelay() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastPathDelay
}

func (s *Slave) GetLastOffset() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastOffset
}

func (s *Slave) GetSyncCount() uint64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.syncCount
}

func (s *Slave) GetRateRatio() float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.lastRateRatio
}

package ptp

import (
	"sync"
	"time"
)

type Simulator struct {
	master       *Master
	slave        *Slave
	network      *NetworkSimulator
	running      bool
	stopChan     chan struct{}
	mu           sync.Mutex

	syncInterval   time.Duration
	pdelayInterval time.Duration

	lastT1 Timestamp
	lastT2 Timestamp
	lastT3 Timestamp
	lastT4 Timestamp

	metricsCallback func(SyncMetrics)
	config          SimulatorConfig
}

type SimulatorConfig struct {
	MeanDelayNs           int64
	JitterStdDevNs        int64
	PacketLossRate        float64
	MasterClockDrift      float64
	SlaveClockDrift       float64
	SyncInterval          time.Duration
	PdelayInterval        time.Duration
	MasterTempNominal     float64
	SlaveTempNominal      float64
	MasterTempDriftStdDev float64
	SlaveTempDriftStdDev  float64
	MasterTempAlpha       float64
	SlaveTempAlpha        float64
	MasterTempBeta        float64
	SlaveTempBeta         float64
	MasterTempMeanRevK    float64
	SlaveTempMeanRevK     float64
}

func DefaultSimulatorConfig() SimulatorConfig {
	return SimulatorConfig{
		MeanDelayNs:           500 * 1000,
		JitterStdDevNs:        500,
		PacketLossRate:        0.0,
		MasterClockDrift:      0,
		SlaveClockDrift:       50e-6,
		SyncInterval:          125 * time.Millisecond,
		PdelayInterval:        1 * time.Second,
		MasterTempNominal:     25.0,
		SlaveTempNominal:      25.0,
		MasterTempDriftStdDev: 0.0,
		SlaveTempDriftStdDev:  0.0,
		MasterTempAlpha:       0.0,
		SlaveTempAlpha:        -0.5e-6,
		MasterTempBeta:        0.0,
		SlaveTempBeta:         -0.8e-6,
		MasterTempMeanRevK:    0.1,
		SlaveTempMeanRevK:     0.05,
	}
}

func NewSimulator(config SimulatorConfig) *Simulator {
	network := NewNetworkSimulator(config.MeanDelayNs, config.JitterStdDevNs, config.PacketLossRate)

	masterTempModel := NewTemperatureModel(
		config.MasterTempNominal,
		config.MasterTempDriftStdDev,
		config.MasterTempAlpha,
		config.MasterTempBeta,
		config.MasterTempMeanRevK,
	)
	slaveTempModel := NewTemperatureModel(
		config.SlaveTempNominal,
		config.SlaveTempDriftStdDev,
		config.SlaveTempAlpha,
		config.SlaveTempBeta,
		config.SlaveTempMeanRevK,
	)

	refTime := time.Now()
	masterClock := NewClockWithTemp(config.MasterClockDrift, masterTempModel)
	slaveClock := NewClockWithTemp(config.SlaveClockDrift, slaveTempModel)

	masterClock.referenceTime = refTime
	masterClock.referenceNs = refTime.UnixNano()
	masterClock.offset = 0
	masterClock.naturalFreq = 1.0 + config.MasterClockDrift

	slaveClock.referenceTime = refTime
	slaveClock.referenceNs = refTime.UnixNano()
	slaveClock.offset = 0
	slaveClock.naturalFreq = 1.0 + config.SlaveClockDrift

	master := NewMaster(1, masterClock, network)
	slave := NewSlave(2, slaveClock, network, master)

	return &Simulator{
		master:         master,
		slave:          slave,
		network:        network,
		stopChan:       make(chan struct{}),
		syncInterval:   config.SyncInterval,
		pdelayInterval: config.PdelayInterval,
		config:         config,
	}
}

func (s *Simulator) SetMetricsCallback(fn func(SyncMetrics)) {
	s.metricsCallback = fn
}

func (s *Simulator) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.stopChan = make(chan struct{})
	s.mu.Unlock()

	go s.runSyncLoop()
	go s.runPdelayLoop()
	go s.runTemperatureLoop()
}

func (s *Simulator) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}
	s.running = false
	close(s.stopChan)
}

func (s *Simulator) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *Simulator) runSyncLoop() {
	syncTicker := time.NewTicker(s.syncInterval)
	defer syncTicker.Stop()

	lastSyncTime := time.Now()

	for {
		select {
		case <-s.stopChan:
			return
		case <-syncTicker.C:
			s.performSyncCycle(&lastSyncTime)
		}
	}
}

func (s *Simulator) performSyncCycle(lastSyncTime *time.Time) {
	if s.network.ShouldDropPacket() {
		return
	}

	syncMsg := s.master.SendSync()
	s.lastT1 = syncMsg.Timestamp

	delay := s.network.GetDelay()
	t2 := s.slave.GetClock().TimeAfter(delay)
	s.slave.RecordSyncReceive(syncMsg.SequenceID, t2)
	s.lastT2 = t2

	followUpMsg := s.master.SendFollowUp(syncMsg)
	if s.network.ShouldDropPacket() {
		return
	}

	delay2 := s.network.GetDelay()
	_ = delay2

	offset, _, ok := s.slave.ReceiveFollowUp(followUpMsg)
	if !ok {
		return
	}

	now := time.Now()
	dt := now.Sub(*lastSyncTime)
	*lastSyncTime = now

	s.slave.AdjustClock(offset, dt)

	s.slave.RecordMetrics(s.lastT1, s.lastT2, s.lastT3, s.lastT4)

	if metrics, ok := s.slave.GetLastMetrics(); ok {
		if s.metricsCallback != nil {
			s.metricsCallback(metrics)
		}
	}
}

func (s *Simulator) runPdelayLoop() {
	pdelayTicker := time.NewTicker(s.pdelayInterval)
	defer pdelayTicker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-pdelayTicker.C:
			s.performPdelayCycle()
		}
	}
}

func (s *Simulator) performPdelayCycle() {
	if s.network.ShouldDropPacket() {
		return
	}

	pdelayReq := s.slave.SendPdelayReq()
	t1 := pdelayReq.Timestamp

	delay1 := s.network.GetDelay()
	t2 := s.master.GetClock().TimeAfter(delay1)

	t3 := t2

	delay2 := s.network.GetDelay()
	t4 := s.slave.GetClock().TimeAfter(delay1 + delay2)

	pdelayResp := &PTPMessage{
		MsgType:          MsgPdelayResp,
		SequenceID:       pdelayReq.SequenceID,
		SourcePortID:     s.master.portID,
		Timestamp:        t3,
		ReceiveTimestamp: t2,
	}

	s.lastT3 = t1
	s.lastT4 = t3

	s.slave.ReceivePdelayRespWithTimestamps(pdelayResp, t4)
}

func (s *Simulator) runTemperatureLoop() {
	tempTicker := time.NewTicker(100 * time.Millisecond)
	defer tempTicker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-tempTicker.C:
			s.master.GetClock().ApplyTemperatureDrift(100 * time.Millisecond)
			s.slave.GetClock().ApplyTemperatureDrift(100 * time.Millisecond)
		}
	}
}

func (s *Simulator) GetMetrics() []SyncMetrics {
	return s.slave.GetMetrics()
}

func (s *Simulator) GetLastMetrics() (SyncMetrics, bool) {
	return s.slave.GetLastMetrics()
}

func (s *Simulator) GetMaster() *Master {
	return s.master
}

func (s *Simulator) GetSlave() *Slave {
	return s.slave
}

func (s *Simulator) GetNetwork() *NetworkSimulator {
	return s.network
}

func (s *Simulator) Reset() {
	s.Stop()

	config := s.config
	s.network = NewNetworkSimulator(config.MeanDelayNs, config.JitterStdDevNs, config.PacketLossRate)

	masterTempModel := NewTemperatureModel(
		config.MasterTempNominal,
		config.MasterTempDriftStdDev,
		config.MasterTempAlpha,
		config.MasterTempBeta,
		config.MasterTempMeanRevK,
	)
	slaveTempModel := NewTemperatureModel(
		config.SlaveTempNominal,
		config.SlaveTempDriftStdDev,
		config.SlaveTempAlpha,
		config.SlaveTempBeta,
		config.SlaveTempMeanRevK,
	)

	refTime := time.Now()
	masterClock := NewClockWithTemp(config.MasterClockDrift, masterTempModel)
	slaveClock := NewClockWithTemp(config.SlaveClockDrift, slaveTempModel)

	masterClock.referenceTime = refTime
	masterClock.referenceNs = refTime.UnixNano()
	masterClock.offset = 0
	masterClock.naturalFreq = 1.0 + config.MasterClockDrift

	slaveClock.referenceTime = refTime
	slaveClock.referenceNs = refTime.UnixNano()
	slaveClock.offset = 0
	slaveClock.naturalFreq = 1.0 + config.SlaveClockDrift

	s.master = NewMaster(1, masterClock, s.network)
	s.slave = NewSlave(2, slaveClock, s.network, s.master)
}

func CalculatePathDelay(t1, t2, t3, t4 Timestamp) int64 {
	return ((t4.Nanoseconds() - t1.Nanoseconds()) - (t3.Nanoseconds() - t2.Nanoseconds())) / 2
}

func CalculateClockOffset(t1, t2 Timestamp, pathDelay int64) int64 {
	return t2.Nanoseconds() - t1.Nanoseconds() - pathDelay
}

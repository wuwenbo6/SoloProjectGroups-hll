package ptp

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

var (
	mathPi   = math.Pi
	mathCos  = math.Cos
	mathSqrt = math.Sqrt
	mathLog  = math.Log
	randFloat = rand.Float64
)

type Timestamp int64

const (
	Nanosecond  Timestamp = 1
	Microsecond           = 1000 * Nanosecond
	Millisecond           = 1000 * Microsecond
	Second                = 1000 * Millisecond
)

func (t Timestamp) Nanoseconds() int64 {
	return int64(t)
}

func (t Timestamp) Duration() time.Duration {
	return time.Duration(t)
}

type PTPMessageType uint8

const (
	MsgSync        PTPMessageType = 0x00
	MsgFollowUp                   = 0x01
	MsgPdelayReq                  = 0x02
	MsgPdelayResp                 = 0x03
)

type PTPMessage struct {
	MsgType         PTPMessageType
	SequenceID      uint16
	SourcePortID    uint16
	Timestamp       Timestamp
	ReceiveTimestamp Timestamp
	CorrectionNs    int64
}

type SyncMetrics struct {
	Timestamp          time.Time
	PathDelay          int64
	ClockOffset        int64
	MasterTime         int64
	SlaveTime          int64
	SyncError          int64
	T1                 int64
	T2                 int64
	T3                 int64
	T4                 int64
	RateRatio          float64
	MasterTemperature  float64
	SlaveTemperature   float64
	MasterFreqOffset   float64
	SlaveFreqOffset    float64
}

type TemperatureModel struct {
	CurrentTemp      float64
	NominalTemp      float64
	DriftStdDev      float64
	AlphaCoefficient float64
	BetaCoefficient  float64
	MeanReversionK   float64
	UpdateInterval   time.Duration
}

func NewTemperatureModel(nominalTemp, driftStdDev, alpha, beta, meanRevK float64) *TemperatureModel {
	return &TemperatureModel{
		CurrentTemp:      nominalTemp,
		NominalTemp:      nominalTemp,
		DriftStdDev:      driftStdDev,
		AlphaCoefficient: alpha,
		BetaCoefficient:  beta,
		MeanReversionK:   meanRevK,
		UpdateInterval:   100 * time.Millisecond,
	}
}

func (t *TemperatureModel) Step(dt time.Duration) {
	steps := dt.Seconds() / t.UpdateInterval.Seconds()
	if steps < 1 {
		steps = 1
	}

	for i := 0; i < int(steps); i++ {
		noise := gaussianNoise(0, t.DriftStdDev*t.UpdateInterval.Seconds())
		reversion := -t.MeanReversionK * (t.CurrentTemp - t.NominalTemp) * t.UpdateInterval.Seconds()
		t.CurrentTemp += reversion + noise
	}
}

func (t *TemperatureModel) GetFrequencyOffset() float64 {
	deltaT := t.CurrentTemp - t.NominalTemp
	return t.AlphaCoefficient*deltaT + t.BetaCoefficient*deltaT*deltaT
}

func (t *TemperatureModel) GetTemperature() float64 {
	return t.CurrentTemp
}

type RateRatioEstimator struct {
	lastMasterT1  int64
	lastSlaveT2   int64
	rateRatio     float64
	smoothingAlpha float64
	initialized   bool
}

func NewRateRatioEstimator(smoothingAlpha float64) *RateRatioEstimator {
	return &RateRatioEstimator{
		rateRatio:      1.0,
		smoothingAlpha: smoothingAlpha,
	}
}

func (r *RateRatioEstimator) Update(masterT1, slaveT2 int64) float64 {
	if !r.initialized {
		r.lastMasterT1 = masterT1
		r.lastSlaveT2 = slaveT2
		r.initialized = true
		return r.rateRatio
	}

	masterDelta := masterT1 - r.lastMasterT1
	slaveDelta := slaveT2 - r.lastSlaveT2

	if masterDelta == 0 || slaveDelta == 0 {
		return r.rateRatio
	}

	instantRatio := float64(masterDelta) / float64(slaveDelta)

	r.rateRatio = r.smoothingAlpha*instantRatio + (1-r.smoothingAlpha)*r.rateRatio

	r.lastMasterT1 = masterT1
	r.lastSlaveT2 = slaveT2

	return r.rateRatio
}

func (r *RateRatioEstimator) GetRateRatio() float64 {
	return r.rateRatio
}

func (r *RateRatioEstimator) Reset() {
	r.lastMasterT1 = 0
	r.lastSlaveT2 = 0
	r.rateRatio = 1.0
	r.initialized = false
}

type Clock struct {
	mu              sync.RWMutex
	offset          int64
	naturalFreq     float64
	freqCorrection  float64
	driftRate       float64
	referenceTime   time.Time
	referenceNs     int64
	tempModel       *TemperatureModel
	tempFreqOffset  float64
}

func (c *Clock) effectiveFreq() float64 {
	return c.naturalFreq * (1.0 + c.freqCorrection)
}

func NewClock(initialDrift float64) *Clock {
	now := time.Now()
	return &Clock{
		offset:         0,
		naturalFreq:    1.0 + initialDrift,
		freqCorrection: 0,
		driftRate:      initialDrift,
		referenceTime:  now,
		referenceNs:    now.UnixNano(),
	}
}

func NewClockWithTemp(initialDrift float64, tempModel *TemperatureModel) *Clock {
	c := NewClock(initialDrift)
	c.tempModel = tempModel
	return c
}

func (c *Clock) TimeAfter(delayNs int64) Timestamp {
	c.mu.RLock()
	defer c.mu.RUnlock()
	elapsed := time.Since(c.referenceTime).Nanoseconds() + delayNs
	adjustedElapsed := float64(elapsed) * c.effectiveFreq()
	return Timestamp(c.referenceNs + int64(adjustedElapsed) + c.offset)
}

func (c *Clock) Now() Timestamp {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return Timestamp(c.nowLocked())
}

func (c *Clock) nowLocked() int64 {
	elapsed := time.Since(c.referenceTime).Nanoseconds()
	adjustedElapsed := float64(elapsed) * c.effectiveFreq()
	return c.referenceNs + int64(adjustedElapsed) + c.offset
}

func (c *Clock) SetOffset(offset int64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	currentTime := c.nowLocked()
	c.referenceTime = time.Now()
	c.referenceNs = currentTime - offset
	c.offset = offset
}

func (c *Clock) SetFreqCorrection(correction float64) {
	c.mu.Lock()
	defer c.mu.Unlock()

	currentTime := c.nowLocked()
	c.referenceTime = time.Now()
	c.referenceNs = currentTime - c.offset
	c.freqCorrection = correction
}

func (c *Clock) ApplyTemperatureDrift(dt time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.tempModel == nil {
		return
	}

	c.tempModel.Step(dt)
	c.tempFreqOffset = c.tempModel.GetFrequencyOffset()

	currentTime := c.nowLocked()
	c.referenceTime = time.Now()
	c.referenceNs = currentTime - c.offset

	c.naturalFreq = 1.0 + c.driftRate + c.tempFreqOffset
}

func (c *Clock) GetOffset() int64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.offset
}

func (c *Clock) GetFrequency() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.effectiveFreq()
}

func (c *Clock) GetNaturalFreq() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.naturalFreq
}

func (c *Clock) GetFreqCorrection() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.freqCorrection
}

func (c *Clock) GetTempFreqOffset() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.tempFreqOffset
}

func (c *Clock) GetTemperature() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.tempModel == nil {
		return 25.0
	}
	return c.tempModel.GetTemperature()
}

type NetworkSimulator struct {
	meanDelay     int64
	jitterStdDev  int64
	packetLossRate float64
}

func NewNetworkSimulator(meanDelay, jitterStdDev int64, lossRate float64) *NetworkSimulator {
	return &NetworkSimulator{
		meanDelay:     meanDelay,
		jitterStdDev:  jitterStdDev,
		packetLossRate: lossRate,
	}
}

func (n *NetworkSimulator) GetDelay() int64 {
	noise := gaussianNoise(0, float64(n.jitterStdDev))
	return n.meanDelay + int64(noise)
}

func (n *NetworkSimulator) ShouldDropPacket() bool {
	return randFloat() < n.packetLossRate
}

func gaussianNoise(mean, stdDev float64) float64 {
	u1 := randFloat()
	u2 := randFloat()
	z := -2.0 * mathLog(u1)
	if z < 0 {
		z = 0
	}
	return mean + stdDev * mathSqrt(z) * mathCos(2*mathPi*u2)
}

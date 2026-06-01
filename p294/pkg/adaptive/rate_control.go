package adaptive

import (
	"time"
)

const (
	DefaultMinInterval      = 10 * time.Millisecond
	DefaultMaxInterval      = 2 * time.Second
	DefaultIncreaseFactor   = 0.5
	DefaultDecreaseFactor   = 0.3
	DefaultLossThreshold    = 5.0
	DefaultWindowSize       = 10
)

type RateController struct {
	MinInterval        time.Duration
	MaxInterval        time.Duration
	CurrentInterval    time.Duration
	InitialInterval    time.Duration
	IncreaseFactor     float64
	DecreaseFactor     float64
	LossThreshold      float64
	WindowSize         int
	lossHistory        []bool
	currentLossRate    float64
	adjustmentCount    int
	lastAdjustmentTime time.Time
}

type RateControlConfig struct {
	MinInterval     time.Duration
	MaxInterval     time.Duration
	InitialInterval time.Duration
	IncreaseFactor  float64
	DecreaseFactor  float64
	LossThreshold   float64
	WindowSize      int
}

func NewRateController(config RateControlConfig) *RateController {
	rc := &RateController{
		MinInterval:     config.MinInterval,
		MaxInterval:     config.MaxInterval,
		CurrentInterval: config.InitialInterval,
		InitialInterval: config.InitialInterval,
		IncreaseFactor:  config.IncreaseFactor,
		DecreaseFactor:  config.DecreaseFactor,
		LossThreshold:   config.LossThreshold,
		WindowSize:      config.WindowSize,
		lossHistory:     make([]bool, 0, config.WindowSize),
	}

	if rc.MinInterval == 0 {
		rc.MinInterval = DefaultMinInterval
	}
	if rc.MaxInterval == 0 {
		rc.MaxInterval = DefaultMaxInterval
	}
	if rc.CurrentInterval == 0 {
		rc.CurrentInterval = 100 * time.Millisecond
		rc.InitialInterval = rc.CurrentInterval
	}
	if rc.IncreaseFactor == 0 {
		rc.IncreaseFactor = DefaultIncreaseFactor
	}
	if rc.DecreaseFactor == 0 {
		rc.DecreaseFactor = DefaultDecreaseFactor
	}
	if rc.LossThreshold == 0 {
		rc.LossThreshold = DefaultLossThreshold
	}
	if rc.WindowSize == 0 {
		rc.WindowSize = DefaultWindowSize
	}

	return rc
}

func (rc *RateController) RecordResult(success bool) {
	rc.lossHistory = append(rc.lossHistory, success)
	if len(rc.lossHistory) > rc.WindowSize {
		rc.lossHistory = rc.lossHistory[1:]
	}
	rc.updateLossRate()
}

func (rc *RateController) updateLossRate() {
	if len(rc.lossHistory) == 0 {
		rc.currentLossRate = 0
		return
	}

	failed := 0
	for _, success := range rc.lossHistory {
		if !success {
			failed++
		}
	}
	rc.currentLossRate = float64(failed) / float64(len(rc.lossHistory)) * 100
}

func (rc *RateController) GetLossRate() float64 {
	return rc.currentLossRate
}

func (rc *RateController) Adjust() time.Duration {
	rc.lastAdjustmentTime = time.Now()
	rc.adjustmentCount++

	if rc.currentLossRate > rc.LossThreshold {
		rc.increaseInterval()
	} else if rc.currentLossRate == 0 && rc.CurrentInterval > rc.MinInterval {
		rc.decreaseInterval()
	}

	return rc.CurrentInterval
}

func (rc *RateController) increaseInterval() {
	increaseAmount := time.Duration(float64(rc.CurrentInterval) * rc.IncreaseFactor)
	newInterval := rc.CurrentInterval + increaseAmount

	if newInterval > rc.MaxInterval {
		newInterval = rc.MaxInterval
	}

	rc.CurrentInterval = newInterval
}

func (rc *RateController) decreaseInterval() {
	decreaseAmount := time.Duration(float64(rc.CurrentInterval) * rc.DecreaseFactor)
	newInterval := rc.CurrentInterval - decreaseAmount

	if newInterval < rc.MinInterval {
		newInterval = rc.MinInterval
	}

	rc.CurrentInterval = newInterval
}

func (rc *RateController) GetInterval() time.Duration {
	return rc.CurrentInterval
}

func (rc *RateController) Reset() {
	rc.CurrentInterval = rc.InitialInterval
	rc.lossHistory = make([]bool, 0, rc.WindowSize)
	rc.currentLossRate = 0
	rc.adjustmentCount = 0
}

func (rc *RateController) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"current_interval_ms": float64(rc.CurrentInterval.Nanoseconds()) / 1e6,
		"initial_interval_ms": float64(rc.InitialInterval.Nanoseconds()) / 1e6,
		"min_interval_ms":     float64(rc.MinInterval.Nanoseconds()) / 1e6,
		"max_interval_ms":     float64(rc.MaxInterval.Nanoseconds()) / 1e6,
		"loss_rate":           rc.currentLossRate,
		"loss_threshold":      rc.LossThreshold,
		"window_size":         rc.WindowSize,
		"window_filled":       len(rc.lossHistory),
		"adjustment_count":    rc.adjustmentCount,
	}
}

func (rc *RateController) ShouldAdjust() bool {
	return len(rc.lossHistory) >= rc.WindowSize/2
}

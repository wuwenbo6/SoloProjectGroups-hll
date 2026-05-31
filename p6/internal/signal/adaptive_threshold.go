package signal

import (
	"math"
	"sync"
	"time"
)

type AdaptiveThreshold struct {
	mu                   sync.RWMutex
	historyData          map[string][]ThresholdHistory
	maxHistorySize       int
	learningRate         float64
	baseThresholds       []float64
	currentThresholds    map[string][]float64
	lastUpdateTime       map[string]time.Time
	updateInterval       time.Duration
}

type ThresholdHistory struct {
	Timestamp   time.Time
	PeakCurrent float64
	PulseCount  int
}

func NewAdaptiveThreshold(baseLevels []float64) *AdaptiveThreshold {
	return &AdaptiveThreshold{
		historyData:       make(map[string][]ThresholdHistory),
		maxHistorySize:    1000,
		learningRate:      0.1,
		baseThresholds:    baseLevels,
		currentThresholds: make(map[string][]float64),
		lastUpdateTime:    make(map[string]time.Time),
		updateInterval:    1 * time.Hour,
	}
}

func (at *AdaptiveThreshold) AddData(sensorID string, peakCurrent float64, pulseCount int, timestamp time.Time) {
	at.mu.Lock()
	defer at.mu.Unlock()

	history := at.historyData[sensorID]
	history = append(history, ThresholdHistory{
		Timestamp:   timestamp,
		PeakCurrent: peakCurrent,
		PulseCount:  pulseCount,
	})

	if len(history) > at.maxHistorySize {
		history = history[len(history)-at.maxHistorySize:]
	}
	at.historyData[sensorID] = history
}

func (at *AdaptiveThreshold) GetThresholds(sensorID string) []float64 {
	at.mu.RLock()
	thresholds, exists := at.currentThresholds[sensorID]
	lastUpdate := at.lastUpdateTime[sensorID]
	at.mu.RUnlock()

	now := time.Now()
	if !exists || now.Sub(lastUpdate) > at.updateInterval {
		return at.calculateAdaptiveThresholds(sensorID)
	}

	return thresholds
}

func (at *AdaptiveThreshold) calculateAdaptiveThresholds(sensorID string) []float64 {
	at.mu.Lock()
	defer at.mu.Unlock()

	history := at.historyData[sensorID]
	if len(history) < 50 {
		return append([]float64{}, at.baseThresholds...)
	}

	recentData := history
	if len(recentData) > 500 {
		recentData = recentData[len(recentData)-500:]
	}

	mean, std := at.calculateStats(recentData)
	percentile95 := at.percentile(recentData, 95)
	percentile99 := at.percentile(recentData, 99)

	baseLine := mean + std*0.5

	adaptiveThresholds := make([]float64, len(at.baseThresholds))
	for i, base := range at.baseThresholds {
		ratio := base / at.baseThresholds[0]
		adaptive := baseLine * ratio * (1 + std/mean*0.3)

		if i == len(at.baseThresholds)-1 {
			adaptive = math.Max(adaptive, percentile99)
		} else if i >= 2 {
			adaptive = math.Max(adaptive, percentile95*0.8)
		}

		adaptiveThresholds[i] = math.Max(adaptive, base*0.5)
		adaptiveThresholds[i] = math.Min(adaptiveThresholds[i], base*2.0)
	}

	at.currentThresholds[sensorID] = adaptiveThresholds
	at.lastUpdateTime[sensorID] = time.Now()

	return adaptiveThresholds
}

func (at *AdaptiveThreshold) calculateStats(data []ThresholdHistory) (float64, float64) {
	if len(data) == 0 {
		return 0, 0
	}

	sum := 0.0
	for _, d := range data {
		sum += d.PeakCurrent
	}
	mean := sum / float64(len(data))

	variance := 0.0
	for _, d := range data {
		diff := d.PeakCurrent - mean
		variance += diff * diff
	}
	variance /= float64(len(data))

	return mean, math.Sqrt(variance)
}

func (at *AdaptiveThreshold) percentile(data []ThresholdHistory, p int) float64 {
	if len(data) == 0 {
		return 0
	}

	values := make([]float64, len(data))
	for i, d := range data {
		values[i] = d.PeakCurrent
	}

	for i := 0; i < len(values)-1; i++ {
		for j := i + 1; j < len(values); j++ {
			if values[j] < values[i] {
				values[i], values[j] = values[j], values[i]
			}
		}
	}

	index := int(float64(len(values)-1) * float64(p) / 100.0)
	return values[index]
}

func (at *AdaptiveThreshold) GetPollutionLevel(sensorID string, peakCurrent float64, frequencyFactor float64) int {
	thresholds := at.GetThresholds(sensorID)
	adjustedCurrent := peakCurrent * (1 + frequencyFactor*0.5)

	for i := len(thresholds) - 1; i >= 0; i-- {
		if adjustedCurrent >= thresholds[i] {
			return i + 1
		}
	}
	return 0
}

func (at *AdaptiveThreshold) UpdateBaseThresholds(newBase []float64) {
	at.mu.Lock()
	defer at.mu.Unlock()
	at.baseThresholds = append([]float64{}, newBase...)
	at.currentThresholds = make(map[string][]float64)
}

func (at *AdaptiveThreshold) ClearHistory(sensorID string) {
	at.mu.Lock()
	defer at.mu.Unlock()
	delete(at.historyData, sensorID)
	delete(at.currentThresholds, sensorID)
	delete(at.lastUpdateTime, sensorID)
}

type SeasonalThreshold struct {
	hourlyThresholds [24]float64
	dailyThresholds  [7]float64
	monthlyThresholds [12]float64
}

func NewSeasonalThreshold() *SeasonalThreshold {
	st := &SeasonalThreshold{}
	for i := range st.hourlyThresholds {
		st.hourlyThresholds[i] = 1.0
	}
	for i := range st.dailyThresholds {
		st.dailyThresholds[i] = 1.0
	}
	for i := range st.monthlyThresholds {
		st.monthlyThresholds[i] = 1.0
	}
	return st
}

func (st *SeasonalThreshold) GetFactor(t time.Time) float64 {
	hour := t.Hour()
	day := int(t.Weekday())
	month := int(t.Month()) - 1
	return st.hourlyThresholds[hour] * st.dailyThresholds[day] * st.monthlyThresholds[month]
}

func (st *SeasonalThreshold) Train(data []ThresholdHistory) {
	hourlySum := make([]float64, 24)
	hourlyCount := make([]int, 24)
	dailySum := make([]float64, 7)
	dailyCount := make([]int, 7)
	monthlySum := make([]float64, 12)
	monthlyCount := make([]int, 12)

	for _, d := range data {
		hour := d.Timestamp.Hour()
		hourlySum[hour] += d.PeakCurrent
		hourlyCount[hour]++

		day := int(d.Timestamp.Weekday())
		dailySum[day] += d.PeakCurrent
		dailyCount[day]++

		month := int(d.Timestamp.Month()) - 1
		monthlySum[month] += d.PeakCurrent
		monthlyCount[month]++
	}

	totalAvg := 0.0
	totalCount := 0
	for _, cnt := range hourlyCount {
		totalCount += cnt
	}
	if totalCount > 0 {
		for _, sum := range hourlySum {
			totalAvg += sum
		}
		totalAvg /= float64(totalCount)
	}

	if totalAvg > 0 {
		for i := range st.hourlyThresholds {
			if hourlyCount[i] > 0 {
				st.hourlyThresholds[i] = (hourlySum[i] / float64(hourlyCount[i])) / totalAvg
			}
		}
		for i := range st.dailyThresholds {
			if dailyCount[i] > 0 {
				st.dailyThresholds[i] = (dailySum[i] / float64(dailyCount[i])) / totalAvg
			}
		}
		for i := range st.monthlyThresholds {
			if monthlyCount[i] > 0 {
				st.monthlyThresholds[i] = (monthlySum[i] / float64(monthlyCount[i])) / totalAvg
			}
		}
	}
}

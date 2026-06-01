package anomaly

import (
	"fmt"
	"math"
	"sync"
	"time"

	"go.uber.org/zap"

	"log-analyzer/internal/models"
)

type AnomalyDetector struct {
	logger           *zap.Logger
	stats            map[string]*FeatureStats
	statsMutex       sync.RWMutex
	anomalyCallback  func(*AnomalyEvent)
	trainingDuration time.Duration
	isTraining       bool
	trainingStart    time.Time
}

type FeatureStats struct {
	Count     int
	Mean      float64
	Variance  float64
	Min       float64
	Max       float64
	LastUpdate time.Time
}

type AnomalyEvent struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"timestamp"`
	EventType   string                 `json:"event_type"`
	Hostname    string                 `json:"hostname"`
	Feature     string                 `json:"feature"`
	Value       float64                `json:"value"`
	ZScore      float64                `json:"z_score"`
	Threshold   float64                `json:"threshold"`
	Severity    string                 `json:"severity"`
	Description string                 `json:"description"`
	Attributes  map[string]interface{} `json:"attributes"`
}

func NewAnomalyDetector(logger *zap.Logger) *AnomalyDetector {
	detector := &AnomalyDetector{
		logger:           logger,
		stats:            make(map[string]*FeatureStats),
		trainingDuration: 1 * time.Hour,
		isTraining:       true,
		trainingStart:    time.Now(),
	}

	go detector.periodicStatsCleanup()
	return detector
}

func (d *AnomalyDetector) SetAnomalyCallback(cb func(*AnomalyEvent)) {
	d.anomalyCallback = cb
}

func (d *AnomalyDetector) SetTrainingDuration(duration time.Duration) {
	d.trainingDuration = duration
}

func (d *AnomalyDetector) ProcessEvent(event *models.Event) {
	if time.Since(d.trainingStart) > d.trainingDuration {
		d.isTraining = false
	}

	features := d.extractFeatures(event)

	for feature, value := range features {
		key := d.getFeatureKey(event, feature)
		d.updateStats(key, value)

		if !d.isTraining {
			d.checkAnomaly(event, feature, value, key)
		}
	}
}

func (d *AnomalyDetector) extractFeatures(event *models.Event) map[string]float64 {
	features := make(map[string]float64)

	features["event_frequency"] = 1.0

	switch event.Type {
	case "login_failed":
		features["login_failure_rate"] = 1.0
	case "login_success":
		features["login_success_rate"] = 1.0
	}

	return features
}

func (d *AnomalyDetector) getFeatureKey(event *models.Event, feature string) string {
	return event.Hostname + ":" + event.Type + ":" + feature
}

func (d *AnomalyDetector) updateStats(key string, value float64) {
	d.statsMutex.Lock()
	defer d.statsMutex.Unlock()

	stats, exists := d.stats[key]
	if !exists {
		d.stats[key] = &FeatureStats{
			Count:      1,
			Mean:       value,
			Variance:   0,
			Min:        value,
			Max:        value,
			LastUpdate: time.Now(),
		}
		return
	}

	stats.Count++
	oldMean := stats.Mean
	stats.Mean = oldMean + (value-oldMean)/float64(stats.Count)
	stats.Variance = stats.Variance + (value-oldMean)*(value-stats.Mean)
	stats.LastUpdate = time.Now()

	if value < stats.Min {
		stats.Min = value
	}
	if value > stats.Max {
		stats.Max = value
	}
}

func (d *AnomalyDetector) checkAnomaly(event *models.Event, feature string, value float64, key string) {
	d.statsMutex.RLock()
	stats, exists := d.stats[key]
	d.statsMutex.RUnlock()

	if !exists || stats.Count < 10 {
		return
	}

	stdDev := math.Sqrt(stats.Variance / float64(stats.Count))
	if stdDev == 0 {
		return
	}

	zScore := (value - stats.Mean) / stdDev
	threshold := 3.0

	if math.Abs(zScore) > threshold {
		severity := "low"
		if math.Abs(zScore) > 4 {
			severity = "medium"
		}
		if math.Abs(zScore) > 5 {
			severity = "high"
		}

		anomaly := &AnomalyEvent{
			ID:          event.ID,
			Timestamp:   event.Timestamp,
			EventType:   event.Type,
			Hostname:    event.Hostname,
			Feature:     feature,
			Value:       value,
			ZScore:      zScore,
			Threshold:   threshold,
			Severity:    severity,
			Description: d.getAnomalyDescription(feature, zScore, value, stats),
			Attributes:  event.Attributes,
		}

		d.logger.Info("Anomaly detected",
			zap.String("feature", feature),
			zap.Float64("z_score", zScore),
			zap.String("hostname", event.Hostname))

		if d.anomalyCallback != nil {
			d.anomalyCallback(anomaly)
		}
	}
}

func (d *AnomalyDetector) getAnomalyDescription(feature string, zScore float64, value float64, stats *FeatureStats) string {
	direction := "higher"
	if zScore < 0 {
		direction = "lower"
	}

	return fmt.Sprintf("Anomaly in %s: value %.2f is %s than average (mean: %.2f, stddev: %.2f, z-score: %.2f)",
		feature, value, direction, stats.Mean, math.Sqrt(stats.Variance/float64(stats.Count)), zScore)
}

func (d *AnomalyDetector) periodicStatsCleanup() {
	ticker := time.NewTicker(1 * time.Hour)
	for range ticker.C {
		d.statsMutex.Lock()
		cutoff := time.Now().Add(-24 * time.Hour)
		for key, stats := range d.stats {
			if stats.LastUpdate.Before(cutoff) {
				delete(d.stats, key)
			}
		}
		d.statsMutex.Unlock()
	}
}

func (d *AnomalyDetector) GetStats() map[string]*FeatureStats {
	d.statsMutex.RLock()
	defer d.statsMutex.RUnlock()
	
	result := make(map[string]*FeatureStats)
	for k, v := range d.stats {
		result[k] = &FeatureStats{
			Count:      v.Count,
			Mean:       v.Mean,
			Variance:   v.Variance,
			Min:        v.Min,
			Max:        v.Max,
			LastUpdate: v.LastUpdate,
		}
	}
	return result
}

func (d *AnomalyDetector) IsTraining() bool {
	return d.isTraining
}



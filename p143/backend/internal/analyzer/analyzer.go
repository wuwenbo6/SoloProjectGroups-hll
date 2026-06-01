package analyzer

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"sync"
	"sync/atomic"
	"time"

	"trace-backend/internal/storage"
	"trace-backend/pkg/model"
)

type TraceAnalyzer struct {
	esStorage *storage.ElasticsearchStorage
	
	alertConfig    model.AlertConfig
	samplingConfig model.SamplingConfig
	
	alerts      []model.Alert
	alertsMutex sync.RWMutex
	maxAlerts   int
	
	alertCountWindow map[string]int
	windowMutex      sync.Mutex
	
	totalTraces   int64
	sampledTraces int64
	
	traceBuffer map[string][]*model.Span
	bufferMutex sync.Mutex
	bufferSize  int
}

func NewTraceAnalyzer(esStorage *storage.ElasticsearchStorage) *TraceAnalyzer {
	return &TraceAnalyzer{
		esStorage: esStorage,
		alertConfig: model.AlertConfig{
			Enabled:              true,
			SlowTraceThresholdMs: 1000,
			SlowSpanThresholdMs:  500,
			ErrorRateThreshold:   0.05,
			MaxAlertsPerMinute:   60,
		},
		samplingConfig: model.SamplingConfig{
			Enabled:              true,
			SamplingRate:         1.0,
			MinSamplesPerSec:     10,
			SlowTraceAlwaysSample: true,
			ErrorAlwaysSample:    true,
		},
		alerts:             make([]model.Alert, 0, 1000),
		maxAlerts:          10000,
		alertCountWindow:   make(map[string]int),
		traceBuffer:        make(map[string][]*model.Span),
		bufferSize:         10000,
	}
}

func (ta *TraceAnalyzer) SetAlertConfig(config model.AlertConfig) {
	ta.alertConfig = config
}

func (ta *TraceAnalyzer) GetAlertConfig() model.AlertConfig {
	return ta.alertConfig
}

func (ta *TraceAnalyzer) SetSamplingConfig(config model.SamplingConfig) {
	ta.samplingConfig = config
}

func (ta *TraceAnalyzer) GetSamplingConfig() model.SamplingConfig {
	return ta.samplingConfig
}

func (ta *TraceAnalyzer) ShouldSample(traceID string, spans []*model.Span) bool {
	atomic.AddInt64(&ta.totalTraces, 1)
	
	if !ta.samplingConfig.Enabled {
		atomic.AddInt64(&ta.sampledTraces, 1)
		return true
	}
	
	if ta.samplingConfig.SamplingRate >= 1.0 {
		atomic.AddInt64(&ta.sampledTraces, 1)
		return true
	}
	
	totalDuration := ta.calculateTotalDuration(spans)
	hasError := ta.hasError(spans)
	
	if ta.samplingConfig.SlowTraceAlwaysSample && totalDuration > ta.alertConfig.SlowTraceThresholdMs*1000 {
		atomic.AddInt64(&ta.sampledTraces, 1)
		return true
	}
	
	if ta.samplingConfig.ErrorAlwaysSample && hasError {
		atomic.AddInt64(&ta.sampledTraces, 1)
		return true
	}
	
	if ta.shouldSampleByRate() {
		atomic.AddInt64(&ta.sampledTraces, 1)
		return true
	}
	
	return false
}

func (ta *TraceAnalyzer) shouldSampleByRate() bool {
	if ta.samplingConfig.SamplingRate <= 0 {
		return false
	}
	
	randomBytes := make([]byte, 8)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return true
	}
	
	randomValue := float64(binary.LittleEndian.Uint64(randomBytes)) / float64(math.MaxUint64)
	return randomValue < ta.samplingConfig.SamplingRate
}

func (ta *TraceAnalyzer) ProcessTrace(traceID string, spans []*model.Span) []model.Alert {
	var alerts []model.Alert
	
	if !ta.alertConfig.Enabled {
		return alerts
	}
	
	totalDuration := ta.calculateTotalDuration(spans)
	
	if totalDuration > ta.alertConfig.SlowTraceThresholdMs*1000 {
		alert := ta.createSlowTraceAlert(traceID, spans, totalDuration)
		if ta.canCreateAlert(alert.Type) {
			alerts = append(alerts, alert)
			ta.addAlert(alert)
		}
	}
	
	slowSpans := ta.findSlowSpans(spans)
	for _, span := range slowSpans {
		alert := ta.createSlowSpanAlert(traceID, span)
		if ta.canCreateAlert(alert.Type) {
			alerts = append(alerts, alert)
			ta.addAlert(alert)
		}
	}
	
	return alerts
}

func (ta *TraceAnalyzer) calculateTotalDuration(spans []*model.Span) int64 {
	if len(spans) == 0 {
		return 0
	}
	
	minStart := spans[0].StartTime
	maxEnd := spans[0].EndTime
	
	for _, span := range spans {
		if span.StartTime.Before(minStart) {
			minStart = span.StartTime
		}
		if span.EndTime.After(maxEnd) {
			maxEnd = span.EndTime
		}
	}
	
	return maxEnd.Sub(minStart).Microseconds()
}

func (ta *TraceAnalyzer) hasError(spans []*model.Span) bool {
	for _, span := range spans {
		if span.Status.Code == "STATUS_CODE_ERROR" {
			return true
		}
	}
	return false
}

func (ta *TraceAnalyzer) findSlowSpans(spans []*model.Span) []*model.Span {
	var slowSpans []*model.Span
	threshold := ta.alertConfig.SlowSpanThresholdMs * 1000
	
	for _, span := range spans {
		if span.Duration > threshold {
			slowSpans = append(slowSpans, span)
		}
	}
	
	return slowSpans
}

func (ta *TraceAnalyzer) createSlowTraceAlert(traceID string, spans []*model.Span, duration int64) model.Alert {
	threshold := ta.alertConfig.SlowTraceThresholdMs * 1000
	serviceName := ""
	if len(spans) > 0 {
		serviceName = spans[0].ServiceName
	}
	
	severity := "warning"
	if duration > threshold*5 {
		severity = "critical"
	} else if duration > threshold*2 {
		severity = "error"
	}
	
	return model.Alert{
		ID:          generateAlertID(),
		TraceID:     traceID,
		Type:        "slow_trace",
		Severity:    severity,
		Message:     fmtAlertMessage("Trace exceeded threshold", duration, threshold),
		ServiceName: serviceName,
		Duration:    duration,
		Threshold:   threshold,
		CreatedAt:   time.Now(),
		Resolved:    false,
	}
}

func (ta *TraceAnalyzer) createSlowSpanAlert(traceID string, span *model.Span) model.Alert {
	threshold := ta.alertConfig.SlowSpanThresholdMs * 1000
	
	severity := "warning"
	if span.Duration > threshold*5 {
		severity = "critical"
	} else if span.Duration > threshold*2 {
		severity = "error"
	}
	
	return model.Alert{
		ID:          generateAlertID(),
		TraceID:     traceID,
		Type:        "slow_span",
		Severity:    severity,
		Message:     fmtAlertMessage("Span exceeded threshold: "+span.Name, span.Duration, threshold),
		ServiceName: span.ServiceName,
		Duration:    span.Duration,
		Threshold:   threshold,
		CreatedAt:   time.Now(),
		Resolved:    false,
	}
}

func (ta *TraceAnalyzer) canCreateAlert(alertType string) bool {
	ta.windowMutex.Lock()
	defer ta.windowMutex.Unlock()
	
	windowKey := time.Now().Format("2006-01-02-15-04")
	key := windowKey + ":" + alertType
	
	if ta.alertCountWindow[key] >= ta.alertConfig.MaxAlertsPerMinute {
		return false
	}
	
	ta.alertCountWindow[key]++
	return true
}

func (ta *TraceAnalyzer) addAlert(alert model.Alert) {
	ta.alertsMutex.Lock()
	defer ta.alertsMutex.Unlock()
	
	ta.alerts = append([]model.Alert{alert}, ta.alerts...)
	
	if len(ta.alerts) > ta.maxAlerts {
		ta.alerts = ta.alerts[:ta.maxAlerts]
	}
	
	log.Printf("ALERT [%s] %s: %s", alert.Severity, alert.Type, alert.Message)
}

func (ta *TraceAnalyzer) GetAlerts(limit int, resolved *bool, alertType string) []model.Alert {
	ta.alertsMutex.RLock()
	defer ta.alertsMutex.RUnlock()
	
	result := make([]model.Alert, 0, limit)
	count := 0
	
	for _, alert := range ta.alerts {
		if resolved != nil && alert.Resolved != *resolved {
			continue
		}
		if alertType != "" && alert.Type != alertType {
			continue
		}
		
		result = append(result, alert)
		count++
		if count >= limit {
			break
		}
	}
	
	return result
}

func (ta *TraceAnalyzer) ResolveAlert(alertID string) bool {
	ta.alertsMutex.Lock()
	defer ta.alertsMutex.Unlock()
	
	for i := range ta.alerts {
		if ta.alerts[i].ID == alertID {
			ta.alerts[i].Resolved = true
			ta.alerts[i].ResolvedAt = time.Now()
			return true
		}
	}
	
	return false
}

func (ta *TraceAnalyzer) GetSamplingStats() map[string]interface{} {
	total := atomic.LoadInt64(&ta.totalTraces)
	sampled := atomic.LoadInt64(&ta.sampledTraces)
	
	rate := 1.0
	if total > 0 {
		rate = float64(sampled) / float64(total)
	}
	
	return map[string]interface{}{
		"total_traces":   total,
		"sampled_traces": sampled,
		"actual_rate":    rate,
		"configured_rate": ta.samplingConfig.SamplingRate,
	}
}

func (ta *TraceAnalyzer) StartCleanupRoutine() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		
		for range ticker.C {
			ta.cleanupOldWindowCounts()
		}
	}()
}

func (ta *TraceAnalyzer) cleanupOldWindowCounts() {
	ta.windowMutex.Lock()
	defer ta.windowMutex.Unlock()
	
	currentKeyPrefix := time.Now().Format("2006-01-02-15-04")
	for key := range ta.alertCountWindow {
		if len(key) > len(currentKeyPrefix) && key[:len(currentKeyPrefix)] != currentKeyPrefix {
			delete(ta.alertCountWindow, key)
		}
	}
}

func generateAlertID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func fmtAlertMessage(prefix string, duration, threshold int64) string {
	durationMs := float64(duration) / 1000.0
	thresholdMs := float64(threshold) / 1000.0
	return fmt.Sprintf("%s - %.2fms (threshold: %.2fms)", prefix, durationMs, thresholdMs)
}

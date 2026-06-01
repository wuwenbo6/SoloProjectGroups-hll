package alerts

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"sip-analyzer/database"
)

const (
	SeverityCritical = "critical"
	SeverityHigh     = "high"
	SeverityMedium   = "medium"
	SeverityLow      = "low"

	AlertTypeRegistrationFlood = "registration_flood"
	AlertTypeCallFlood         = "call_flood"
	AlertTypeInvalidMessages   = "invalid_messages"
	AlertTypeHighLossRate      = "high_loss_rate"
	AlertTypeHighJitter        = "high_jitter"
	AlertTypeLowMOS            = "low_mos"
	AlertTypeLongCall          = "long_call"
	AlertTypeFailedCall        = "failed_call"
)

type Config struct {
	RegisterThreshold  int           `json:"register_threshold"`
	RegisterWindow     time.Duration `json:"register_window"`
	CallThreshold      int           `json:"call_threshold"`
	CallWindow         time.Duration `json:"call_window"`
	LossRateThreshold  float64       `json:"loss_rate_threshold"`
	JitterThreshold    float64       `json:"jitter_threshold_ms"`
	MOSThreshold       float64       `json:"mos_threshold"`
	LongCallThreshold  time.Duration `json:"long_call_threshold"`
	CooldownPeriod     time.Duration `json:"cooldown_period"`
}

type DetectionState struct {
	Timestamps []time.Time
	LastAlert  time.Time
}

type Detector struct {
	db           *database.Database
	config       Config
	regState     map[string]*DetectionState
	callState    map[string]*DetectionState
	ipState      map[string]*DetectionState
	alertedCalls map[string]bool
	mu           sync.Mutex
}

func DefaultConfig() Config {
	return Config{
		RegisterThreshold: 20,
		RegisterWindow:    10 * time.Second,
		CallThreshold:     10,
		CallWindow:        10 * time.Second,
		LossRateThreshold: 5.0,
		JitterThreshold:   30.0,
		MOSThreshold:      3.0,
		LongCallThreshold: 2 * time.Hour,
		CooldownPeriod:    30 * time.Second,
	}
}

func NewDetector(db *database.Database) *Detector {
	return &Detector{
		db:           db,
		config:       DefaultConfig(),
		regState:     make(map[string]*DetectionState),
		callState:    make(map[string]*DetectionState),
		ipState:      make(map[string]*DetectionState),
		alertedCalls: make(map[string]bool),
	}
}

func (d *Detector) SetConfig(cfg Config) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.config = cfg
}

func (d *Detector) ProcessSIPMessage(msg *database.SIPMessage) {
	if strings.ToUpper(msg.Method) == "REGISTER" {
		d.checkRegistrationFlood(msg)
	} else if strings.ToUpper(msg.Method) == "INVITE" && msg.StatusCode == 0 {
		d.checkCallFlood(msg)
	}

	if msg.StatusCode >= 400 && msg.StatusCode < 600 {
		d.checkFailedCall(msg)
	}
}

func (d *Detector) checkRegistrationFlood(msg *database.SIPMessage) {
	d.mu.Lock()
	defer d.mu.Unlock()

	key := msg.SourceIP
	state := d.getState(d.regState, key)
	now := time.Now()

	state.Timestamps = append(state.Timestamps, now)
	state.Timestamps = d.pruneTimestamps(state.Timestamps, d.config.RegisterWindow)

	if len(state.Timestamps) >= d.config.RegisterThreshold {
		if now.Sub(state.LastAlert) >= d.config.CooldownPeriod {
			alert := &database.Alert{
				AlertType: AlertTypeRegistrationFlood,
				Severity:  SeverityHigh,
				Message:   fmt.Sprintf("Registration flood detected from %s: %d REGISTER in %v",
					msg.SourceIP, len(state.Timestamps), d.config.RegisterWindow),
				SourceIP: msg.SourceIP,
				User:     msg.FromUser,
				Count:    len(state.Timestamps),
				Details: fmt.Sprintf("Threshold: %d, Window: %v, From user: %s",
					d.config.RegisterThreshold, d.config.RegisterWindow, msg.FromUser),
				Timestamp: now,
			}
			d.db.InsertAlert(alert)
			state.LastAlert = now
			state.Timestamps = state.Timestamps[:0]
		}
	}
}

func (d *Detector) checkCallFlood(msg *database.SIPMessage) {
	d.mu.Lock()
	defer d.mu.Unlock()

	key := msg.SourceIP
	state := d.getState(d.callState, key)
	now := time.Now()

	state.Timestamps = append(state.Timestamps, now)
	state.Timestamps = d.pruneTimestamps(state.Timestamps, d.config.CallWindow)

	if len(state.Timestamps) >= d.config.CallThreshold {
		if now.Sub(state.LastAlert) >= d.config.CooldownPeriod {
			alert := &database.Alert{
				AlertType: AlertTypeCallFlood,
				Severity:  SeverityCritical,
				Message:   fmt.Sprintf("Call flood detected from %s: %d INVITE in %v",
					msg.SourceIP, len(state.Timestamps), d.config.CallWindow),
				SourceIP: msg.SourceIP,
				User:     msg.FromUser,
				Count:    len(state.Timestamps),
				Details: fmt.Sprintf("Threshold: %d, Window: %v, Calling: %s@%s",
					d.config.CallThreshold, d.config.CallWindow, msg.ToUser, msg.ToHost),
				Timestamp: now,
			}
			d.db.InsertAlert(alert)
			state.LastAlert = now
			state.Timestamps = state.Timestamps[:0]
		}
	}
}

func (d *Detector) checkFailedCall(msg *database.SIPMessage) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.alertedCalls[msg.CallID] {
		return
	}

	importantFailures := map[int]string{
		401: "Unauthorized",
		403: "Forbidden",
		404: "Not Found",
		408: "Request Timeout",
		480: "Temporarily Unavailable",
		486: "Busy Here",
		487: "Request Terminated",
		488: "Not Acceptable Here",
		500: "Server Internal Error",
		503: "Service Unavailable",
		603: "Decline",
	}

	if reason, ok := importantFailures[msg.StatusCode]; ok {
		severity := SeverityMedium
		if msg.StatusCode >= 500 {
			severity = SeverityHigh
		}

		alert := &database.Alert{
			AlertType: AlertTypeFailedCall,
			Severity:  severity,
			Message:   fmt.Sprintf("Call failed with %d %s: %s -> %s",
				msg.StatusCode, reason, msg.FromUser, msg.ToUser),
			SourceIP: msg.SourceIP,
			User:     msg.FromUser,
			CallID:   msg.CallID,
			Details: fmt.Sprintf("Status: %d %s, From: %s@%s, To: %s@%s",
				msg.StatusCode, reason, msg.FromUser, msg.FromHost, msg.ToUser, msg.ToHost),
			Timestamp: time.Now(),
		}
		d.db.InsertAlert(alert)
		d.alertedCalls[msg.CallID] = true
	}
}

func (d *Detector) CheckRTPQuality(stream *database.RTPStream) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.alertedCalls[stream.CallID] {
		return
	}

	alerted := false
	now := time.Now()

	if stream.LossRate > d.config.LossRateThreshold {
		alert := &database.Alert{
			AlertType: AlertTypeHighLossRate,
			Severity:  SeverityMedium,
			Message:   fmt.Sprintf("High packet loss rate: %.2f%% on call %s",
				stream.LossRate, stream.CallID),
			SourceIP: stream.SourceIP,
			CallID:   stream.CallID,
			Details: fmt.Sprintf("Loss: %.2f%%, Threshold: %.2f%%, Codec: %s, Packets: %d",
				stream.LossRate, d.config.LossRateThreshold, stream.Codec, stream.TotalPackets),
			Timestamp: now,
		}
		d.db.InsertAlert(alert)
		alerted = true
	}

	if stream.MaxJitter > d.config.JitterThreshold {
		alert := &database.Alert{
			AlertType: AlertTypeHighJitter,
			Severity:  SeverityMedium,
			Message:   fmt.Sprintf("High jitter detected: %.2f ms on call %s",
				stream.MaxJitter, stream.CallID),
			SourceIP: stream.SourceIP,
			CallID:   stream.CallID,
			Details: fmt.Sprintf("Max Jitter: %.2f ms, Avg Jitter: %.2f ms, Threshold: %.2f ms",
				stream.MaxJitter, stream.AvgJitter, d.config.JitterThreshold),
			Timestamp: now,
		}
		d.db.InsertAlert(alert)
		alerted = true
	}

	if stream.MOSScore > 0 && stream.MOSScore < d.config.MOSThreshold {
		alert := &database.Alert{
			AlertType: AlertTypeLowMOS,
			Severity:  SeverityHigh,
			Message:   fmt.Sprintf("Low MOS score: %.2f on call %s",
				stream.MOSScore, stream.CallID),
			SourceIP: stream.SourceIP,
			CallID:   stream.CallID,
			Details: fmt.Sprintf("MOS: %.2f, Threshold: %.2f, Loss: %.2f%%, Jitter: %.2f ms",
				stream.MOSScore, d.config.MOSThreshold, stream.LossRate, stream.AvgJitter),
			Timestamp: now,
		}
		d.db.InsertAlert(alert)
		alerted = true
	}

	if time.Duration(stream.Duration)*time.Millisecond > d.config.LongCallThreshold {
		alert := &database.Alert{
			AlertType: AlertTypeLongCall,
			Severity:  SeverityLow,
			Message:   fmt.Sprintf("Unusually long call: %v for call %s",
				time.Duration(stream.Duration)*time.Millisecond, stream.CallID),
			SourceIP: stream.SourceIP,
			CallID:   stream.CallID,
			Details: fmt.Sprintf("Duration: %v, Threshold: %v, From: %s, To: %s",
				time.Duration(stream.Duration)*time.Millisecond,
				d.config.LongCallThreshold,
				stream.SourceIP, stream.DestIP),
			Timestamp: now,
		}
		d.db.InsertAlert(alert)
		alerted = true
	}

	if alerted {
		d.alertedCalls[stream.CallID] = true
	}
}

func (d *Detector) getState(stateMap map[string]*DetectionState, key string) *DetectionState {
	state, exists := stateMap[key]
	if !exists {
		state = &DetectionState{
			Timestamps: make([]time.Time, 0),
		}
		stateMap[key] = state
	}
	return state
}

func (d *Detector) pruneTimestamps(timestamps []time.Time, window time.Duration) []time.Time {
	cutoff := time.Now().Add(-window)
	idx := 0
	for ; idx < len(timestamps); idx++ {
		if timestamps[idx].After(cutoff) {
			break
		}
	}
	if idx > 0 {
		return timestamps[idx:]
	}
	return timestamps
}

func (d *Detector) CleanupOldStates() {
	d.mu.Lock()
	defer d.mu.Unlock()

	cutoff := time.Now().Add(-10 * time.Minute)
	pruneMap(d.regState, cutoff)
	pruneMap(d.callState, cutoff)
	pruneMap(d.ipState, cutoff)

	for callID := range d.alertedCalls {
		delete(d.alertedCalls, callID)
	}
}

func pruneMap(stateMap map[string]*DetectionState, cutoff time.Time) {
	for key, state := range stateMap {
		if len(state.Timestamps) > 0 {
			latest := state.Timestamps[len(state.Timestamps)-1]
			if latest.Before(cutoff) {
				delete(stateMap, key)
			}
		} else if state.LastAlert.Before(cutoff) {
			delete(stateMap, key)
		}
	}
}

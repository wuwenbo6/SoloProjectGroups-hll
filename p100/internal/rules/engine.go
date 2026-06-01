package rules

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/robertkrimen/otto"
	"go.uber.org/zap"

	"log-analyzer/internal/es"
	"log-analyzer/internal/models"
)

type RuleEngine struct {
	es             *es.Client
	logger         *zap.Logger
	rules          map[string]*models.Rule
	compiledRules  map[string]*CompiledRule
	eventBuffer    map[string][]*models.Event
	triggeredAlerts map[string]time.Time
	bufferMutex    sync.RWMutex
	windowSeconds  int
	alertCallback  func(*models.Alert)
}

type CompiledRule struct {
	Rule       *models.Rule
	VM         *otto.Otto
	CompiledAt time.Time
}

func NewRuleEngine(es *es.Client, windowSeconds int, logger *zap.Logger) *RuleEngine {
	engine := &RuleEngine{
		es:              es,
		logger:          logger,
		rules:           make(map[string]*models.Rule),
		compiledRules:   make(map[string]*CompiledRule),
		eventBuffer:     make(map[string][]*models.Event),
		triggeredAlerts: make(map[string]time.Time),
		windowSeconds:   windowSeconds,
	}

	go engine.cleanupOldEvents()
	go engine.cleanupTriggeredAlerts()
	return engine
}

func (e *RuleEngine) SetAlertCallback(cb func(*models.Alert)) {
	e.alertCallback = cb
}

func (e *RuleEngine) LoadRules() error {
	query := map[string]interface{}{
		"query": map[string]interface{}{
			"term": map[string]interface{}{
				"enabled": true,
			},
		},
	}

	docs, err := e.es.Search("rules", query, 1000)
	if err != nil {
		e.logger.Warn("Failed to load rules from ES", zap.Error(err))
		return e.loadDefaultRules()
	}

	for _, doc := range docs {
		data, _ := json.Marshal(doc)
		var rule models.Rule
		if err := json.Unmarshal(data, &rule); err == nil {
			e.rules[rule.ID] = &rule
			e.compileRule(&rule)
		}
	}

	e.logger.Info("Loaded rules", zap.Int("count", len(e.rules)))
	return nil
}

func (e *RuleEngine) compileRule(rule *models.Rule) {
	vm := otto.New()
	if rule.Condition != "" && rule.Condition != "true" {
		vm.Compile("condition", rule.Condition)
	}
	e.compiledRules[rule.ID] = &CompiledRule{
		Rule:       rule,
		VM:         vm,
		CompiledAt: time.Now(),
	}
}

func (e *RuleEngine) loadDefaultRules() error {
	defaultRules := []*models.Rule{
		{
			ID:          "brute_force_detection",
			Name:        "Brute Force Attack Detection",
			Description: "Detects multiple failed login attempts followed by a successful login",
			Severity:    "high",
			Enabled:     true,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			EventType:   "login",
			Condition:   "event.type == 'login_failed'",
			Correlation: &models.CorrelationConfig{
				Type:              "sequence",
				GroupByField:      "username",
				TimeWindowSeconds: 300,
				MinCount:          3,
				EventSequence: []models.EventCondition{
					{
						EventType: "login_failed",
						Filters:   map[string]string{},
					},
					{
						EventType: "login_success",
						Filters:   map[string]string{},
					},
				},
			},
			Action: "create_alert",
		},
		{
			ID:          "multiple_login_failures",
			Name:        "Multiple Login Failures",
			Description: "Detects 5 or more failed login attempts within 5 minutes",
			Severity:    "medium",
			Enabled:     true,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			EventType:   "login_failed",
			Condition:   "true",
			Correlation: &models.CorrelationConfig{
				Type:              "count",
				GroupByField:      "username",
				TimeWindowSeconds: 300,
				MinCount:          5,
			},
			Action: "create_alert",
		},
	}

	for _, rule := range defaultRules {
		e.rules[rule.ID] = rule
		e.compileRule(rule)
		e.es.IndexDocument("rules", rule.ID, rule)
	}

	e.logger.Info("Loaded default rules", zap.Int("count", len(defaultRules)))
	return nil
}

func (e *RuleEngine) AddRule(rule *models.Rule) {
	e.rules[rule.ID] = rule
	e.compileRule(rule)
	e.es.IndexDocument("rules", rule.ID, rule)
}

func (e *RuleEngine) GetRules() []*models.Rule {
	rules := make([]*models.Rule, 0, len(e.rules))
	for _, rule := range e.rules {
		rules = append(rules, rule)
	}
	return rules
}

func (e *RuleEngine) GetRule(id string) *models.Rule {
	return e.rules[id]
}

func (e *RuleEngine) DeleteRule(id string) {
	delete(e.rules, id)
}

func (e *RuleEngine) ProcessLogEntry(logEntry *models.LogEntry) {
	event := e.extractEvent(logEntry)
	if event == nil {
		return
	}

	e.es.IndexDocument("events", event.ID, event)
	e.bufferEvent(event)
	e.evaluateRules(event)
}

func (e *RuleEngine) extractEvent(logEntry *models.LogEntry) *models.Event {
	eventType := ""

	if logEntry.Source == "syslog" {
		if et, ok := logEntry.Fields["event_type"].(string); ok {
			eventType = et
		} else if contains(logEntry.Message, "Failed password") {
			eventType = "login_failed"
		} else if contains(logEntry.Message, "Accepted password") {
			eventType = "login_success"
		}
	}

	if eventType == "" {
		return nil
	}

	return &models.Event{
		ID:          uuid.New().String(),
		Type:        eventType,
		Timestamp:   logEntry.Timestamp,
		LogEntryID:  logEntry.ID,
		Hostname:    logEntry.Hostname,
		Source:      logEntry.Source,
		Attributes:  logEntry.Fields,
		Description: logEntry.Message,
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func (e *RuleEngine) bufferEvent(event *models.Event) {
	e.bufferMutex.Lock()
	defer e.bufferMutex.Unlock()

	key := fmt.Sprintf("%s:%s", event.Type, getGroupValue(event, "username"))
	e.eventBuffer[key] = append(e.eventBuffer[key], event)
}

func getGroupValue(event *models.Event, field string) string {
	if val, ok := event.Attributes[field].(string); ok {
		return val
	}
	return event.Hostname
}

func (e *RuleEngine) cleanupOldEvents() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		e.bufferMutex.Lock()
		cutoff := time.Now().Add(-time.Duration(e.windowSeconds*2) * time.Second)
		
		for key, events := range e.eventBuffer {
			filtered := make([]*models.Event, 0)
			for _, evt := range events {
				if evt.Timestamp.After(cutoff) {
					filtered = append(filtered, evt)
				}
			}
			if len(filtered) == 0 {
				delete(e.eventBuffer, key)
			} else {
				e.eventBuffer[key] = filtered
			}
		}
		e.bufferMutex.Unlock()
	}
}

func (e *RuleEngine) evaluateRules(event *models.Event) {
	for _, rule := range e.rules {
		if !rule.Enabled {
			continue
		}

		if !e.evaluateCondition(rule.ID, event) {
			continue
		}

		if rule.Correlation != nil {
			e.evaluateCorrelationRule(rule, event)
		} else {
			e.createAlert(rule, []*models.Event{event})
		}
	}
}

func (e *RuleEngine) evaluateCondition(ruleID string, event *models.Event) bool {
	compiled, ok := e.compiledRules[ruleID]
	if !ok {
		return true
	}

	condition := compiled.Rule.Condition
	if condition == "" || condition == "true" {
		return true
	}

	compiled.VM.Set("event", map[string]interface{}{
		"type":       event.Type,
		"hostname":   event.Hostname,
		"source":     event.Source,
		"attributes": event.Attributes,
	})

	result, err := compiled.VM.Run(condition)
	if err != nil {
		e.logger.Warn("Condition evaluation error", zap.String("rule", ruleID), zap.Error(err))
		return false
	}

	boolResult, err := result.ToBoolean()
	if err != nil {
		return false
	}

	return boolResult
}

func (e *RuleEngine) evaluateCorrelationRule(rule *models.Rule, event *models.Event) {
	corr := rule.Correlation
	groupValue := getGroupValue(event, corr.GroupByField)
	
	e.bufferMutex.RLock()
	defer e.bufferMutex.RUnlock()

	switch corr.Type {
	case "count":
		e.evaluateCountRule(rule, event, groupValue)
	case "sequence":
		e.evaluateSequenceRule(rule, event, groupValue)
	}
}

func (e *RuleEngine) evaluateCountRule(rule *models.Rule, event *models.Event, groupValue string) {
	corr := rule.Correlation
	cutoff := time.Now().Add(-time.Duration(corr.TimeWindowSeconds) * time.Second)

	keyPrefix := event.Type
	count := 0
	matchingEvents := make([]*models.Event, 0)

	for key, events := range e.eventBuffer {
		if len(key) >= len(keyPrefix) && key[:len(keyPrefix)] == keyPrefix {
			for _, evt := range events {
				evtGroupVal := getGroupValue(evt, corr.GroupByField)
				if evtGroupVal == groupValue && evt.Timestamp.After(cutoff) {
					count++
					matchingEvents = append(matchingEvents, evt)
				}
			}
		}
	}

	if count >= corr.MinCount {
		e.createAlert(rule, matchingEvents)
	}
}

func (e *RuleEngine) evaluateSequenceRule(rule *models.Rule, event *models.Event, groupValue string) {
	corr := rule.Correlation
	if len(corr.EventSequence) == 0 {
		return
	}

	lastEventIdx := -1
	for i, ec := range corr.EventSequence {
		if ec.EventType == event.Type {
			lastEventIdx = i
			break
		}
	}

	if lastEventIdx == -1 || lastEventIdx != len(corr.EventSequence)-1 {
		return
	}

	cutoff := time.Now().Add(-time.Duration(corr.TimeWindowSeconds) * time.Second)
	sequenceEvents := make([]*models.Event, 0)

	for seqIdx, ec := range corr.EventSequence {
		found := false
		keyPrefix := ec.EventType

		for key, events := range e.eventBuffer {
			if len(key) >= len(keyPrefix) && key[:len(keyPrefix)] == keyPrefix {
				for _, evt := range events {
					evtGroupVal := getGroupValue(evt, corr.GroupByField)
					if evtGroupVal == groupValue && evt.Timestamp.After(cutoff) {
						sequenceEvents = append(sequenceEvents, evt)
						found = true
						break
					}
				}
			}
			if found {
				break
			}
		}

		if !found && seqIdx != lastEventIdx {
			return
		}
	}

	sequenceEvents = append(sequenceEvents, event)

	if len(sequenceEvents) == len(corr.EventSequence) {
		e.createAlert(rule, sequenceEvents)
	}
}

func (e *RuleEngine) createAlert(rule *models.Rule, events []*models.Event) {
	fingerprint := e.generateAlertFingerprint(rule.ID, events)
	
	e.bufferMutex.Lock()
	if lastTrigger, exists := e.triggeredAlerts[fingerprint]; exists {
		cooldown := time.Duration(rule.Correlation.TimeWindowSeconds) * time.Second
		if time.Since(lastTrigger) < cooldown {
			e.bufferMutex.Unlock()
			e.logger.Debug("Alert suppressed due to cooldown",
				zap.String("rule", rule.Name),
				zap.String("fingerprint", fingerprint[:16]))
			return
		}
	}
	e.triggeredAlerts[fingerprint] = time.Now()
	e.bufferMutex.Unlock()

	eventIDs := make([]string, 0, len(events))
	for _, evt := range events {
		eventIDs = append(eventIDs, evt.ID)
	}

	alert := &models.Alert{
		ID:          uuid.New().String(),
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		Severity:    rule.Severity,
		Timestamp:   time.Now(),
		EventIDs:    eventIDs,
		Events:      make([]models.Event, 0, len(events)),
		Description: fmt.Sprintf("Rule '%s' triggered with %d events", rule.Name, len(events)),
		Status:      models.AlertStatusNew,
	}

	for _, evt := range events {
		alert.Events = append(alert.Events, *evt)
	}

	e.es.IndexDocument("alerts", alert.ID, alert)

	if e.alertCallback != nil {
		e.alertCallback(alert)
	}

	e.logger.Info("Alert created", 
		zap.String("rule", rule.Name),
		zap.String("alert_id", alert.ID),
		zap.Int("event_count", len(events)))
}

func (e *RuleEngine) generateAlertFingerprint(ruleID string, events []*models.Event) string {
	sortedEvents := make([]*models.Event, len(events))
	copy(sortedEvents, events)
	sort.Slice(sortedEvents, func(i, j int) bool {
		return sortedEvents[i].Timestamp.Before(sortedEvents[j].Timestamp)
	})

	hash := sha256.New()
	hash.Write([]byte(ruleID))
	
	for _, evt := range sortedEvents {
		hash.Write([]byte(evt.ID))
	}
	
	return hex.EncodeToString(hash.Sum(nil))
}

func (e *RuleEngine) cleanupTriggeredAlerts() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		e.bufferMutex.Lock()
		cutoff := time.Now().Add(-1 * time.Hour)
		for fingerprint, timestamp := range e.triggeredAlerts {
			if timestamp.Before(cutoff) {
				delete(e.triggeredAlerts, fingerprint)
			}
		}
		e.bufferMutex.Unlock()
	}
}

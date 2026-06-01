package alert

import (
	"container/list"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"stun-turn-monitor/internal/scraper"
)

type AlertLevel string

const (
	LevelWarning AlertLevel = "warning"
	LevelError   AlertLevel = "error"
	LevelCritical AlertLevel = "critical"
)

type AlertRule struct {
	ServerName     string        `yaml:"server_name"`
	SessionThreshold int64      `yaml:"session_threshold"`
	Level          AlertLevel    `yaml:"level"`
	Duration       time.Duration `yaml:"duration"`
	Cooldown       time.Duration `yaml:"cooldown"`
}

type Alert struct {
	ID          string       `json:"id"`
	ServerName  string       `json:"server_name"`
	Level       AlertLevel   `json:"level"`
	Message     string       `json:"message"`
	SessionCount int64       `json:"session_count"`
	Threshold   int64        `json:"threshold"`
	Timestamp   time.Time    `json:"timestamp"`
	Resolved    bool         `json:"resolved"`
	ResolvedAt  *time.Time   `json:"resolved_at,omitempty"`
}

type AlertManager struct {
	rules    []AlertRule
	alerts   *list.List
	mu       sync.RWMutex
	maxAlerts int
	lastAlert map[string]time.Time
}

func NewManager(rules []AlertRule, maxAlerts int) *AlertManager {
	if maxAlerts <= 0 {
		maxAlerts = 1000
	}
	return &AlertManager{
		rules:     rules,
		alerts:    list.New(),
		maxAlerts: maxAlerts,
		lastAlert: make(map[string]time.Time),
	}
}

func (am *AlertManager) Check(metrics *scraper.Metrics) {
	am.mu.Lock()
	defer am.mu.Unlock()

	for _, rule := range am.rules {
		if rule.ServerName != "" && rule.ServerName != metrics.ServerName {
			continue
		}

		if metrics.SessionCount >= rule.SessionThreshold {
			alertKey := fmt.Sprintf("%s-%d", metrics.ServerName, rule.SessionThreshold)
			
			if last, ok := am.lastAlert[alertKey]; ok {
				cooldown := rule.Cooldown
				if cooldown == 0 {
					cooldown = 5 * time.Minute
				}
				if time.Since(last) < cooldown {
					continue
				}
			}

			alert := &Alert{
				ID:          fmt.Sprintf("alert-%d", time.Now().UnixNano()),
				ServerName:  metrics.ServerName,
				Level:       rule.Level,
				Message:     fmt.Sprintf("服务器 %s 会话数 %d 超过阈值 %d", metrics.ServerName, metrics.SessionCount, rule.SessionThreshold),
				SessionCount: metrics.SessionCount,
				Threshold:   rule.SessionThreshold,
				Timestamp:   time.Now(),
				Resolved:    false,
			}

			am.alerts.PushFront(alert)
			am.lastAlert[alertKey] = time.Now()

			if am.alerts.Len() > am.maxAlerts {
				am.alerts.Remove(am.alerts.Back())
			}

			am.logAlert(alert)
		}
	}
}

func (am *AlertManager) logAlert(alert *Alert) {
	log.Printf("[ALERT] [%s] %s - %s", alert.Level, alert.ServerName, alert.Message)
}

func (am *AlertManager) GetAlerts(severity AlertLevel, limit int) []*Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	var alerts []*Alert
	count := 0

	for e := am.alerts.Front(); e != nil; e = e.Next() {
		alert := e.Value.(*Alert)
		if severity == "" || alert.Level == severity {
			alerts = append(alerts, alert)
			count++
			if limit > 0 && count >= limit {
				break
			}
		}
	}

	return alerts
}

func (am *AlertManager) GetAllAlerts() []*Alert {
	return am.GetAlerts("", 0)
}

func (am *AlertManager) ResolveAlert(alertID string) bool {
	am.mu.Lock()
	defer am.mu.Unlock()

	for e := am.alerts.Front(); e != nil; e = e.Next() {
		alert := e.Value.(*Alert)
		if alert.ID == alertID && !alert.Resolved {
			alert.Resolved = true
			now := time.Now()
			alert.ResolvedAt = &now
			return true
		}
	}
	return false
}

func (am *AlertManager) GetActiveAlerts() []*Alert {
	am.mu.RLock()
	defer am.mu.RUnlock()

	var alerts []*Alert
	for e := am.alerts.Front(); e != nil; e = e.Next() {
		alert := e.Value.(*Alert)
		if !alert.Resolved {
			alerts = append(alerts, alert)
		}
	}
	return alerts
}

func (am *AlertManager) GetAlertCount() (total, active, warning, error, critical int) {
	am.mu.RLock()
	defer am.mu.RUnlock()

	for e := am.alerts.Front(); e != nil; e = e.Next() {
		alert := e.Value.(*Alert)
		total++
		if !alert.Resolved {
			active++
		}
		switch alert.Level {
		case LevelWarning:
			warning++
		case LevelError:
			error++
		case LevelCritical:
			critical++
		}
	}
	return
}

func (a *Alert) ToJSON() (string, error) {
	data, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (a *Alert) String() string {
	return fmt.Sprintf("[%s] %s: %s (会话数: %d, 阈值: %d)",
		a.Timestamp.Format("2006-01-02 15:04:05"),
		a.Level,
		a.ServerName,
		a.SessionCount,
		a.Threshold,
	)
}

package input

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
	"gopkg.in/mcuadros/go-syslog.v2"

	"log-analyzer/internal/anomaly"
	"log-analyzer/internal/es"
	"log-analyzer/internal/models"
	"log-analyzer/internal/rules"
	"log-analyzer/internal/threatintel"
)

type SyslogServer struct {
	port            int
	es              *es.Client
	logger          *zap.Logger
	server          *syslog.Server
	ruleEngine      *rules.RuleEngine
	anomalyDetector *anomaly.AnomalyDetector
	threatIntel     *threatintel.ThreatIntel
}

func NewSyslogServer(port int, esClient *es.Client, logger *zap.Logger) *SyslogServer {
	return &SyslogServer{
		port:   port,
		es:     esClient,
		logger: logger,
	}
}

func (s *SyslogServer) SetRuleEngine(re *rules.RuleEngine) {
	s.ruleEngine = re
}

func (s *SyslogServer) SetAnomalyDetector(ad *anomaly.AnomalyDetector) {
	s.anomalyDetector = ad
}

func (s *SyslogServer) SetThreatIntel(ti *threatintel.ThreatIntel) {
	s.threatIntel = ti
}

func (s *SyslogServer) Start() error {
	channel := make(syslog.LogPartsChannel)
	handler := syslog.NewChannelHandler(channel)

	s.server = syslog.NewServer()
	s.server.SetFormat(syslog.Automatic)
	s.server.SetHandler(handler)

	if err := s.server.ListenUDP(fmt.Sprintf("0.0.0.0:%d", s.port)); err != nil {
		return err
	}

	if err := s.server.ListenTCP(fmt.Sprintf("0.0.0.0:%d", s.port)); err != nil {
		return err
	}

	if err := s.server.Boot(); err != nil {
		return err
	}

	go func() {
		for parts := range channel {
			logEntry := s.parseLogParts(parts)
			if err := s.es.IndexDocument("logs", logEntry.ID, logEntry); err != nil {
				s.logger.Error("Failed to index syslog entry", zap.Error(err))
			}
			event := s.logToEvent(logEntry)
			s.processEvent(event)
		}
	}()

	s.logger.Info("Syslog server started", zap.Int("port", s.port))
	return nil
}

func (s *SyslogServer) Stop() error {
	if s.server != nil {
		return s.server.Kill()
	}
	return nil
}

func (s *SyslogServer) parseLogParts(parts syslog.LogParts) *models.LogEntry {
	entry := models.NewLogEntry()
	entry.Source = "syslog"

	if ts, ok := parts["timestamp"].(time.Time); ok {
		entry.Timestamp = ts
	}

	if hostname, ok := parts["hostname"].(string); ok {
		entry.Hostname = hostname
	}

	if tag, ok := parts["tag"].(string); ok {
		entry.Facility = tag
	}

	if content, ok := parts["content"].(string); ok {
		entry.Message = content
	}

	if severity, ok := parts["severity"].(int); ok {
		entry.Severity = severityToString(severity)
	}

	if raw, ok := parts["message"].(string); ok {
		entry.Raw = raw
	}

	return entry
}

func (s *SyslogServer) logToEvent(entry *models.LogEntry) *models.Event {
	eventType := "unknown"
	if et, ok := entry.Fields["event_type"].(string); ok {
		eventType = et
	} else {
		if entry.Severity == "error" || entry.Severity == "warning" {
			eventType = "error"
		}
	}

	attributes := make(map[string]interface{})
	for k, v := range entry.Fields {
		attributes[k] = v
	}

	return &models.Event{
		ID:          uuid.New().String(),
		Type:        eventType,
		Source:      entry.Source,
		Hostname:    entry.Hostname,
		Description: entry.Message,
		Timestamp:   entry.Timestamp,
		Attributes:  attributes,
	}
}

func (s *SyslogServer) processEvent(event *models.Event) {
	if err := s.es.IndexDocument("events", event.ID, event); err != nil {
		s.logger.Error("Failed to index event", zap.Error(err))
	}

	if s.ruleEngine != nil {
		go s.ruleEngine.ProcessEvent(event)
	}

	if s.anomalyDetector != nil {
		go s.anomalyDetector.ProcessEvent(event)
	}

	if s.threatIntel != nil {
		go s.threatIntel.ProcessEvent(event)
	}
}

func severityToString(severity int) string {
	switch severity {
	case 0:
		return "emergency"
	case 1:
		return "alert"
	case 2:
		return "critical"
	case 3:
		return "error"
	case 4:
		return "warning"
	case 5:
		return "notice"
	case 6:
		return "info"
	case 7:
		return "debug"
	default:
		return "unknown"
	}
}

func (s *SyslogServer) SimulateLoginFailure(hostname, user string) {
	entry := models.NewLogEntry()
	entry.Source = "syslog"
	entry.Hostname = hostname
	entry.Severity = "warning"
	entry.Facility = "auth"
	entry.Message = fmt.Sprintf("Failed password for %s from 192.168.1.100 port 22 ssh2", user)
	entry.Fields = map[string]interface{}{
		"event_type": "login_failed",
		"username":   user,
		"source_ip":  "192.168.1.100",
	}

	s.es.IndexDocument("logs", entry.ID, entry)
	event := s.logToEvent(entry)
	s.processEvent(event)
	s.logger.Info("Simulated login failure", zap.String("user", user))
}

func (s *SyslogServer) SimulateLoginSuccess(hostname, user string) {
	entry := models.NewLogEntry()
	entry.Source = "syslog"
	entry.Hostname = hostname
	entry.Severity = "info"
	entry.Facility = "auth"
	entry.Message = fmt.Sprintf("Accepted password for %s from 192.168.1.100 port 22 ssh2", user)
	entry.Fields = map[string]interface{}{
		"event_type": "login_success",
		"username":   user,
		"source_ip":  "192.168.1.100",
	}

	s.es.IndexDocument("logs", entry.ID, entry)
	event := s.logToEvent(entry)
	s.processEvent(event)
	s.logger.Info("Simulated login success", zap.String("user", user))
}

func (s *SyslogServer) SimulateIOCEvent(hostname, ip, domain string) {
	entry := models.NewLogEntry()
	entry.Source = "syslog"
	entry.Hostname = hostname
	entry.Severity = "warning"
	entry.Facility = "network"
	entry.Message = fmt.Sprintf("Connection to suspicious host %s from %s", domain, ip)
	entry.Fields = map[string]interface{}{
		"event_type":   "network_connection",
		"source_ip":    ip,
		"dest_domain":  domain,
	}

	s.es.IndexDocument("logs", entry.ID, entry)
	event := s.logToEvent(entry)
	s.processEvent(event)
	s.logger.Info("Simulated IOC event", zap.String("ip", ip), zap.String("domain", domain))
}

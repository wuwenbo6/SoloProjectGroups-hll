package backend

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"
)

type WebhookConfig struct {
	ID       string `json:"id"`
	URL      string `json:"url"`
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	ScannerOnly bool `json:"scanner_only"`
	TrapOnly  bool   `json:"trap_only"`
	MinSeverity int  `json:"min_severity"`
}

type HoneypotEvent struct {
	Timestamp    time.Time `json:"timestamp"`
	SourceIP     string    `json:"source_ip"`
	EventType    string    `json:"event_type"`
	Severity     string    `json:"severity"`
	Description  string    `json:"description"`
	SlaveID      uint8     `json:"slave_id"`
	SlaveName    string    `json:"slave_name"`
	FunctionCode uint8     `json:"function_code"`
	FunctionName string    `json:"function_name"`
	TrapName     string    `json:"trap_name,omitempty"`
	Scanners     []string  `json:"scanners,omitempty"`
	RawData      []byte    `json:"raw_data,omitempty"`
}

type HoneypotManager struct {
	webhooks    map[string]WebhookConfig
	webhooksMu  sync.RWMutex
	eventQueue  chan HoneypotEvent
	stopChan    chan struct{}
	fingerprint *FingerprintEngine
	httpClient  *http.Client
}

func NewHoneypotManager(fp *FingerprintEngine) *HoneypotManager {
	hm := &HoneypotManager{
		webhooks:    make(map[string]WebhookConfig),
		eventQueue:  make(chan HoneypotEvent, 10000),
		stopChan:    make(chan struct{}),
		fingerprint: fp,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}

	go hm.eventWorker()
	return hm
}

func (hm *HoneypotManager) eventWorker() {
	for {
		select {
		case event := <-hm.eventQueue:
			hm.dispatchEvent(event)
		case <-hm.stopChan:
			return
		}
	}
}

func (hm *HoneypotManager) dispatchEvent(event HoneypotEvent) {
	hm.webhooksMu.RLock()
	defer hm.webhooksMu.RUnlock()

	for _, webhook := range hm.webhooks {
		if !webhook.Enabled {
			continue
		}

		if webhook.ScannerOnly && len(event.Scanners) == 0 {
			continue
		}

		if webhook.TrapOnly && event.TrapName == "" {
			continue
		}

		severityScore := calculateSeverityScore(event.Severity)
		if severityScore < webhook.MinSeverity {
			continue
		}

		go hm.sendWebhook(webhook, event)
	}
}

func (hm *HoneypotManager) sendWebhook(webhook WebhookConfig, event HoneypotEvent) {
	payload, err := json.Marshal(map[string]interface{}{
		"webhook_name": webhook.Name,
		"event":        event,
		"timestamp":    time.Now().Format(time.RFC3339),
	})
	if err != nil {
		log.Printf("Webhook payload marshal error: %v", err)
		return
	}

	req, err := http.NewRequest("POST", webhook.URL, bytes.NewBuffer(payload))
	if err != nil {
		log.Printf("Webhook request create error: %v", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Modbus-Honeypot/1.0")

	resp, err := hm.httpClient.Do(req)
	if err != nil {
		log.Printf("Webhook send failed to %s: %v", webhook.Name, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		log.Printf("Webhook sent to %s successfully", webhook.Name)
	} else {
		log.Printf("Webhook to %s returned status: %d", webhook.Name, resp.StatusCode)
	}
}

func (hm *HoneypotManager) AddWebhook(config WebhookConfig) {
	hm.webhooksMu.Lock()
	defer hm.webhooksMu.Unlock()
	hm.webhooks[config.ID] = config
}

func (hm *HoneypotManager) UpdateWebhook(config WebhookConfig) {
	hm.webhooksMu.Lock()
	defer hm.webhooksMu.Unlock()
	hm.webhooks[config.ID] = config
}

func (hm *HoneypotManager) DeleteWebhook(id string) {
	hm.webhooksMu.Lock()
	defer hm.webhooksMu.Unlock()
	delete(hm.webhooks, id)
}

func (hm *HoneypotManager) GetWebhooks() []WebhookConfig {
	hm.webhooksMu.RLock()
	defer hm.webhooksMu.RUnlock()

	webhooks := make([]WebhookConfig, 0, len(hm.webhooks))
	for _, w := range hm.webhooks {
		webhooks = append(webhooks, w)
	}
	return webhooks
}

func (hm *HoneypotManager) ProcessRequest(req ModbusRequest) {
	eventType := "modbus_access"
	severity := "low"
	description := "Modbus access detected"

	scanners := make([]string, 0)
	if hm.fingerprint != nil {
		behavior := hm.fingerprint.GetIPBehavior(req.SourceIP)
		if behavior != nil {
			behavior.mu.RLock()
			scanners = append(scanners, behavior.DetectedScanners...)
			behavior.mu.RUnlock()
		}
	}

	if req.TrapTriggered {
		eventType = "trap_triggered"
		severity = "high"
		description = "Honeypot trap triggered: " + req.TrapName
	} else if len(scanners) > 0 {
		eventType = "scanner_detected"
		severity = "medium"
		description = "Scanner detected: " + scanners[0]
	}

	if req.FunctionCode >= 0x05 {
		severity = "medium"
		description = "Write operation attempted"
	}

	event := HoneypotEvent{
		Timestamp:    req.Timestamp,
		SourceIP:     req.SourceIP,
		EventType:    eventType,
		Severity:     severity,
		Description:  description,
		SlaveID:      req.SlaveID,
		SlaveName:    req.SlaveName,
		FunctionCode: req.FunctionCode,
		FunctionName: req.FunctionName,
		TrapName:     req.TrapName,
		Scanners:     scanners,
		RawData:      req.Data,
	}

	select {
	case hm.eventQueue <- event:
	default:
	}
}

func (hm *HoneypotManager) Stop() {
	close(hm.stopChan)
}

func calculateSeverityScore(severity string) int {
	switch severity {
	case "critical":
		return 4
	case "high":
		return 3
	case "medium":
		return 2
	case "low":
		return 1
	default:
		return 0
	}
}

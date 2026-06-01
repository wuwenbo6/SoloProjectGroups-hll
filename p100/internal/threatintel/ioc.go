package threatintel

import (
	"encoding/json"
	"net"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"log-analyzer/internal/models"
)

type IOCTypes string

const (
	IOCTypeIP        IOCTypes = "ip"
	IOCTypeDomain    IOCTypes = "domain"
	IOCTypeHashMD5   IOCTypes = "md5"
	IOCTypeHashSHA1  IOCTypes = "sha1"
	IOCTypeHashSHA256 IOCTypes = "sha256"
	IOCTypeURL       IOCTypes = "url"
)

type IOCEntry struct {
	ID          string    `json:"id"`
	Type        IOCTypes  `json:"type"`
	Value       string    `json:"value"`
	Source      string    `json:"source"`
	Severity    string    `json:"severity"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
	Active      bool      `json:"active"`
	Tags        []string  `json:"tags"`
}

type IOCMatch struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"timestamp"`
	IOC         *IOCEntry              `json:"ioc"`
	EventID     string                 `json:"event_id"`
	Hostname    string                 `json:"hostname"`
	MatchField  string                 `json:"match_field"`
	MatchValue  string                 `json:"match_value"`
	Description string                 `json:"description"`
	Attributes  map[string]interface{} `json:"attributes"`
}

type ThreatIntel struct {
	logger         *zap.Logger
	iocStore       map[string]*IOCEntry
	iocByType      map[IOCTypes]map[string]*IOCEntry
	storeMutex     sync.RWMutex
	matchCallback  func(*IOCMatch)
	ipRegex        *regexp.Regexp
	domainRegex    *regexp.Regexp
	md5Regex       *regexp.Regexp
	sha1Regex      *regexp.Regexp
	sha256Regex    *regexp.Regexp
	urlRegex       *regexp.Regexp
}

func NewThreatIntel(logger *zap.Logger) *ThreatIntel {
	ti := &ThreatIntel{
		logger:      logger,
		iocStore:    make(map[string]*IOCEntry),
		iocByType:   make(map[IOCTypes]map[string]*IOCEntry),
		ipRegex:     regexp.MustCompile(`\b(?:\d{1,3}\.){3}\d{1,3}\b`),
		domainRegex: regexp.MustCompile(`\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\b`),
		md5Regex:    regexp.MustCompile(`\b[a-fA-F0-9]{32}\b`),
		sha1Regex:   regexp.MustCompile(`\b[a-fA-F0-9]{40}\b`),
		sha256Regex: regexp.MustCompile(`\b[a-fA-F0-9]{64}\b`),
		urlRegex:    regexp.MustCompile(`https?://[^\s]+`),
	}

	ti.iocByType[IOCTypeIP] = make(map[string]*IOCEntry)
	ti.iocByType[IOCTypeDomain] = make(map[string]*IOCEntry)
	ti.iocByType[IOCTypeHashMD5] = make(map[string]*IOCEntry)
	ti.iocByType[IOCTypeHashSHA1] = make(map[string]*IOCEntry)
	ti.iocByType[IOCTypeHashSHA256] = make(map[string]*IOCEntry)
	ti.iocByType[IOCTypeURL] = make(map[string]*IOCEntry)

	go ti.periodicCleanup()
	ti.loadDefaultIOCs()
	return ti
}

func (ti *ThreatIntel) SetMatchCallback(cb func(*IOCMatch)) {
	ti.matchCallback = cb
}

func (ti *ThreatIntel) loadDefaultIOCs() {
	defaultIOCs := []*IOCEntry{
		{
			ID:          "malware-ip-001",
			Type:        IOCTypeIP,
			Value:       "192.168.1.100",
			Source:      "internal",
			Severity:    "high",
			Description: "Known malware C2 server (demo)",
			Active:      true,
			CreatedAt:   time.Now(),
			Tags:        []string{"malware", "c2"},
		},
		{
			ID:          "phish-domain-001",
			Type:        IOCTypeDomain,
			Value:       "evil-phish.com",
			Source:      "internal",
			Severity:    "high",
			Description: "Known phishing domain (demo)",
			Active:      true,
			CreatedAt:   time.Now(),
			Tags:        []string{"phishing"},
		},
		{
			ID:          "brute-force-ip-001",
			Type:        IOCTypeIP,
			Value:       "10.0.0.1",
			Source:      "internal",
			Severity:    "medium",
			Description: "Known brute force source (demo)",
			Active:      true,
			CreatedAt:   time.Now(),
			Tags:        []string{"brute-force"},
		},
	}

	for _, ioc := range defaultIOCs {
		ti.AddIOC(ioc)
	}
}

func (ti *ThreatIntel) AddIOC(ioc *IOCEntry) error {
	ti.storeMutex.Lock()
	defer ti.storeMutex.Unlock()

	if ioc.ID == "" {
		ioc.ID = uuid.New().String()
	}
	if ioc.CreatedAt.IsZero() {
		ioc.CreatedAt = time.Now()
	}

	ti.iocStore[ioc.ID] = ioc
	ti.iocByType[ioc.Type][strings.ToLower(ioc.Value)] = ioc

	ti.logger.Info("IOC added",
		zap.String("type", string(ioc.Type)),
		zap.String("value", ioc.Value),
		zap.String("source", ioc.Source))

	return nil
}

func (ti *ThreatIntel) RemoveIOC(id string) {
	ti.storeMutex.Lock()
	defer ti.storeMutex.Unlock()

	if ioc, exists := ti.iocStore[id]; exists {
		delete(ti.iocByType[ioc.Type], strings.ToLower(ioc.Value))
		delete(ti.iocStore, id)
	}
}

func (ti *ThreatIntel) GetAllIOCs() []*IOCEntry {
	ti.storeMutex.RLock()
	defer ti.storeMutex.RUnlock()

	iocs := make([]*IOCEntry, 0, len(ti.iocStore))
	for _, ioc := range ti.iocStore {
		iocs = append(iocs, ioc)
	}
	return iocs
}

func (ti *ThreatIntel) ProcessEvent(event *models.Event) []*IOCMatch {
	matches := make([]*IOCMatch, 0)

	text := ti.extractTextFromEvent(event)

	ipMatches := ti.ipRegex.FindAllString(text, -1)
	for _, ip := range ipMatches {
		if match := ti.checkIOC(IOCTypeIP, ip, event, "source_ip"); match != nil {
			matches = append(matches, match)
		}
	}

	domainMatches := ti.domainRegex.FindAllString(text, -1)
	for _, domain := range domainMatches {
		if match := ti.checkIOC(IOCTypeDomain, domain, event, "domain"); match != nil {
			matches = append(matches, match)
		}
	}

	urlMatches := ti.urlRegex.FindAllString(text, -1)
	for _, url := range urlMatches {
		if match := ti.checkIOC(IOCTypeURL, url, event, "url"); match != nil {
			matches = append(matches, match)
		}
	}

	md5Matches := ti.md5Regex.FindAllString(text, -1)
	for _, hash := range md5Matches {
		if match := ti.checkIOC(IOCTypeHashMD5, hash, event, "md5"); match != nil {
			matches = append(matches, match)
		}
	}

	sha1Matches := ti.sha1Regex.FindAllString(text, -1)
	for _, hash := range sha1Matches {
		if match := ti.checkIOC(IOCTypeHashSHA1, hash, event, "sha1"); match != nil {
			matches = append(matches, match)
		}
	}

	sha256Matches := ti.sha256Regex.FindAllString(text, -1)
	for _, hash := range sha256Matches {
		if match := ti.checkIOC(IOCTypeHashSHA256, hash, event, "sha256"); match != nil {
			matches = append(matches, match)
		}
	}

	if attrsIP, ok := event.Attributes["source_ip"].(string); ok {
		if net.ParseIP(attrsIP) != nil {
			if match := ti.checkIOC(IOCTypeIP, attrsIP, event, "source_ip"); match != nil {
				matches = append(matches, match)
			}
		}
	}

	for _, match := range matches {
		if ti.matchCallback != nil {
			ti.matchCallback(match)
		}
	}

	return matches
}

func (ti *ThreatIntel) extractTextFromEvent(event *models.Event) string {
	var textBuilder strings.Builder

	textBuilder.WriteString(event.Description)
	textBuilder.WriteString(" ")

	for key, value := range event.Attributes {
		if strVal, ok := value.(string); ok {
			textBuilder.WriteString(key)
			textBuilder.WriteString(": ")
			textBuilder.WriteString(strVal)
			textBuilder.WriteString(" ")
		}
	}

	return textBuilder.String()
}

func (ti *ThreatIntel) checkIOC(iocType IOCTypes, value string, event *models.Event, field string) *IOCMatch {
	ti.storeMutex.RLock()
	defer ti.storeMutex.RUnlock()

	ioc, exists := ti.iocByType[iocType][strings.ToLower(value)]
	if !exists || !ioc.Active {
		return nil
	}

	if !ioc.ExpiresAt.IsZero() && ioc.ExpiresAt.Before(time.Now()) {
		return nil
	}

	match := &IOCMatch{
		ID:          uuid.New().String(),
		Timestamp:   time.Now(),
		IOC:         ioc,
		EventID:     event.ID,
		Hostname:    event.Hostname,
		MatchField:  field,
		MatchValue:  value,
		Description: ti.buildMatchDescription(ioc, value, event),
		Attributes:  event.Attributes,
	}

	ti.logger.Info("IOC match detected",
		zap.String("type", string(iocType)),
		zap.String("value", value),
		zap.String("hostname", event.Hostname))

	return match
}

func (ti *ThreatIntel) buildMatchDescription(ioc *IOCEntry, value string, event *models.Event) string {
	return jsonDescription(ioc, value, event.Hostname)
}

func jsonDescription(ioc *IOCEntry, value string, hostname string) string {
	data, _ := json.Marshal(map[string]string{
		"ioc_type":    string(ioc.Type),
		"ioc_value":   value,
		"ioc_source":  ioc.Source,
		"severity":    ioc.Severity,
		"description": ioc.Description,
		"hostname":    hostname,
	})
	return string(data)
}

func (ti *ThreatIntel) periodicCleanup() {
	ticker := time.NewTicker(1 * time.Hour)
	for range ticker.C {
		ti.storeMutex.Lock()
		now := time.Now()
		for id, ioc := range ti.iocStore {
			if !ioc.ExpiresAt.IsZero() && ioc.ExpiresAt.Before(now) {
				delete(ti.iocByType[ioc.Type], strings.ToLower(ioc.Value))
				delete(ti.iocStore, id)
			}
		}
		ti.storeMutex.Unlock()
	}
}

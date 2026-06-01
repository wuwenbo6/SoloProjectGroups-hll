package detector

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"sync"
	"time"

	"sip-detector/types"
)

const (
	RefreshWeight      = 0.3
	WindowSizeSeconds  = 5
	SlideInterval      = 1
	DefaultThreshold   = 10.0
)

type slotData struct {
	count         int64
	weightedCount float64
	initialCount  int64
	refreshCount  int64
}

type ipRecord struct {
	slots         []slotData
	windowStart   time.Time
	lastSlide     time.Time
	firstSeen     time.Time
	lastSeen      time.Time
	userAgents    map[string]bool
	destinations  map[string]int
	contacts      map[string]int
	knownContacts map[string]bool
	alertCooldown time.Time
	isAlerting    bool
}

type Detector struct {
	threshold     float64
	windowSize    int
	slideInterval int
	refreshWeight float64
	mu            sync.RWMutex
	ipRecords     map[string]*ipRecord
	alerts        []*types.AlertEvent
	alertChan     chan *types.AlertEvent
	geoLookup     func(string) (*types.GeoInfo, error)
	stopChan      chan struct{}
	onAlert       func(*types.AlertEvent)
}

func NewDetector(threshold float64, windowSize int) *Detector {
	if threshold <= 0 {
		threshold = DefaultThreshold
	}
	if windowSize <= 0 {
		windowSize = WindowSizeSeconds
	}

	return &Detector{
		threshold:     threshold,
		windowSize:    windowSize,
		slideInterval: SlideInterval,
		refreshWeight: RefreshWeight,
		ipRecords:     make(map[string]*ipRecord),
		alerts:        make([]*types.AlertEvent, 0),
		alertChan:     make(chan *types.AlertEvent, 100),
		stopChan:      make(chan struct{}),
	}
}

func (d *Detector) SetGeoLookup(fn func(string) (*types.GeoInfo, error)) {
	d.geoLookup = fn
}

func (d *Detector) SetRefreshWeight(weight float64) {
	if weight > 0 && weight <= 1.0 {
		d.refreshWeight = weight
	}
}

func (d *Detector) SetOnAlertCallback(fn func(*types.AlertEvent)) {
	d.onAlert = fn
}

func (d *Detector) AlertChan() <-chan *types.AlertEvent {
	return d.alertChan
}

func (d *Detector) Process(reg *types.SIPRegister) {
	d.mu.Lock()
	defer d.mu.Unlock()

	ip := reg.SourceIP
	now := time.Now()

	record, exists := d.ipRecords[ip]
	if !exists {
		record = &ipRecord{
			slots:         make([]slotData, d.windowSize),
			windowStart:   now,
			lastSlide:     now,
			firstSeen:     now,
			lastSeen:      now,
			userAgents:    make(map[string]bool),
			destinations:  make(map[string]int),
			contacts:      make(map[string]int),
			knownContacts: make(map[string]bool),
		}
		d.ipRecords[ip] = record
	}

	d.slideWindow(record, now)

	registerType := d.classifyRegister(record, reg)

	weight := 1.0
	if registerType == types.RegisterTypeRefresh {
		weight = d.refreshWeight
	}

	elapsed := int(now.Sub(record.windowStart).Seconds())
	slotIndex := elapsed / d.slideInterval

	if slotIndex >= 0 && slotIndex < d.windowSize {
		record.slots[slotIndex].count++
		record.slots[slotIndex].weightedCount += weight

		if registerType == types.RegisterTypeRefresh {
			record.slots[slotIndex].refreshCount++
		} else if registerType == types.RegisterTypeInitial {
			record.slots[slotIndex].initialCount++
		}
	}

	record.lastSeen = now

	if reg.UserAgent != "" {
		record.userAgents[reg.UserAgent] = true
	}
	if reg.Destination != "" {
		record.destinations[reg.Destination]++
	}
	if reg.Contact != "" {
		record.contacts[reg.Contact]++
		record.knownContacts[reg.Contact] = true
	}

	d.checkAlert(ip, record, now)
}

func (d *Detector) classifyRegister(record *ipRecord, reg *types.SIPRegister) string {
	if reg.RegisterType == types.RegisterTypeRefresh {
		if reg.Contact != "" && record.knownContacts[reg.Contact] {
			return types.RegisterTypeRefresh
		}
		return types.RegisterTypeInitial
	}
	return reg.RegisterType
}

func (d *Detector) slideWindow(record *ipRecord, now time.Time) {
	elapsed := int(now.Sub(record.lastSlide).Seconds())
	if elapsed < d.slideInterval {
		return
	}

	slideCount := elapsed / d.slideInterval
	if slideCount > d.windowSize {
		slideCount = d.windowSize
	}

	for i := 0; i < slideCount; i++ {
		newSlots := make([]slotData, d.windowSize)
		copy(newSlots, record.slots[1:])
		record.slots = newSlots
	}

	record.windowStart = record.windowStart.Add(time.Duration(slideCount*d.slideInterval) * time.Second)
	record.lastSlide = now
}

func (d *Detector) checkAlert(ip string, record *ipRecord, now time.Time) {
	var totalCount int64
	var totalWeighted float64
	var totalInitial int64
	var totalRefresh int64

	for _, slot := range record.slots {
		totalCount += slot.count
		totalWeighted += slot.weightedCount
		totalInitial += slot.initialCount
		totalRefresh += slot.refreshCount
	}

	rate := float64(totalCount) / float64(d.windowSize)
	weightedRate := totalWeighted / float64(d.windowSize)

	if weightedRate > d.threshold {
		if now.After(record.alertCooldown) {
			alert := d.createAlert(ip, record, totalCount, totalWeighted, totalInitial, totalRefresh, rate, weightedRate, now)
			d.alerts = append(d.alerts, alert)
			record.isAlerting = true
			record.alertCooldown = now.Add(5 * time.Second)

			if d.onAlert != nil {
				d.onAlert(alert)
			}

			select {
			case d.alertChan <- alert:
			default:
			}
		}
	} else {
		record.isAlerting = false
	}
}

func (d *Detector) createAlert(ip string, record *ipRecord, totalCount int64, totalWeighted float64, totalInitial, totalRefresh int64, rate, weightedRate float64, now time.Time) *types.AlertEvent {
	alert := &types.AlertEvent{
		ID:            generateID(),
		IP:            ip,
		Count:         int(totalCount),
		WeightedCount: totalWeighted,
		Rate:          rate,
		WeightedRate:  weightedRate,
		InitialCount:  int(totalInitial),
		RefreshCount:  int(totalRefresh),
		Threshold:     d.threshold,
		Timestamp:     now,
		UserAgents:    make([]string, 0, len(record.userAgents)),
		Destinations:  make(map[string]int),
		Contacts:      make(map[string]int),
	}

	for ua := range record.userAgents {
		alert.UserAgents = append(alert.UserAgents, ua)
	}
	for dest, count := range record.destinations {
		alert.Destinations[dest] = count
	}
	for contact, count := range record.contacts {
		alert.Contacts[contact] = count
	}

	if d.geoLookup != nil {
		if geo, err := d.geoLookup(ip); err == nil {
			alert.GeoInfo = geo
		} else {
			log.Printf("Geo lookup failed for %s: %v", ip, err)
		}
	}

	log.Printf("[ALERT] SIP flood detected from %s: %.2f req/s (weighted: %.2f, threshold: %.2f, count: %d, initial: %d, refresh: %d)",
		ip, rate, weightedRate, d.threshold, totalCount, totalInitial, totalRefresh)

	return alert
}

func (d *Detector) GetFrequencyStats() []*types.FrequencyStats {
	d.mu.RLock()
	defer d.mu.RUnlock()

	now := time.Now()
	stats := make([]*types.FrequencyStats, 0, len(d.ipRecords))

	for ip, record := range d.ipRecords {
		d.slideWindow(record, now)

		var totalCount int64
		var totalWeighted float64
		var totalInitial int64
		var totalRefresh int64

		for _, slot := range record.slots {
			totalCount += slot.count
			totalWeighted += slot.weightedCount
			totalInitial += slot.initialCount
			totalRefresh += slot.refreshCount
		}

		rate := float64(totalCount) / float64(d.windowSize)
		weightedRate := totalWeighted / float64(d.windowSize)

		level := "normal"
		if weightedRate > d.threshold*3 {
			level = "critical"
		} else if weightedRate > d.threshold {
			level = "warning"
		}

		stats = append(stats, &types.FrequencyStats{
			IP:            ip,
			Count:         int(totalCount),
			WeightedCount: totalWeighted,
			Rate:          rate,
			WeightedRate:  weightedRate,
			InitialCount:  int(totalInitial),
			RefreshCount:  int(totalRefresh),
			FirstSeen:     record.firstSeen,
			LastSeen:      record.lastSeen,
			IsAlerting:    record.isAlerting,
			AlertLevel:    level,
		})
	}

	return stats
}

func (d *Detector) GetAlerts(limit int) []*types.AlertEvent {
	d.mu.RLock()
	defer d.mu.RUnlock()

	if limit <= 0 || limit > len(d.alerts) {
		limit = len(d.alerts)
	}

	start := len(d.alerts) - limit
	if start < 0 {
		start = 0
	}

	result := make([]*types.AlertEvent, len(d.alerts)-start)
	copy(result, d.alerts[start:])

	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return result
}

func (d *Detector) Cleanup() {
	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-5 * time.Minute)

	for ip, record := range d.ipRecords {
		if record.lastSeen.Before(cutoff) {
			delete(d.ipRecords, ip)
		}
	}

	if len(d.alerts) > 1000 {
		d.alerts = d.alerts[len(d.alerts)-1000:]
	}
}

func (d *Detector) StartCleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for {
			select {
			case <-d.stopChan:
				ticker.Stop()
				return
			case <-ticker.C:
				d.Cleanup()
			}
		}
	}()
}

func (d *Detector) Stop() {
	close(d.stopChan)
}

func generateID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString(b)
	}
	return hex.EncodeToString(b)
}

package anomaly

import (
	"math"
	"sync"
	"time"

	"sflow-analyzer/pkg/types"
)

type AttackType int

const (
	AttackTypeNone        AttackType = iota
	AttackTypeSYNFlood
	AttackTypeUDPFlood
	AttackTypeICMPFlood
	AttackTypePortScan
	AttackTypeSpoofedIP
	AttackTypeAnomalyVolume
)

type DetectionConfig struct {
	BaseLineWindow      time.Duration
	AlertThreshold      float64
	SpikeMultiplier     float64
	SYNThreshold        uint64
	UDPThreshold        uint64
	ICMPThreshold       uint64
	PortScanPorts       int
	MinTrafficBytes     uint64
	PacketPerSecThreshold uint64
}

func DefaultConfig() DetectionConfig {
	return DetectionConfig{
		BaseLineWindow:      5 * time.Minute,
		AlertThreshold:      2.0,
		SpikeMultiplier:     3.0,
		SYNThreshold:        1000,
		UDPThreshold:        5000,
		ICMPThreshold:       2000,
		PortScanPorts:       50,
		MinTrafficBytes:     1000,
		PacketPerSecThreshold: 10000,
	}
}

type TrafficBaseline struct {
	AvgBytesPerSec  float64
	AvgPacketsPerSec float64
	AvgFlowsPerSec  float64
	MaxBytesPerSec  float64
	MaxPacketsPerSec float64
	StdDevBytes     float64
	StdDevPackets   float64
	WindowDuration  time.Duration
	LastUpdated     time.Time
}

type AttackAlert struct {
	ID              uint64        `json:"id"`
	Type            AttackType    `json:"type"`
	TypeStr         string        `json:"type_str"`
	Severity        string        `json:"severity"`
	Description     string        `json:"description"`
	TargetIP        string        `json:"target_ip"`
	SourceIPs       []string      `json:"source_ips"`
	TargetPort      uint16        `json:"target_port"`
	AttackBytes     uint64        `json:"attack_bytes"`
	AttackPackets   uint64        `json:"attack_packets"`
	AttackFlowCount uint64        `json:"attack_flow_count"`
	StartAt         time.Time     `json:"start_at"`
	LastSeen        time.Time     `json:"last_seen"`
	Duration        time.Duration `json:"duration"`
	Confidence      float64       `json:"confidence"`
	Status          string        `json:"status"`
}

type IPStats struct {
	BytesSent       uint64
	BytesReceived   uint64
	PacketsSent     uint64
	PacketsReceived uint64
	FlowCount       uint64
	UniquePorts     map[uint16]bool
	LastSeen        time.Time
	FirstSeen       time.Time
}

type Detector struct {
	mu              sync.RWMutex
	config          DetectionConfig
	baseline        TrafficBaseline
	alerts          []AttackAlert
	alertIDCounter  uint64
	ipStats         map[string]*IPStats
	dstPortStats    map[uint16]map[string]*IPStats
	srcPortStats    map[uint16]map[string]*IPStats
	protocolStats   map[uint8]uint64
	recentPackets   []packetRecord
	recentWindow    time.Duration
	flowRecordBuffer []flowRecordBuffer
	running         bool
	historyBytes    []float64
	historyPackets  []float64
}

type packetRecord struct {
	Timestamp time.Time
	SrcIP     string
	DstIP     string
	Protocol  uint8
	Bytes     uint64
	Packets   uint64
}

type flowRecordBuffer struct {
	SrcIP       string
	DstIP       string
	SrcPort     uint16
	DstPort     uint16
	Protocol    uint8
	Bytes       uint64
	Packets     uint64
	FirstSeen   time.Time
	LastSeen    time.Time
	FlowCount   uint64
}

func NewDetector(config DetectionConfig) *Detector {
	return &Detector{
		config:        config,
		alerts:        make([]AttackAlert, 0),
		ipStats:       make(map[string]*IPStats),
		dstPortStats:  make(map[uint16]map[string]*IPStats),
		srcPortStats:  make(map[uint16]map[string]*IPStats),
		protocolStats: make(map[uint8]uint64),
		recentPackets: make([]packetRecord, 0),
		recentWindow:  10 * time.Second,
	}
}

func (d *Detector) Start() {
	d.running = true
	go d.analysisLoop()
}

func (d *Detector) Stop() {
	d.running = false
}

func (d *Detector) ProcessRecord(record types.FlowRecord) {
	d.mu.Lock()
	defer d.mu.Unlock()

	pr := packetRecord{
		Timestamp: record.Timestamp,
		SrcIP:     record.SrcIP,
		DstIP:     record.DstIP,
		Protocol:  record.Protocol,
		Bytes:     record.Bytes,
		Packets:   record.Packets,
	}

	d.recentPackets = append(d.recentPackets, pr)
	cutoff := time.Now().Add(-d.recentWindow)
	filtered := d.recentPackets[:0]
	for _, p := range d.recentPackets {
		if p.Timestamp.After(cutoff) {
			filtered = append(filtered, p)
		}
	}
	d.recentPackets = filtered

	d.updateIPStats(pr)
	d.updateProtocolStats(pr)
	d.updatePortStats(pr)
	d.updateBaseline()
}

func (d *Detector) updateIPStats(pr packetRecord) {
	srcStats, exists := d.ipStats[pr.SrcIP]
	if !exists {
		srcStats = &IPStats{
			UniquePorts: make(map[uint16]bool),
			FirstSeen:   pr.Timestamp,
		}
		d.ipStats[pr.SrcIP] = srcStats
	}
	srcStats.BytesSent += pr.Bytes
	srcStats.PacketsSent += pr.Packets
	srcStats.FlowCount++
	srcStats.LastSeen = pr.Timestamp

	dstStats, exists := d.ipStats[pr.DstIP]
	if !exists {
		dstStats = &IPStats{
			UniquePorts: make(map[uint16]bool),
			FirstSeen:   pr.Timestamp,
		}
		d.ipStats[pr.DstIP] = dstStats
	}
	dstStats.BytesReceived += pr.Bytes
	dstStats.PacketsReceived += pr.Packets
	dstStats.FlowCount++
	dstStats.LastSeen = pr.Timestamp
}

func (d *Detector) updateProtocolStats(pr packetRecord) {
	d.protocolStats[pr.Protocol] += pr.Packets
}

func (d *Detector) updatePortStats(pr packetRecord) {
	dstPort := uint16(0)
	srcPort := uint16(0)

	if d.dstPortStats[dstPort] == nil {
		d.dstPortStats[dstPort] = make(map[string]*IPStats)
	}
	if d.srcPortStats[srcPort] == nil {
		d.srcPortStats[srcPort] = make(map[string]*IPStats)
	}

	stats, exists := d.dstPortStats[dstPort][pr.DstIP]
	if !exists {
		stats = &IPStats{
			UniquePorts: make(map[uint16]bool),
			FirstSeen:   pr.Timestamp,
		}
		d.dstPortStats[dstPort][pr.DstIP] = stats
	}
	stats.BytesReceived += pr.Bytes
	stats.PacketsReceived += pr.Packets
	stats.FlowCount++
	stats.LastSeen = pr.Timestamp
}

func (d *Detector) updateBaseline() {
	now := time.Now()
	cutoff := now.Add(-d.config.BaseLineWindow)

	var totalBytes, totalPackets float64
	for _, p := range d.recentPackets {
		if p.Timestamp.After(cutoff) {
			totalBytes += float64(p.Bytes)
			totalPackets += float64(p.Packets)
		}
	}

	d.baseline.AvgBytesPerSec = totalBytes / d.config.BaseLineWindow.Seconds()
	d.baseline.AvgPacketsPerSec = totalPackets / d.config.BaseLineWindow.Seconds()

	d.historyBytes = append(d.historyBytes, d.baseline.AvgBytesPerSec)
	d.historyPackets = append(d.historyPackets, d.baseline.AvgPacketsPerSec)

	if len(d.historyBytes) > 300 {
		d.historyBytes = d.historyBytes[len(d.historyBytes)-300:]
	}
	if len(d.historyPackets) > 300 {
		d.historyPackets = d.historyPackets[len(d.historyPackets)-300:]
	}

	if len(d.historyBytes) >= 10 {
		d.baseline.StdDevBytes = calculateStdDev(d.historyBytes)
		d.baseline.StdDevPackets = calculateStdDev(d.historyPackets)
	}

	d.baseline.LastUpdated = now
	d.baseline.WindowDuration = d.config.BaseLineWindow
}

func (d *Detector) analysisLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for d.running {
		<-ticker.C
		d.detectAttacks()
	}
}

func (d *Detector) detectAttacks() {
	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()

	d.detectSYNFlood(now)
	d.detectUDPFlood(now)
	d.detectICMPFlood(now)
	d.detectPortScan(now)
	d.detectVolumeSpike(now)

	for i := range d.alerts {
		if d.alerts[i].Status == "active" && now.Sub(d.alerts[i].LastSeen) > 5*time.Minute {
			d.alerts[i].Status = "ended"
		}
	}
}

func (d *Detector) detectSYNFlood(now time.Time) {
	synPackets := d.protocolStats[6]

	if synPackets > d.config.SYNThreshold {
		targetIPs := d.findTargetIPsByProtocol(6)
		for _, ip := range targetIPs {
			d.addOrUpdateAlert(AttackTypeSYNFlood, "TCP SYN Flood", ip, 0, now)
		}
	}
}

func (d *Detector) detectUDPFlood(now time.Time) {
	udpPackets := d.protocolStats[17]

	if udpPackets > d.config.UDPThreshold {
		targetIPs := d.findTargetIPsByProtocol(17)
		for _, ip := range targetIPs {
			d.addOrUpdateAlert(AttackTypeUDPFlood, "UDP Flood", ip, 0, now)
		}
	}
}

func (d *Detector) detectICMPFlood(now time.Time) {
	icmpPackets := d.protocolStats[1]

	if icmpPackets > d.config.ICMPThreshold {
		targetIPs := d.findTargetIPsByProtocol(1)
		for _, ip := range targetIPs {
			d.addOrUpdateAlert(AttackTypeICMPFlood, "ICMP Flood", ip, 0, now)
		}
	}
}

func (d *Detector) detectPortScan(now time.Time) {
	for ip, stats := range d.ipStats {
		if len(stats.UniquePorts) > d.config.PortScanPorts {
			d.addOrUpdateAlert(AttackTypePortScan, "Port Scan Detected", ip, 0, now)
		}
	}
}

func (d *Detector) detectVolumeSpike(now time.Time) {
	if d.baseline.AvgBytesPerSec > d.config.MinTrafficBytes && d.baseline.StdDevBytes > 0 {
		zScore := (d.baseline.AvgBytesPerSec - float64(d.baseline.StdDevBytes)) / d.baseline.StdDevBytes
		if zScore > d.config.SpikeMultiplier {
			d.addOrUpdateAlert(AttackTypeAnomalyVolume, "Abnormal Traffic Volume Spike", "", 0, now)
		}
	}
}

func (d *Detector) findTargetIPsByProtocol(proto uint8) []string {
	targetSet := make(map[string]bool)
	for _, p := range d.recentPackets {
		if p.Protocol == proto {
			targetSet[p.DstIP] = true
		}
	}

	result := make([]string, 0, len(targetSet))
	for ip := range targetSet {
		result = append(result, ip)
	}
	return result
}

func (d *Detector) addOrUpdateAlert(attackType AttackType, desc, targetIP string, port uint16, now time.Time) {
	typeStr := attackTypeToString(attackType)
	severity := calculateSeverity(attackType)

	for i := range d.alerts {
		if d.alerts[i].Type == attackType &&
			d.alerts[i].TargetIP == targetIP &&
			d.alerts[i].Status == "active" {
			d.alerts[i].LastSeen = now
			d.alerts[i].Duration = now.Sub(d.alerts[i].StartAt)
			d.alerts[i].AttackFlowCount++
			return
		}
	}

	d.alertIDCounter++
	alert := AttackAlert{
		ID:          d.alertIDCounter,
		Type:        attackType,
		TypeStr:     typeStr,
		Severity:    severity,
		Description: desc,
		TargetIP:    targetIP,
		TargetPort:  port,
		StartAt:     now,
		LastSeen:    now,
		Status:      "active",
		Confidence:  0.85,
	}

	d.alerts = append(d.alerts, alert)

	if len(d.alerts) > 1000 {
		d.alerts = d.alerts[len(d.alerts)-1000:]
	}
}

func (d *Detector) GetAlerts(status string) []AttackAlert {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var result []AttackAlert
	for _, alert := range d.alerts {
		if status == "" || alert.Status == status {
			result = append(result, alert)
		}
	}
	return result
}

func (d *Detector) GetBaseline() TrafficBaseline {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.baseline
}

func (d *Detector) GetTopOffenders(limit int) map[string]interface{} {
	d.mu.RLock()
	defer d.mu.RUnlock()

	type offenderInfo struct {
		IP     string
		Bytes  uint64
		Flows  uint64
	}

	offenders := make([]offenderInfo, 0, len(d.ipStats))
	for ip, stats := range d.ipStats {
		offenders = append(offenders, offenderInfo{IP: ip, Bytes: stats.BytesSent, Flows: stats.FlowCount})
	}

	sortFunc := func(i, j int) bool {
		return offenders[i].Bytes > offenders[j].Bytes
	}

	result := make([]map[string]interface{}, 0)
	for _, o := range offenders {
		result = append(result, map[string]interface{}{
			"ip":     o.IP,
			"bytes":  o.Bytes,
			"flows":  o.Flows,
			"status": "active",
		})
	}

	_ = sortFunc

	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}

	return map[string]interface{}{
		"offenders": result,
		"total":     len(d.ipStats),
	}
}

func (d *Detector) UpdateConfig(config DetectionConfig) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.config = config
}

func (d *Detector) ResetStats() {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.ipStats = make(map[string]*IPStats)
	d.dstPortStats = make(map[uint16]map[string]*IPStats)
	d.srcPortStats = make(map[uint16]map[string]*IPStats)
	d.protocolStats = make(map[uint8]uint64)
	d.recentPackets = make([]packetRecord, 0)
	d.historyBytes = make([]float64, 0)
	d.historyPackets = make([]float64, 0)
}

func calculateStdDev(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}

	var mean float64
	for _, v := range values {
		mean += v
	}
	mean /= float64(len(values))

	var variance float64
	for _, v := range values {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(values))

	return math.Sqrt(variance)
}

func attackTypeToString(attackType AttackType) string {
	switch attackType {
	case AttackTypeSYNFlood:
		return "TCP SYN Flood"
	case AttackTypeUDPFlood:
		return "UDP Flood"
	case AttackTypeICMPFlood:
		return "ICMP Flood"
	case AttackTypePortScan:
		return "Port Scan"
	case AttackTypeSpoofedIP:
		return "Spoofed IP Address"
	case AttackTypeAnomalyVolume:
		return "Abnormal Volume"
	default:
		return "Unknown"
	}
}

func calculateSeverity(attackType AttackType) string {
	switch attackType {
	case AttackTypeSYNFlood, AttackTypeUDPFlood:
		return "critical"
	case AttackTypeICMPFlood:
		return "high"
	case AttackTypePortScan, AttackTypeAnomalyVolume:
		return "medium"
	case AttackTypeSpoofedIP:
		return "low"
	default:
		return "info"
	}
}

package backend

import (
	"sync"
	"time"
)

type ScannerFingerprint struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	FunctionCodes []uint8 `json:"function_codes"`
	MinRequests int      `json:"min_requests"`
	MaxInterval float64  `json:"max_interval"`
	MinInterval float64  `json:"min_interval"`
	Concurrency int      `json:"concurrency"`
	Pattern     string   `json:"pattern"`
	Weight      int      `json:"weight"`
}

type IPBehavior struct {
	IP             string
	FirstSeen      time.Time
	LastSeen       time.Time
	RequestCount   int
	FunctionCodes  map[uint8]int
	Intervals      []float64
	LastRequest    time.Time
	ConsecutiveReads int
	ConsecutiveWrites int
	DetectedScanners []string
	mu             sync.RWMutex
}

type FingerprintEngine struct {
	fingerprints  []ScannerFingerprint
	ipBehaviors   map[string]*IPBehavior
	mu            sync.RWMutex
	simulator     *ModbusSimulator
}

var knownScanners = []ScannerFingerprint{
	{
		Name:        "Nmap",
		Description: "Nmap网络扫描器 - 快速扫描标准端口",
		FunctionCodes: []uint8{0x01, 0x02, 0x03, 0x04},
		MinRequests: 4,
		MaxInterval: 0.5,
		MinInterval: 0.01,
		Concurrency: 10,
		Pattern:     "sequential_read",
		Weight:      80,
	},
	{
		Name:        "ModScan",
		Description: "ModScan - Modbus专用扫描工具",
		FunctionCodes: []uint8{0x03, 0x04, 0x06},
		MinRequests: 5,
		MaxInterval: 1.0,
		MinInterval: 0.1,
		Concurrency: 1,
		Pattern:     "slow_read",
		Weight:      90,
	},
	{
		Name:        "Shodan",
		Description: "Shodan搜索引擎爬虫 - 快速banner抓取",
		FunctionCodes: []uint8{0x03, 0x04},
		MinRequests: 2,
		MaxInterval: 0.2,
		MinInterval: 0.001,
		Concurrency: 50,
		Pattern:     "banner_grab",
		Weight:      85,
	},
	{
		Name:        "Rapid7 Sonar",
		Description: "Rapid7 Sonar互联网测绘",
		FunctionCodes: []uint8{0x03},
		MinRequests: 1,
		MaxInterval: 0.01,
		MinInterval: 0,
		Concurrency: 100,
		Pattern:     "single_probe",
		Weight:      75,
	},
	{
		Name:        "Custom Brute-force",
		Description: "自定义暴力扫描 - 探测所有功能码",
		FunctionCodes: []uint8{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0F, 0x10},
		MinRequests: 8,
		MaxInterval: 0.3,
		MinInterval: 0.005,
		Concurrency: 20,
		Pattern:     "function_code_bruteforce",
		Weight:      95,
	},
	{
		Name:        "Automated Exploit",
		Description: "自动化漏洞利用工具",
		FunctionCodes: []uint8{0x05, 0x06, 0x0F, 0x10},
		MinRequests: 3,
		MaxInterval: 2.0,
		MinInterval: 0.05,
		Concurrency: 5,
		Pattern:     "write_attempt",
		Weight:      100,
	},
}

func NewFingerprintEngine(sim *ModbusSimulator) *FingerprintEngine {
	return &FingerprintEngine{
		fingerprints: knownScanners,
		ipBehaviors:  make(map[string]*IPBehavior),
		simulator:    sim,
	}
}

func (fe *FingerprintEngine) TrackRequest(req ModbusRequest) {
	fe.mu.Lock()
	defer fe.mu.Unlock()

	behavior, exists := fe.ipBehaviors[req.SourceIP]
	now := time.Now()

	if !exists {
		behavior = &IPBehavior{
			IP:            req.SourceIP,
			FirstSeen:     now,
			FunctionCodes: make(map[uint8]int),
			DetectedScanners: make([]string, 0),
		}
		fe.ipBehaviors[req.SourceIP] = behavior
	}

	behavior.mu.Lock()
	defer behavior.mu.Unlock()

	behavior.LastSeen = now
	behavior.RequestCount++
	behavior.FunctionCodes[req.FunctionCode]++

	if !behavior.LastRequest.IsZero() {
		interval := now.Sub(behavior.LastRequest).Seconds()
		behavior.Intervals = append(behavior.Intervals, interval)
		if len(behavior.Intervals) > 50 {
			behavior.Intervals = behavior.Intervals[1:]
		}
	}
	behavior.LastRequest = now

	if req.FunctionCode <= 0x04 {
		behavior.ConsecutiveReads++
		behavior.ConsecutiveWrites = 0
	} else if req.FunctionCode >= 0x05 {
		behavior.ConsecutiveWrites++
		behavior.ConsecutiveReads = 0
	}

	scanners := fe.detectScannersLocked(behavior)
	for _, s := range scanners {
		if !containsString(behavior.DetectedScanners, s) {
			behavior.DetectedScanners = append(behavior.DetectedScanners, s)
		}
	}
}

func (fe *FingerprintEngine) detectScannersLocked(behavior *IPBehavior) []string {
	detected := make([]string, 0)

	if behavior.RequestCount < 1 {
		return detected
	}

	for _, fp := range fe.fingerprints {
		score := fe.calculateMatchScore(behavior, fp)
		if score >= fp.Weight {
			detected = append(detected, fp.Name)
		}
	}

	return detected
}

func (fe *FingerprintEngine) calculateMatchScore(behavior *IPBehavior, fp ScannerFingerprint) int {
	score := 0

	if behavior.RequestCount >= fp.MinRequests {
		score += 20
	}

	fcMatch := 0
	for _, fc := range fp.FunctionCodes {
		if behavior.FunctionCodes[fc] > 0 {
			fcMatch++
		}
	}
	if len(fp.FunctionCodes) > 0 {
		fcRatio := float64(fcMatch) / float64(len(fp.FunctionCodes))
		score += int(fcRatio * 30)
	}

	if len(behavior.Intervals) >= 3 {
		avgInterval := averageFloat64(behavior.Intervals)
		if avgInterval >= fp.MinInterval && avgInterval <= fp.MaxInterval {
			score += 25
		}
	}

	switch fp.Pattern {
	case "sequential_read":
		if behavior.ConsecutiveReads >= 4 {
			score += 25
		}
	case "write_attempt":
		if behavior.ConsecutiveWrites >= 2 {
			score += 25
		}
	case "function_code_bruteforce":
		if len(behavior.FunctionCodes) >= 5 {
			score += 25
		}
	case "single_probe":
		if behavior.RequestCount == 1 && fcMatch >= 1 {
			score += 25
		}
	case "banner_grab":
		if behavior.RequestCount <= 3 && fcMatch >= 1 {
			score += 25
		}
	case "slow_read":
		if len(behavior.Intervals) > 0 && averageFloat64(behavior.Intervals) > 0.1 {
			score += 25
		}
	}

	return score
}

func (fe *FingerprintEngine) GetIPBehavior(ip string) *IPBehavior {
	fe.mu.RLock()
	defer fe.mu.RUnlock()

	if behavior, exists := fe.ipBehaviors[ip]; exists {
		behavior.mu.RLock()
		defer behavior.mu.RUnlock()
		return behavior
	}
	return nil
}

func (fe *FingerprintEngine) GetAllBehaviors() []IPBehaviorSummary {
	fe.mu.RLock()
	defer fe.mu.RUnlock()

	summaries := make([]IPBehaviorSummary, 0, len(fe.ipBehaviors))
	for _, behavior := range fe.ipBehaviors {
		behavior.mu.RLock()
		summary := IPBehaviorSummary{
			IP:               behavior.IP,
			FirstSeen:        behavior.FirstSeen,
			LastSeen:         behavior.LastSeen,
			RequestCount:     behavior.RequestCount,
			DetectedScanners: append([]string{}, behavior.DetectedScanners...),
			IsScanner:        len(behavior.DetectedScanners) > 0,
		}
		behavior.mu.RUnlock()
		summaries = append(summaries, summary)
	}
	return summaries
}

type IPBehaviorSummary struct {
	IP               string    `json:"ip"`
	FirstSeen        time.Time `json:"first_seen"`
	LastSeen         time.Time `json:"last_seen"`
	RequestCount     int       `json:"request_count"`
	DetectedScanners []string  `json:"detected_scanners"`
	IsScanner        bool      `json:"is_scanner"`
}

func averageFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

func containsString(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

func (fe *FingerprintEngine) GetFingerprints() []ScannerFingerprint {
	return fe.fingerprints
}

func (fe *FingerprintEngine) GetScannerStats() map[string]int {
	fe.mu.RLock()
	defer fe.mu.RUnlock()

	stats := make(map[string]int)
	for _, behavior := range fe.ipBehaviors {
		behavior.mu.RLock()
		for _, scanner := range behavior.DetectedScanners {
			stats[scanner]++
		}
		behavior.mu.RUnlock()
	}
	return stats
}

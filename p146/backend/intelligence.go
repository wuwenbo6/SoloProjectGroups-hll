package backend

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"time"
)

type AttackIntel struct {
	IP             string    `json:"ip"`
	FirstSeen      time.Time `json:"first_seen"`
	LastSeen       time.Time `json:"last_seen"`
	RequestCount   int       `json:"request_count"`
	Scanners       []string  `json:"scanners,omitempty"`
	IsScanner      bool      `json:"is_scanner"`
	TrapTriggers   int       `json:"trap_triggers"`
	FunctionCodes  map[uint8]int `json:"function_codes"`
	SlavesAccessed map[uint8]int `json:"slaves_accessed"`
	Severity       string    `json:"severity"`
	RiskScore      int       `json:"risk_score"`
}

type IntelExport struct {
	GeneratedAt time.Time     `json:"generated_at"`
	TotalIPs    int           `json:"total_ips"`
	ScannerIPs  int           `json:"scanner_ips"`
	TotalEvents int           `json:"total_events"`
	Data        []AttackIntel `json:"data"`
}

func (s *ModbusSimulator) GenerateIntelligence() *IntelExport {
	behaviors := s.Fingerprint.GetAllBehaviors()
	logs := s.GetLogs()

	intelMap := make(map[string]*AttackIntel)

	for _, behavior := range behaviors {
		intel := &AttackIntel{
			IP:             behavior.IP,
			FirstSeen:      behavior.FirstSeen,
			LastSeen:       behavior.LastSeen,
			RequestCount:   behavior.RequestCount,
			Scanners:       behavior.DetectedScanners,
			IsScanner:      behavior.IsScanner,
			FunctionCodes:  make(map[uint8]int),
			SlavesAccessed: make(map[uint8]int),
		}
		intelMap[behavior.IP] = intel
	}

	for _, log := range logs {
		intel, exists := intelMap[log.SourceIP]
		if !exists {
			intel = &AttackIntel{
				IP:             log.SourceIP,
				FirstSeen:      log.Timestamp,
				LastSeen:       log.Timestamp,
				RequestCount:   1,
				FunctionCodes:  make(map[uint8]int),
				SlavesAccessed: make(map[uint8]int),
			}
			intelMap[log.SourceIP] = intel
		}

		intel.FunctionCodes[log.FunctionCode]++
		intel.SlavesAccessed[log.SlaveID]++

		if log.Timestamp.Before(intel.FirstSeen) {
			intel.FirstSeen = log.Timestamp
		}
		if log.Timestamp.After(intel.LastSeen) {
			intel.LastSeen = log.Timestamp
		}
		if log.TrapTriggered {
			intel.TrapTriggers++
		}
	}

	intelList := make([]AttackIntel, 0, len(intelMap))
	scannerCount := 0
	totalEvents := 0

	for _, intel := range intelMap {
		intel.RiskScore = calculateRiskScore(intel)
		intel.Severity = severityFromScore(intel.RiskScore)
		intelList = append(intelList, *intel)

		if intel.IsScanner {
			scannerCount++
		}
		totalEvents += intel.RequestCount
	}

	return &IntelExport{
		GeneratedAt: time.Now(),
		TotalIPs:    len(intelList),
		ScannerIPs:  scannerCount,
		TotalEvents: totalEvents,
		Data:        intelList,
	}
}

func calculateRiskScore(intel *AttackIntel) int {
	score := 0

	if intel.IsScanner {
		score += 40
	}

	if intel.TrapTriggers > 0 {
		score += 30
		if intel.TrapTriggers > 5 {
			score += 10
		}
	}

	if intel.RequestCount > 1000 {
		score += 20
	} else if intel.RequestCount > 100 {
		score += 10
	}

	writeOps := 0
	for fc, count := range intel.FunctionCodes {
		if fc >= 0x05 && fc <= 0x10 {
			writeOps += count
		}
	}
	if writeOps > 0 {
		score += 15
	}

	uniqueFCs := len(intel.FunctionCodes)
	if uniqueFCs >= 8 {
		score += 10
	} else if uniqueFCs >= 4 {
		score += 5
	}

	duration := intel.LastSeen.Sub(intel.FirstSeen).Seconds()
	if duration > 3600 && intel.RequestCount > 100 {
		score += 10
	}

	if score > 100 {
		score = 100
	}

	return score
}

func severityFromScore(score int) string {
	switch {
	case score >= 80:
		return "critical"
	case score >= 60:
		return "high"
	case score >= 40:
		return "medium"
	case score >= 20:
		return "low"
	default:
		return "info"
	}
}

func (s *ModbusSimulator) ExportJSON() ([]byte, error) {
	intel := s.GenerateIntelligence()
	return json.MarshalIndent(intel, "", "  ")
}

func (s *ModbusSimulator) ExportCSV() ([]byte, error) {
	intel := s.GenerateIntelligence()

	buf := make([]byte, 0)
	writer := csv.NewWriter(&csvBuffer{&buf})

	header := []string{"IP", "FirstSeen", "LastSeen", "RequestCount", "IsScanner",
		"Scanners", "TrapTriggers", "Severity", "RiskScore", "FunctionCodes", "SlavesAccessed"}
	if err := writer.Write(header); err != nil {
		return nil, err
	}

	for _, item := range intel.Data {
		scanners := ""
		for i, s := range item.Scanners {
			if i > 0 {
				scanners += ";"
			}
			scanners += s
		}

		fcs := ""
		for fc, count := range item.FunctionCodes {
			if fcs != "" {
				fcs += ";"
			}
			fcs += fmt.Sprintf("0x%02X:%d", fc, count)
		}

		slaves := ""
		for slave, count := range item.SlavesAccessed {
			if slaves != "" {
				slaves += ";"
			}
			slaves += fmt.Sprintf("%d:%d", slave, count)
		}

		row := []string{
			item.IP,
			item.FirstSeen.Format(time.RFC3339),
			item.LastSeen.Format(time.RFC3339),
			strconv.Itoa(item.RequestCount),
			strconv.FormatBool(item.IsScanner),
			scanners,
			strconv.Itoa(item.TrapTriggers),
			item.Severity,
			strconv.Itoa(item.RiskScore),
			fcs,
			slaves,
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}

	writer.Flush()
	return buf, writer.Error()
}

func (s *ModbusSimulator) ExportIOC() ([]byte, error) {
	intel := s.GenerateIntelligence()

	output := "# Modbus Honeypot IOC Export\n"
	output += fmt.Sprintf("# Generated: %s\n", intel.GeneratedAt.Format(time.RFC3339))
	output += fmt.Sprintf("# Total IPs: %d, Scanner IPs: %d, Total Events: %d\n\n",
		intel.TotalIPs, intel.ScannerIPs, intel.TotalEvents)

	output += "# High Risk IPs (Risk Score >= 60)\n"
	for _, item := range intel.Data {
		if item.RiskScore >= 60 {
			output += fmt.Sprintf("%s # %s - Risk: %d, Requests: %d, Scanners: %v\n",
				item.IP, item.Severity, item.RiskScore, item.RequestCount, item.Scanners)
		}
	}

	output += "\n# All Scanner IPs\n"
	for _, item := range intel.Data {
		if item.IsScanner {
			output += fmt.Sprintf("%s # %v\n", item.IP, item.Scanners)
		}
	}

	output += "\n# All IPs with Trap Triggers\n"
	for _, item := range intel.Data {
		if item.TrapTriggers > 0 {
			output += fmt.Sprintf("%s # Traps: %d\n", item.IP, item.TrapTriggers)
		}
	}

	output += "\n# IOC Format: IP, Description, Severity, First Seen, Last Seen\n"
	for _, item := range intel.Data {
		if item.RiskScore >= 40 {
			desc := "Modbus attacker"
			if item.IsScanner {
				desc = fmt.Sprintf("Modbus scanner (%v)", item.Scanners)
			}
			if item.TrapTriggers > 0 {
				desc += fmt.Sprintf(", %d trap triggers", item.TrapTriggers)
			}
			output += fmt.Sprintf("%s,\"%s\",%s,%s,%s\n",
				item.IP, desc, item.Severity,
				item.FirstSeen.Format(time.RFC3339),
				item.LastSeen.Format(time.RFC3339))
		}
	}

	return []byte(output), nil
}

type csvBuffer struct {
	buf *[]byte
}

func (b *csvBuffer) Write(p []byte) (n int, err error) {
	*b.buf = append(*b.buf, p...)
	return len(p), nil
}

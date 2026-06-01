package logger

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"sip-detector/types"
)

const (
	LogTypeAlert    = "alert"
	LogTypeBlock    = "block"
	LogTypeUnblock  = "unblock"
	LogTypeDetect   = "detect"
	LogTypeInfo     = "info"
)

type AttackLogger struct {
	logs       []*types.LogEntry
	maxLogs    int
	logDir     string
	mu         sync.RWMutex
}

func NewAttackLogger(logDir string, maxLogs int) *AttackLogger {
	l := &AttackLogger{
		logs:    make([]*types.LogEntry, 0, maxLogs),
		maxLogs: maxLogs,
		logDir:  logDir,
	}
	os.MkdirAll(logDir, 0755)
	return l
}

func (l *AttackLogger) AddLog(logType string, ip string, message string, rate float64, weightedRate float64, geoInfo *types.GeoInfo, details map[string]interface{}) {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry := &types.LogEntry{
		Timestamp:    time.Now(),
		Type:         logType,
		IP:           ip,
		Message:      message,
		Rate:         rate,
		WeightedRate: weightedRate,
		GeoInfo:      geoInfo,
		Details:      details,
	}

	l.logs = append(l.logs, entry)

	if len(l.logs) > l.maxLogs {
		l.logs = l.logs[len(l.logs)-l.maxLogs:]
	}
}

func (l *AttackLogger) GetLogs(limit int, logType string) []*types.LogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]*types.LogEntry, 0, len(l.logs))
	
	for i := len(l.logs) - 1; i >= 0; i-- {
		entry := l.logs[i]
		if logType == "" || entry.Type == logType {
			result = append(result, entry)
			if len(result) >= limit {
				break
			}
		}
	}

	return result
}

func (l *AttackLogger) GetAllLogs() []*types.LogEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make([]*types.LogEntry, len(l.logs))
	copy(result, l.logs)

	sort.Slice(result, func(i, j int) bool {
		return result[i].Timestamp.After(result[j].Timestamp)
	})

	return result
}

func (l *AttackLogger) ExportJSON(filename string) (string, error) {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if filename == "" {
		filename = fmt.Sprintf("attack_logs_%s.json", time.Now().Format("20060102_150405"))
	}

	filePath := filepath.Join(l.logDir, filename)

	data, err := json.MarshalIndent(l.logs, "", "  ")
	if err != nil {
		return "", err
	}

	err = os.WriteFile(filePath, data, 0644)
	if err != nil {
		return "", err
	}

	return filePath, nil
}

func (l *AttackLogger) ExportCSV(filename string) (string, error) {
	l.mu.RLock()
	defer l.mu.RUnlock()

	if filename == "" {
		filename = fmt.Sprintf("attack_logs_%s.csv", time.Now().Format("20060102_150405"))
	}

	filePath := filepath.Join(l.logDir, filename)

	file, err := os.Create(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	header := []string{
		"Timestamp",
		"Type",
		"IP",
		"Message",
		"Rate",
		"WeightedRate",
		"Country",
		"City",
		"Latitude",
		"Longitude",
	}
	writer.Write(header)

	for _, entry := range l.logs {
		country := ""
		city := ""
		latitude := ""
		longitude := ""

		if entry.GeoInfo != nil {
			country = entry.GeoInfo.Country
			city = entry.GeoInfo.City
			latitude = fmt.Sprintf("%.6f", entry.GeoInfo.Latitude)
			longitude = fmt.Sprintf("%.6f", entry.GeoInfo.Longitude)
		}

		row := []string{
			entry.Timestamp.Format(time.RFC3339),
			entry.Type,
			entry.IP,
			entry.Message,
			fmt.Sprintf("%.2f", entry.Rate),
			fmt.Sprintf("%.2f", entry.WeightedRate),
			country,
			city,
			latitude,
			longitude,
		}
		writer.Write(row)
	}

	return filePath, nil
}

func (l *AttackLogger) GetLogCount() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.logs)
}

func (l *AttackLogger) ClearLogs() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.logs = make([]*types.LogEntry, 0, l.maxLogs)
}

func (l *AttackLogger) GetLogDir() string {
	return l.logDir
}

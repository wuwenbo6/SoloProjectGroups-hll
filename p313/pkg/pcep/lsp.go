package pcep

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"pcep-server/pkg/cspf"
)

type LSPStatus string

const (
	LSPStatusActive  LSPStatus = "active"
	LSPStatusReroute LSPStatus = "rerouted"
	LSPStatusDown    LSPStatus = "down"
)

type LSP struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Source       string            `json:"source"`
	Target       string            `json:"target"`
	Bandwidth    float64           `json:"bandwidth"`
	Nodes        []string          `json:"nodes"`
	Links        []string          `json:"links"`
	Metric       int               `json:"metric"`
	Cost         float64           `json:"cost"`
	TotalLatency float64           `json:"total_latency"`
	MinBandwidth float64           `json:"min_bandwidth"`
	Affinity     cspf.Affinity     `json:"affinity"`
	Weights      cspf.WeightConfig `json:"weights"`
	Status       LSPStatus         `json:"status"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
	OldPaths     []LSPHistory      `json:"old_paths,omitempty"`
}

type LSPHistory struct {
	Nodes     []string  `json:"nodes"`
	Links     []string  `json:"links"`
	Metric    int       `json:"metric"`
	Cost      float64   `json:"cost"`
	ChangedAt time.Time `json:"changed_at"`
	Reason    string    `json:"reason"`
}

type LogType string

const (
	LogTypeCompute    LogType = "compute"
	LogTypeReserve    LogType = "reserve"
	LogTypeRelease    LogType = "release"
	LogTypeReoptimize LogType = "reoptimize"
	LogTypeLSPCreate  LogType = "lsp_create"
	LogTypeLSPDelete  LogType = "lsp_delete"
	LogTypeLSPUpdate  LogType = "lsp_update"
)

type ComputeLog struct {
	ID        uint64            `json:"id"`
	Timestamp time.Time         `json:"timestamp"`
	Type      LogType           `json:"type"`
	Source    string            `json:"source,omitempty"`
	Target    string            `json:"target,omitempty"`
	Bandwidth float64           `json:"bandwidth,omitempty"`
	Affinity  cspf.Affinity     `json:"affinity,omitempty"`
	Weights   cspf.WeightConfig `json:"weights,omitempty"`
	Success   bool              `json:"success"`
	Nodes     []string          `json:"nodes,omitempty"`
	Links     []string          `json:"links,omitempty"`
	Metric    int               `json:"metric,omitempty"`
	Cost      float64           `json:"cost,omitempty"`
	Message   string            `json:"message,omitempty"`
	LSPID     string            `json:"lsp_id,omitempty"`
	Duration  string            `json:"duration,omitempty"`
}

type LSPManager struct {
	lsps    map[string]*LSP
	logs    []ComputeLog
	mu      sync.RWMutex
	logMu   sync.RWMutex
	logFile *os.File
	nextID  uint64
	logSeq  uint64
}

func NewLSPManager(logPath string) *LSPManager {
	mgr := &LSPManager{
		lsps:   make(map[string]*LSP),
		logs:   make([]ComputeLog, 0),
		nextID: 1,
		logSeq: 1,
	}

	if logPath != "" {
		f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err == nil {
			mgr.logFile = f
		}
	}

	return mgr
}

func (m *LSPManager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.logMu.Lock()
	defer m.logMu.Unlock()
	if m.logFile != nil {
		m.logFile.Close()
	}
}

func (m *LSPManager) CreateLSP(name, source, target string, bandwidth float64, affinity cspf.Affinity, weights cspf.WeightConfig, path *cspf.PathResult) *LSP {
	m.mu.Lock()
	defer m.mu.Unlock()

	id := fmt.Sprintf("LSP-%d", m.nextID)
	m.nextID++

	now := time.Now()
	lsp := &LSP{
		ID:           id,
		Name:         name,
		Source:       source,
		Target:       target,
		Bandwidth:    bandwidth,
		Nodes:        path.Nodes,
		Links:        path.Links,
		Metric:       path.Metric,
		Cost:         path.Cost,
		TotalLatency: path.TotalLatency,
		MinBandwidth: path.MinBandwidth,
		Affinity:     affinity,
		Weights:      weights,
		Status:       LSPStatusActive,
		CreatedAt:    now,
		UpdatedAt:    now,
		OldPaths:     []LSPHistory{},
	}

	m.lsps[id] = lsp

	m.addLog(ComputeLog{
		Type:      LogTypeLSPCreate,
		Source:    source,
		Target:    target,
		Bandwidth: bandwidth,
		Affinity:  affinity,
		Weights:   weights,
		Success:   true,
		Nodes:     path.Nodes,
		Links:     path.Links,
		Metric:    path.Metric,
		Cost:      path.Cost,
		LSPID:     id,
		Message:   fmt.Sprintf("LSP created: %s", name),
	})

	return lsp
}

func (m *LSPManager) DeleteLSP(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	lsp, exists := m.lsps[id]
	if !exists {
		return false
	}

	lsp.Status = LSPStatusDown

	m.addLog(ComputeLog{
		Type:    LogTypeLSPDelete,
		Source:  lsp.Source,
		Target:  lsp.Target,
		Success: true,
		Nodes:   lsp.Nodes,
		Links:   lsp.Links,
		Metric:  lsp.Metric,
		LSPID:   id,
		Message: fmt.Sprintf("LSP deleted: %s", lsp.Name),
	})

	delete(m.lsps, id)
	return true
}

func (m *LSPManager) UpdateLSPPATH(id string, newPath *cspf.PathResult, reason string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	lsp, exists := m.lsps[id]
	if !exists {
		return false
	}

	history := LSPHistory{
		Nodes:     lsp.Nodes,
		Links:     lsp.Links,
		Metric:    lsp.Metric,
		Cost:      lsp.Cost,
		ChangedAt: time.Now(),
		Reason:    reason,
	}
	lsp.OldPaths = append(lsp.OldPaths, history)

	lsp.Nodes = newPath.Nodes
	lsp.Links = newPath.Links
	lsp.Metric = newPath.Metric
	lsp.Cost = newPath.Cost
	lsp.TotalLatency = newPath.TotalLatency
	lsp.MinBandwidth = newPath.MinBandwidth
	lsp.UpdatedAt = time.Now()
	lsp.Status = LSPStatusReroute

	m.addLog(ComputeLog{
		Type:    LogTypeLSPUpdate,
		Source:  lsp.Source,
		Target:  lsp.Target,
		Success: true,
		Nodes:   newPath.Nodes,
		Links:   newPath.Links,
		Metric:  newPath.Metric,
		Cost:    newPath.Cost,
		LSPID:   id,
		Message: fmt.Sprintf("LSP re-optimized (%s): %v -> %v", reason, history.Nodes, newPath.Nodes),
	})

	return true
}

func (m *LSPManager) GetLSP(id string) *LSP {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.lsps[id]
}

func (m *LSPManager) GetAllLSPs() []*LSP {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*LSP, 0, len(m.lsps))
	for _, lsp := range m.lsps {
		result = append(result, lsp)
	}
	return result
}

func (m *LSPManager) addLog(entry ComputeLog) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	entry.ID = m.logSeq
	m.logSeq++
	entry.Timestamp = time.Now()

	m.logs = append(m.logs, entry)

	if m.logFile != nil {
		data, _ := json.Marshal(entry)
		m.logFile.Write(append(data, '\n'))
	}
}

func (m *LSPManager) LogCompute(source, target string, bandwidth float64, affinity cspf.Affinity, weights cspf.WeightConfig, success bool, path *cspf.PathResult, message string, duration time.Duration) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	entry := ComputeLog{
		Type:      LogTypeCompute,
		Source:    source,
		Target:    target,
		Bandwidth: bandwidth,
		Affinity:  affinity,
		Weights:   weights,
		Success:   success,
		Message:   message,
		Duration:  duration.String(),
	}

	if success && path != nil {
		entry.Nodes = path.Nodes
		entry.Links = path.Links
		entry.Metric = path.Metric
		entry.Cost = path.Cost
	}

	entry.ID = m.logSeq
	m.logSeq++
	entry.Timestamp = time.Now()

	m.logs = append(m.logs, entry)

	if m.logFile != nil {
		data, _ := json.Marshal(entry)
		m.logFile.Write(append(data, '\n'))
	}
}

func (m *LSPManager) LogReserve(links []string, bandwidth float64, success bool) {
	m.logMu.Lock()
	defer m.logMu.Unlock()

	msg := fmt.Sprintf("Reserve BW %.0f on links %v", bandwidth, links)
	if !success {
		msg = fmt.Sprintf("Reserve FAILED BW %.0f on links %v", bandwidth, links)
	}

	entry := ComputeLog{
		Type:      LogTypeReserve,
		Bandwidth: bandwidth,
		Links:     links,
		Success:   success,
		Message:   msg,
	}
	entry.ID = m.logSeq
	m.logSeq++
	entry.Timestamp = time.Now()

	m.logs = append(m.logs, entry)

	if m.logFile != nil {
		data, _ := json.Marshal(entry)
		m.logFile.Write(append(data, '\n'))
	}
}

func (m *LSPManager) GetLogs(limit int, logType LogType) []ComputeLog {
	m.logMu.RLock()
	defer m.logMu.RUnlock()

	var filtered []ComputeLog
	for i := len(m.logs) - 1; i >= 0; i-- {
		if logType != "" && m.logs[i].Type != logType {
			continue
		}
		filtered = append(filtered, m.logs[i])
		if limit > 0 && len(filtered) >= limit {
			break
		}
	}

	if filtered == nil {
		filtered = []ComputeLog{}
	}
	return filtered
}

func (m *LSPManager) ExportLogsJSON() ([]byte, error) {
	m.logMu.RLock()
	defer m.logMu.RUnlock()
	return json.MarshalIndent(m.logs, "", "  ")
}

func (m *LSPManager) ExportLogsToFile(filename string) error {
	data, err := m.ExportLogsJSON()
	if err != nil {
		return err
	}
	return os.WriteFile(filename, data, 0644)
}

func (m *LSPManager) ClearLogs() {
	m.logMu.Lock()
	defer m.logMu.Unlock()
	m.logs = make([]ComputeLog, 0)
}

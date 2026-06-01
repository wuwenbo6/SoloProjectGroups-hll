package mlag

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"sync"
	"time"
)

func NewHeartbeatLogger(maxRecords int) *HeartbeatLogger {
	return &HeartbeatLogger{
		records:    make([]HeartbeatRecord, 0, maxRecords),
		maxRecords: maxRecords,
		nextID:     1,
	}
}

func (hl *HeartbeatLogger) Log(record HeartbeatRecord) {
	hl.mu.Lock()
	defer hl.mu.Unlock()

	record.ID = hl.nextID
	hl.nextID++

	hl.records = append(hl.records, record)

	if len(hl.records) > hl.maxRecords {
		hl.records = hl.records[1:]
	}
}

func (hl *HeartbeatLogger) GetAll() []HeartbeatRecord {
	hl.mu.RLock()
	defer hl.mu.RUnlock()

	result := make([]HeartbeatRecord, len(hl.records))
	copy(result, hl.records)
	return result
}

func (hl *HeartbeatLogger) GetLastN(n int) []HeartbeatRecord {
	hl.mu.RLock()
	defer hl.mu.RUnlock()

	if n >= len(hl.records) {
		result := make([]HeartbeatRecord, len(hl.records))
		copy(result, hl.records)
		return result
	}

	start := len(hl.records) - n
	result := make([]HeartbeatRecord, n)
	copy(result, hl.records[start:])
	return result
}

func (hl *HeartbeatLogger) Count() int {
	hl.mu.RLock()
	defer hl.mu.RUnlock()
	return len(hl.records)
}

func (hl *HeartbeatLogger) ExportJSON(filename string) error {
	hl.mu.RLock()
	defer hl.mu.RUnlock()

	data, err := json.MarshalIndent(hl.records, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filename, data, 0644)
}

func (hl *HeartbeatLogger) ExportCSV(filename string) error {
	hl.mu.RLock()
	defer hl.mu.RUnlock()

	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	header := []string{"ID", "Source", "Dest", "SeqNum", "Role", "Timestamp", "LatencyMs", "Received", "PeerAlive"}
	if err := writer.Write(header); err != nil {
		return err
	}

	for _, r := range hl.records {
		row := []string{
			strconv.FormatUint(r.ID, 10),
			r.Source,
			r.Dest,
			strconv.FormatUint(r.SeqNum, 10),
			string(r.Role),
			r.Timestamp.Format(time.RFC3339),
			strconv.FormatInt(r.LatencyMs, 10),
			strconv.FormatBool(r.Received),
			strconv.FormatBool(r.PeerAlive),
		}
		if err := writer.Write(row); err != nil {
			return err
		}
	}

	return nil
}

func (hl *HeartbeatLogger) Clear() {
	hl.mu.Lock()
	defer hl.mu.Unlock()
	hl.records = make([]HeartbeatRecord, 0, hl.maxRecords)
}

func (s *Switch) CheckConsistency() *ConsistencyReport {
	if s.Peer == nil {
		return &ConsistencyReport{
			OverallStatus: ConsistencyError,
			CheckedAt:     time.Now(),
			MismatchCount: 1,
			Items: []ConsistencyItem{
				{
					Category:    "Peer",
					Status:      ConsistencyError,
					Description: "Peer not configured",
				},
			},
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	s.Peer.mu.RLock()
	defer s.Peer.mu.RUnlock()

	report := &ConsistencyReport{
		CheckedAt: time.Now(),
		Items:     make([]ConsistencyItem, 0),
	}

	checkItem := func(category, localVal, peerVal, desc string) {
		status := ConsistencyOK
		if localVal != peerVal {
			status = ConsistencyMismatch
			report.MismatchCount++
		} else {
			report.OKCount++
		}
		report.Items = append(report.Items, ConsistencyItem{
			Category:    category,
			LocalValue:  localVal,
			PeerValue:   peerVal,
			Status:      status,
			Description: desc,
		})
	}

	checkItem("MLAG Domain", s.Config.DomainID, s.Peer.Config.DomainID, "MLAG域ID必须一致")
	checkItem("Heartbeat Interval", s.Config.HeartbeatInterval.String(), s.Peer.Config.HeartbeatInterval.String(), "心跳间隔必须一致")
	checkItem("Dead Interval", s.Config.DeadInterval.String(), s.Peer.Config.DeadInterval.String(), "死亡间隔必须一致")
	checkItem("Failback Timer", s.Config.FailbackTimer.String(), s.Peer.Config.FailbackTimer.String(), "回切定时器建议一致")
	checkItem("MAC Drift Window", s.Config.MacDriftWindow.String(), s.Peer.Config.MacDriftWindow.String(), "MAC漂移窗口建议一致")
	checkItem("MAC Drift Threshold", fmt.Sprintf("%d", s.Config.MacDriftThreshold), fmt.Sprintf("%d", s.Peer.Config.MacDriftThreshold), "MAC漂移阈值建议一致")
	checkItem("Port Count", fmt.Sprintf("%d", len(s.Ports)), fmt.Sprintf("%d", len(s.Peer.Ports)), "端口数量应一致")

	if s.MacTable != nil && s.Peer.MacTable != nil {
		checkItem("MAC Table Size", fmt.Sprintf("%d", len(s.MacTable.Entries)), fmt.Sprintf("%d", len(s.Peer.MacTable.Entries)), "MAC表大小应接近")
	}

	for i := range report.Items {
		portKey := fmt.Sprintf("Port-%d-State", i)
		if i < len(s.Ports) && i < len(s.Peer.Ports) {
			localPorts := make([]*Port, 0, len(s.Ports))
			for _, p := range s.Ports {
				localPorts = append(localPorts, p)
			}
			peerPorts := make([]*Port, 0, len(s.Peer.Ports))
			for _, p := range s.Peer.Ports {
				peerPorts = append(peerPorts, p)
			}
			if i < len(localPorts) && i < len(peerPorts) {
				checkItem(portKey, string(localPorts[i].State), string(peerPorts[i].State), fmt.Sprintf("端口%s状态应一致", localPorts[i].Name))
			}
		}
	}

	if report.MismatchCount > 0 {
		report.OverallStatus = ConsistencyMismatch
	} else {
		report.OverallStatus = ConsistencyOK
	}

	return report
}

func (s *Switch) runConsistencyCheckLoop(wg *sync.WaitGroup) {
	defer wg.Done()

	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			report := s.CheckConsistency()
			s.mu.Lock()
			s.LastConsistency = report
			s.mu.Unlock()
		}
	}
}

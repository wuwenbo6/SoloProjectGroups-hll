package main

import (
	"fmt"
	"strconv"
	"sync"
	"time"
)

type HistoryManager struct {
	mu      sync.Mutex
	records []BindingUpdateRecord
}

func NewHistoryManager() *HistoryManager {
	return &HistoryManager{
		records: make([]BindingUpdateRecord, 0),
	}
}

func (hm *HistoryManager) AddRecord(rec BindingUpdateRecord) {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	rec.ID = fmt.Sprintf("BUR-%s-%04d", time.Now().Format("20060102150405"), len(hm.records)+1)
	rec.Timestamp = time.Now()
	hm.records = append(hm.records, rec)
}

func (hm *HistoryManager) GetAll() []BindingUpdateRecord {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	result := make([]BindingUpdateRecord, len(hm.records))
	copy(result, hm.records)
	return result
}

func (hm *HistoryManager) GetByMN(mnID string) []BindingUpdateRecord {
	hm.mu.Lock()
	defer hm.mu.Unlock()
	result := make([]BindingUpdateRecord, 0)
	for _, r := range hm.records {
		if r.MNID == mnID {
			result = append(result, r)
		}
	}
	return result
}

func (hm *HistoryManager) ExportJSON(mnIDFilter string) ExportResponse {
	records := hm.GetAll()
	if mnIDFilter != "" && mnIDFilter != "*" {
		records = hm.GetByMN(mnIDFilter)
	}
	return ExportResponse{
		Format:      "json",
		GeneratedAt: time.Now(),
		Total:       len(records),
		Records:     records,
	}
}

func (hm *HistoryManager) ExportCSV(mnIDFilter string) ([][]string, error) {
	records := hm.GetAll()
	if mnIDFilter != "" && mnIDFilter != "*" {
		records = hm.GetByMN(mnIDFilter)
	}

	header := []string{
		"ID", "Timestamp", "MN_ID", "MN_Prefix",
		"Old_MAG_Address", "New_MAG_Address",
		"Old_Access_Tech", "New_Access_Tech",
		"Lifetime", "Operation", "Status", "Message",
		"QoS_Profile_ID", "QoS_Total_Bandwidth_kbps",
	}

	rows := make([][]string, 0, len(records)+1)
	rows = append(rows, header)

	for _, r := range records {
		var qosID, qosBW string
		if r.QoSProfile != nil {
			qosID = r.QoSProfile.ProfileID
			qosBW = strconv.Itoa(r.QoSProfile.TotalBandwidth())
		}
		row := []string{
			r.ID,
			r.Timestamp.Format(time.RFC3339),
			r.MNID,
			r.MNPrefix,
			r.OldMAGAddress,
			r.NewMAGAddress,
			string(r.OldAccessTech),
			string(r.NewAccessTech),
			strconv.Itoa(r.Lifetime),
			r.Operation,
			r.Status,
			r.Message,
			qosID,
			qosBW,
		}
		rows = append(rows, row)
	}

	return rows, nil
}

func (hm *HistoryManager) WriteCSV(records [][]string) string {
	var result string
	for _, row := range records {
		for i, col := range row {
			if i > 0 {
				result += ","
			}
			result += csvEscape(col)
		}
		result += "\n"
	}
	return result
}

func csvEscape(s string) string {
	if len(s) == 0 {
		return ""
	}
	needsQuote := false
	for _, c := range s {
		if c == ',' || c == '"' || c == '\n' || c == '\r' {
			needsQuote = true
			break
		}
	}
	if needsQuote {
		escaped := ""
		for _, c := range s {
			if c == '"' {
				escaped += "\"\""
			} else {
				escaped += string(c)
			}
		}
		return "\"" + escaped + "\""
	}
	return s
}

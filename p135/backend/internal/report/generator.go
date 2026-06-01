package report

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"sflow-analyzer/pkg/types"
)

type ReportType string

const (
	ReportTypeTopN      ReportType = "topn"
	ReportTypeHistorical ReportType = "historical"
	ReportTypeAlerts    ReportType = "alerts"
	ReportTypeSummary   ReportType = "summary"
	ReportTypeFull      ReportType = "full"
)

type ReportFormat string

const (
	FormatCSV  ReportFormat = "csv"
	FormatJSON ReportFormat = "json"
	FormatTXT  ReportFormat = "txt"
)

type ReportConfig struct {
	Type      ReportType
	Format    ReportFormat
	StartTime time.Time
	EndTime   time.Time
	TopN      int
	ASNFilter uint32
	Title     string
}

type ReportData struct {
	Title     string                 `json:"title"`
	ReportType ReportType            `json:"report_type"`
	Generated time.Time              `json:"generated_at"`
	Period    string                 `json:"period"`
	Summary   map[string]interface{} `json:"summary"`
	TopIPPairs []types.IPPairStats   `json:"top_ip_pairs,omitempty"`
	TopApps    []types.AppStats      `json:"top_apps,omitempty"`
	Alerts    []interface{}          `json:"alerts,omitempty"`
	Historical []types.FlowRecord    `json:"historical,omitempty"`
}

type Generator struct {
	outputDir string
}

func NewGenerator(outputDir string) *Generator {
	if outputDir == "" {
		outputDir = "./reports"
	}
	os.MkdirAll(outputDir, 0755)
	return &Generator{outputDir: outputDir}
}

func (g *Generator) GenerateTopNReport(data *types.TopNResult, config ReportConfig) (string, []byte, error) {
	reportData := ReportData{
		Title:      config.Title,
		ReportType: ReportTypeTopN,
		Generated:  time.Now(),
		Period:     fmt.Sprintf("%s to %s", config.StartTime.Format(time.RFC3339), config.EndTime.Format(time.RFC3339)),
		Summary: map[string]interface{}{
			"total_ip_pairs": len(data.IPPairs),
			"total_apps":     len(data.Apps),
			"total_bytes":    calculateTotalBytes(data),
			"total_packets":  calculateTotalPackets(data),
		},
		TopIPPairs: data.IPPairs,
		TopApps:    data.Apps,
	}

	return g.formatReport(reportData, config)
}

func (g *Generator) GenerateHistoricalReport(records []types.FlowRecord, config ReportConfig) (string, []byte, error) {
	reportData := ReportData{
		Title:      config.Title,
		ReportType: ReportTypeHistorical,
		Generated:  time.Now(),
		Period:     fmt.Sprintf("%s to %s", config.StartTime.Format(time.RFC3339), config.EndTime.Format(time.RFC3339)),
		Summary: map[string]interface{}{
			"total_records": len(records),
			"total_bytes":   calculateHistoricalTotalBytes(records),
			"total_packets": calculateHistoricalTotalPackets(records),
		},
		Historical: records,
	}

	return g.formatReport(reportData, config)
}

func (g *Generator) GenerateAlertsReport(alerts []interface{}, config ReportConfig) (string, []byte, error) {
	reportData := ReportData{
		Title:      config.Title,
		ReportType: ReportTypeAlerts,
		Generated:  time.Now(),
		Period:     fmt.Sprintf("%s to %s", config.StartTime.Format(time.RFC3339), config.EndTime.Format(time.RFC3339)),
		Summary: map[string]interface{}{
			"total_alerts": len(alerts),
			"alerts_by_type": countAlertsByType(alerts),
		},
		Alerts: alerts,
	}

	return g.formatReport(reportData, config)
}

func (g *Generator) GenerateFullReport(data *types.TopNResult, records []types.FlowRecord, alerts []interface{}, config ReportConfig) (string, []byte, error) {
	reportData := ReportData{
		Title:      config.Title,
		ReportType: ReportTypeFull,
		Generated:  time.Now(),
		Period:     fmt.Sprintf("%s to %s", config.StartTime.Format(time.RFC3339), config.EndTime.Format(time.RFC3339)),
		Summary: map[string]interface{}{
			"top_ip_pairs_count": len(data.IPPairs),
			"top_apps_count":     len(data.Apps),
			"historical_records": len(records),
			"alerts_count":       len(alerts),
		},
		TopIPPairs: data.IPPairs,
		TopApps:    data.Apps,
		Alerts:    alerts,
		Historical: records,
	}

	return g.formatReport(reportData, config)
}

func (g *Generator) formatReport(data ReportData, config ReportConfig) (string, []byte, error) {
	switch config.Format {
	case FormatJSON:
		return g.formatJSON(data, config)
	case FormatCSV:
		return g.formatCSV(data, config)
	case FormatTXT:
		return g.formatTXT(data, config)
	default:
		return g.formatJSON(data, config)
	}
}

func (g *Generator) formatJSON(data ReportData, config ReportConfig) (string, []byte, error) {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", nil, fmt.Errorf("marshal JSON: %w", err)
	}

	filename := g.generateFilename(config, "json")
	return filename, jsonData, nil
}

func (g *Generator) formatCSV(data ReportData, config ReportConfig) (string, []byte, error) {
	var builder strings.Builder
	writer := csv.NewWriter(&builder)

	writer.Write([]string{fmt.Sprintf("Report: %s", data.Title)})
	writer.Write([]string{fmt.Sprintf("Generated: %s", data.Generated.Format(time.RFC3339))})
	writer.Write([]string{fmt.Sprintf("Period: %s", data.Period)})
	writer.Write([]string{})

	if data.TopIPPairs != nil {
		writer.Write([]string{"--- Top IP Pairs ---"})
		writer.Write([]string{"Rank", "Source IP", "Destination IP", "Source ASN", "Dest ASN", "Bytes", "Packets"})
		for i, pair := range data.TopIPPairs {
			writer.Write([]string{
				fmt.Sprintf("%d", i+1),
				pair.SrcIP,
				pair.DstIP,
				fmt.Sprintf("AS%d", pair.SrcASN),
				fmt.Sprintf("AS%d", pair.DstASN),
				fmt.Sprintf("%d", pair.Bytes),
				fmt.Sprintf("%d", pair.Packets),
			})
		}
		writer.Write([]string{})
	}

	if data.TopApps != nil {
		writer.Write([]string{"--- Top Applications ---"})
		writer.Write([]string{"Rank", "Application", "Port", "Protocol", "Bytes", "Packets"})
		for i, app := range data.TopApps {
			writer.Write([]string{
				fmt.Sprintf("%d", i+1),
				app.AppName,
				fmt.Sprintf("%d", app.Port),
				app.ProtocolStr,
				fmt.Sprintf("%d", app.Bytes),
				fmt.Sprintf("%d", app.Packets),
			})
		}
		writer.Write([]string{})
	}

	if data.Historical != nil {
		writer.Write([]string{"--- Historical Records ---"})
		writer.Write([]string{"Timestamp", "Source IP", "Dest IP", "Source Port", "Dest Port", "Protocol", "Bytes", "Packets"})
		for _, rec := range data.Historical {
			writer.Write([]string{
				rec.Timestamp.Format(time.RFC3339),
				rec.SrcIP,
				rec.DstIP,
				fmt.Sprintf("%d", rec.SrcPort),
				fmt.Sprintf("%d", rec.DstPort),
				rec.ProtocolStr,
				fmt.Sprintf("%d", rec.Bytes),
				fmt.Sprintf("%d", rec.Packets),
			})
		}
		writer.Write([]string{})
	}

	writer.Write([]string{"--- Summary ---"})
	for key, value := range data.Summary {
		writer.Write([]string{key, fmt.Sprintf("%v", value)})
	}

	writer.Flush()

	filename := g.generateFilename(config, "csv")
	return filename, []byte(builder.String()), nil
}

func (g *Generator) formatTXT(data ReportData, config ReportConfig) (string, []byte, error) {
	var builder strings.Builder

	builder.WriteString(fmt.Sprintf("╔══════════════════════════════════════════════════════════════╗\n"))
	builder.WriteString(fmt.Sprintf("║  %-58s ║\n", data.Title))
	builder.WriteString(fmt.Sprintf("╠══════════════════════════════════════════════════════════════╣\n"))
	builder.WriteString(fmt.Sprintf("║  Generated: %-48s ║\n", data.Generated.Format(time.RFC3339)))
	builder.WriteString(fmt.Sprintf("║  Period: %-51s ║\n", data.Period))
	builder.WriteString(fmt.Sprintf("╚══════════════════════════════════════════════════════════════╝\n\n"))

	if data.TopIPPairs != nil {
		builder.WriteString("━━━ Top IP Pairs ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
		builder.WriteString(fmt.Sprintf("%-5s %-20s %-20s %-10s %-10s %-12s %-10s\n", "Rank", "Source IP", "Dest IP", "Src ASN", "Dst ASN", "Bytes", "Packets"))
		builder.WriteString(strings.Repeat("-", 95) + "\n")
		for i, pair := range data.TopIPPairs {
			builder.WriteString(fmt.Sprintf("%-5d %-20s %-20s %-10d %-10d %-12d %-10d\n",
				i+1, pair.SrcIP, pair.DstIP, pair.SrcASN, pair.DstASN, pair.Bytes, pair.Packets))
		}
		builder.WriteString("\n")
	}

	if data.TopApps != nil {
		builder.WriteString("━━━ Top Applications ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
		builder.WriteString(fmt.Sprintf("%-5s %-20s %-10s %-10s %-12s %-10s\n", "Rank", "Application", "Port", "Protocol", "Bytes", "Packets"))
		builder.WriteString(strings.Repeat("-", 75) + "\n")
		for i, app := range data.TopApps {
			builder.WriteString(fmt.Sprintf("%-5d %-20s %-10d %-10s %-12d %-10d\n",
				i+1, app.AppName, app.Port, app.ProtocolStr, app.Bytes, app.Packets))
		}
		builder.WriteString("\n")
	}

	builder.WriteString("━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")
	for key, value := range data.Summary {
		builder.WriteString(fmt.Sprintf("  %-30s: %v\n", key, value))
	}
	builder.WriteString("\n")

	filename := g.generateFilename(config, "txt")
	return filename, []byte(builder.String()), nil
}

func (g *Generator) SaveReport(filename string, data []byte) (string, error) {
	fullPath := filepath.Join(g.outputDir, filename)

	file, err := os.Create(fullPath)
	if err != nil {
		return "", fmt.Errorf("create file: %w", err)
	}
	defer file.Close()

	_, err = file.Write(data)
	if err != nil {
		return "", fmt.Errorf("write file: %w", err)
	}

	return fullPath, nil
}

func (g *Generator) generateFilename(config ReportConfig, ext string) string {
	timestamp := time.Now().Format("20060102_150405")
	title := strings.ReplaceAll(config.Title, " ", "_")
	title = strings.ReplaceAll(title, "/", "_")
	return fmt.Sprintf("sflow_%s_%s_%s.%s", title, config.Type, timestamp, ext)
}

func calculateTotalBytes(data *types.TopNResult) uint64 {
	var total uint64
	for _, pair := range data.IPPairs {
		total += pair.Bytes
	}
	return total
}

func calculateTotalPackets(data *types.TopNResult) uint32 {
	var total uint32
	for _, pair := range data.IPPairs {
		total += pair.Packets
	}
	return total
}

func calculateHistoricalTotalBytes(records []types.FlowRecord) uint64 {
	var total uint64
	for _, rec := range records {
		total += rec.Bytes
	}
	return total
}

func calculateHistoricalTotalPackets(records []types.FlowRecord) uint32 {
	var total uint32
	for _, rec := range records {
		total += rec.Packets
	}
	return total
}

func countAlertsByType(alerts []interface{}) map[string]int {
	counts := make(map[string]int)
	for _, alert := range alerts {
		if a, ok := alert.(map[string]interface{}); ok {
			if typeStr, ok := a["type_str"].(string); ok {
				counts[typeStr]++
			}
		}
	}
	return counts
}

func SortTopNByBytes(data *types.TopNResult) {
	sort.Slice(data.IPPairs, func(i, j int) bool {
		return data.IPPairs[i].Bytes > data.IPPairs[j].Bytes
	})
	sort.Slice(data.Apps, func(i, j int) bool {
		return data.Apps[i].Bytes > data.Apps[j].Bytes
	})
}

func FilterByASN(data *types.TopNResult, asn uint32) *types.TopNResult {
	if asn == 0 {
		return data
	}

	filtered := &types.TopNResult{}

	for _, pair := range data.IPPairs {
		if pair.SrcASN == asn || pair.DstASN == asn {
			filtered.IPPairs = append(filtered.IPPairs, pair)
		}
	}

	filtered.Apps = data.Apps

	return filtered
}

package reporting

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
	"time"

	"log-analyzer/internal/es"
)

type ReportGenerator struct {
	es *es.Client
}

type ReportData struct {
	GeneratedAt time.Time `json:"generated_at"`
	Title       string    `json:"title"`
	Summary     ReportSummary
	Alerts      []map[string]interface{} `json:"alerts"`
	Events      []map[string]interface{} `json:"events"`
	TopSources  []SourceStat             `json:"top_sources"`
}

type ReportSummary struct {
	TotalAlerts   int `json:"total_alerts"`
	HighSeverity  int `json:"high_severity"`
	MedSeverity   int `json:"medium_severity"`
	LowSeverity   int `json:"low_severity"`
	NewAlerts     int `json:"new_alerts"`
	ResolvedAlerts int `json:"resolved_alerts"`
	TotalEvents   int `json:"total_events"`
}

type SourceStat struct {
	Source string `json:"source"`
	Count  int    `json:"count"`
}

func NewReportGenerator(es *es.Client) *ReportGenerator {
	return &ReportGenerator{es: es}
}

func (rg *ReportGenerator) GenerateReport(startTime, endTime time.Time) (*ReportData, error) {
	query := map[string]interface{}{
		"query": map[string]interface{}{
			"range": map[string]interface{}{
				"timestamp": map[string]interface{}{
					"gte": startTime.Format(time.RFC3339),
					"lte": endTime.Format(time.RFC3339),
				},
			},
		},
	}

	alerts, err := rg.es.Search("alerts", query, 1000)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch alerts: %w", err)
	}

	events, err := rg.es.Search("events", query, 1000)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch events: %w", err)
	}

	summary := rg.calculateSummary(alerts, events)
	topSources := rg.calculateTopSources(events, 10)

	return &ReportData{
		GeneratedAt: time.Now(),
		Title:       fmt.Sprintf("Security Report - %s to %s", 
			startTime.Format("2006-01-02"), endTime.Format("2006-01-02")),
		Summary:    summary,
		Alerts:     alerts,
		Events:     events,
		TopSources: topSources,
	}, nil
}

func (rg *ReportGenerator) calculateSummary(alerts, events []map[string]interface{}) ReportSummary {
	summary := ReportSummary{
		TotalAlerts: len(alerts),
		TotalEvents: len(events),
	}

	for _, alert := range alerts {
		severity, _ := alert["severity"].(string)
		switch severity {
		case "high":
			summary.HighSeverity++
		case "medium":
			summary.MedSeverity++
		case "low":
			summary.LowSeverity++
		}

		status, _ := alert["status"].(string)
		switch status {
		case "new":
			summary.NewAlerts++
		case "resolved":
			summary.ResolvedAlerts++
		}
	}

	return summary
}

func (rg *ReportGenerator) calculateTopSources(events []map[string]interface{}, limit int) []SourceStat {
	sourceCount := make(map[string]int)
	for _, event := range events {
		if source, ok := event["source"].(string); ok {
			sourceCount[source]++
		}
		if hostname, ok := event["hostname"].(string); ok {
			sourceCount[hostname]++
		}
	}

	sources := make([]SourceStat, 0, len(sourceCount))
	for s, c := range sourceCount {
		sources = append(sources, SourceStat{Source: s, Count: c})
	}

	for i := 0; i < len(sources); i++ {
		for j := i + 1; j < len(sources); j++ {
			if sources[j].Count > sources[i].Count {
				sources[i], sources[j] = sources[j], sources[i]
			}
		}
	}

	if len(sources) > limit {
		sources = sources[:limit]
	}

	return sources
}

func (rg *ReportGenerator) ExportCSV(data *ReportData) ([]byte, error) {
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)

	writer.Write([]string{"Security Report"})
	writer.Write([]string{"Generated At", data.GeneratedAt.Format(time.RFC3339)})
	writer.Write([]string{})

	writer.Write([]string{"Summary"})
	writer.Write([]string{"Metric", "Value"})
	writer.Write([]string{"Total Alerts", fmt.Sprintf("%d", data.Summary.TotalAlerts)})
	writer.Write([]string{"High Severity", fmt.Sprintf("%d", data.Summary.HighSeverity)})
	writer.Write([]string{"Medium Severity", fmt.Sprintf("%d", data.Summary.MedSeverity)})
	writer.Write([]string{"Low Severity", fmt.Sprintf("%d", data.Summary.LowSeverity)})
	writer.Write([]string{"New Alerts", fmt.Sprintf("%d", data.Summary.NewAlerts)})
	writer.Write([]string{"Resolved Alerts", fmt.Sprintf("%d", data.Summary.ResolvedAlerts)})
	writer.Write([]string{"Total Events", fmt.Sprintf("%d", data.Summary.TotalEvents)})
	writer.Write([]string{})

	writer.Write([]string{"Alerts"})
	writer.Write([]string{"ID", "Rule Name", "Severity", "Status", "Timestamp", "Description"})
	for _, alert := range data.Alerts {
		id, _ := alert["id"].(string)
		ruleName, _ := alert["rule_name"].(string)
		severity, _ := alert["severity"].(string)
		status, _ := alert["status"].(string)
		timestamp, _ := alert["timestamp"].(string)
		description, _ := alert["description"].(string)
		writer.Write([]string{id, ruleName, severity, status, timestamp, description})
	}

	writer.Flush()
	return buf.Bytes(), nil
}

func (rg *ReportGenerator) ExportJSON(data *ReportData) ([]byte, error) {
	return json.MarshalIndent(data, "", "  ")
}

func (rg *ReportGenerator) ExportHTML(data *ReportData) ([]byte, error) {
	const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{.Title}}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 40px; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #1f2937; margin-bottom: 20px; }
        .generated { color: #6b7280; margin-bottom: 30px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-card h3 { color: #6b7280; font-size: 14px; font-weight: 500; margin-bottom: 8px; }
        .stat-card .value { font-size: 32px; font-weight: bold; color: #1f2937; }
        .high .value { color: #dc2626; }
        .medium .value { color: #d97706; }
        .low .value { color: #16a34a; }
        h2 { color: #1f2937; margin: 30px 0 15px; font-size: 20px; }
        table { width: 100%; background: white; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th { background: #1f2937; color: white; padding: 12px 16px; text-align: left; font-weight: 500; }
        td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; }
        tr:hover { background: #f9fafb; }
        .severity-high { color: #dc2626; font-weight: 500; }
        .severity-medium { color: #d97706; font-weight: 500; }
        .severity-low { color: #16a34a; font-weight: 500; }
        .status-new { color: #dc2626; }
        .status-resolved { color: #16a34a; }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{.Title}}</h1>
        <p class="generated">Generated on {{.GeneratedAt.Format "2006-01-02 15:04:05 MST"}}</p>

        <div class="summary-grid">
            <div class="stat-card">
                <h3>Total Alerts</h3>
                <div class="value">{{.Summary.TotalAlerts}}</div>
            </div>
            <div class="stat-card high">
                <h3>High Severity</h3>
                <div class="value">{{.Summary.HighSeverity}}</div>
            </div>
            <div class="stat-card medium">
                <h3>Medium Severity</h3>
                <div class="value">{{.Summary.MedSeverity}}</div>
            </div>
            <div class="stat-card low">
                <h3>Low Severity</h3>
                <div class="value">{{.Summary.LowSeverity}}</div>
            </div>
            <div class="stat-card">
                <h3>New Alerts</h3>
                <div class="value">{{.Summary.NewAlerts}}</div>
            </div>
            <div class="stat-card">
                <h3>Total Events</h3>
                <div class="value">{{.Summary.TotalEvents}}</div>
            </div>
        </div>

        <h2>Alerts</h2>
        <table>
            <thead>
                <tr>
                    <th>Rule</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
                {{range .Alerts}}
                <tr>
                    <td>{{.rule_name}}</td>
                    <td class="severity-{{.severity}}">{{.severity}}</td>
                    <td class="status-{{.status}}">{{.status}}</td>
                    <td>{{.timestamp}}</td>
                    <td>{{.description}}</td>
                </tr>
                {{end}}
            </tbody>
        </table>

        <h2>Top Sources</h2>
        <table>
            <thead>
                <tr>
                    <th>Source</th>
                    <th>Count</th>
                </tr>
            </thead>
            <tbody>
                {{range .TopSources}}
                <tr>
                    <td>{{.Source}}</td>
                    <td>{{.Count}}</td>
                </tr>
                {{end}}
            </tbody>
        </table>
    </div>
</body>
</html>`

	tmpl, err := template.New("report").Parse(htmlTemplate)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

func (rg *ReportGenerator) ExportMarkdown(data *ReportData) ([]byte, error) {
	var sb strings.Builder

	sb.WriteString("# " + data.Title + "\n\n")
	sb.WriteString("*Generated on " + data.GeneratedAt.Format(time.RFC3339) + "*\n\n")

	sb.WriteString("## Summary\n\n")
	sb.WriteString("| Metric | Value |\n")
	sb.WriteString("|--------|-------|\n")
	sb.WriteString(fmt.Sprintf("| Total Alerts | %d |\n", data.Summary.TotalAlerts))
	sb.WriteString(fmt.Sprintf("| High Severity | %d |\n", data.Summary.HighSeverity))
	sb.WriteString(fmt.Sprintf("| Medium Severity | %d |\n", data.Summary.MedSeverity))
	sb.WriteString(fmt.Sprintf("| Low Severity | %d |\n", data.Summary.LowSeverity))
	sb.WriteString(fmt.Sprintf("| New Alerts | %d |\n", data.Summary.NewAlerts))
	sb.WriteString(fmt.Sprintf("| Total Events | %d |\n", data.Summary.TotalEvents))
	sb.WriteString("\n")

	sb.WriteString("## Alerts\n\n")
	sb.WriteString("| Rule | Severity | Status | Description |\n")
	sb.WriteString("|------|----------|--------|-------------|\n")
	for _, alert := range data.Alerts {
		ruleName, _ := alert["rule_name"].(string)
		severity, _ := alert["severity"].(string)
		status, _ := alert["status"].(string)
		description, _ := alert["description"].(string)
		sb.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", ruleName, severity, status, description))
	}
	sb.WriteString("\n")

	sb.WriteString("## Top Sources\n\n")
	sb.WriteString("| Source | Count |\n")
	sb.WriteString("|--------|-------|\n")
	for _, src := range data.TopSources {
		sb.WriteString(fmt.Sprintf("| %s | %d |\n", src.Source, src.Count))
	}

	return []byte(sb.String()), nil
}

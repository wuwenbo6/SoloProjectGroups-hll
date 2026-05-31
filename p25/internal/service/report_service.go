package service

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type ReportService struct {
	db *database.Database
}

func NewReportService(db *database.Database) *ReportService {
	return &ReportService{db: db}
}

func (s *ReportService) GeneratePRReport(ctx context.Context, reportType string, startDate, endDate time.Time) (*models.PRReport, error) {
	avgPR, minPR, maxPR, avgTemp, avgIrradiance, err := s.db.GetPRStats(ctx, startDate, endDate)
	if err != nil {
		return nil, err
	}

	plantData, err := s.db.GetHistoricalData(ctx, startDate, endDate)
	if err != nil {
		return nil, err
	}

	var totalEnergy, peakHours float64
	if len(plantData) > 0 {
		totalEnergy = plantData[len(plantData)-1].TotalEnergy - plantData[0].TotalEnergy
		for _, d := range plantData {
			if d.PRValue > 0.5 {
				peakHours += 5.0 / 60
			}
		}
	}

	cleaningRecords, _ := s.db.GetCleaningRecords(ctx, "", 100)
	cleaningCount := 0
	for _, r := range cleaningRecords {
		if r.ScheduledTime.After(startDate) && r.ScheduledTime.Before(endDate) {
			cleaningCount++
		}
	}

	alarms, _ := s.db.GetActiveAlarms(ctx)
	alarmCount := len(alarms)

	report := &models.PRReport{
		ID:                "RPT-" + time.Now().Format("20060102") + "-" + reportType,
		ReportType:        reportType,
		StartDate:         startDate,
		EndDate:           endDate,
		GeneratedAt:       time.Now(),
		AvgPR:             avgPR,
		MinPR:             minPR,
		MaxPR:             maxPR,
		TotalEnergy:       totalEnergy,
		TheoreticalEnergy: totalEnergy / avgPR * 0.85,
		AvgTemperature:    avgTemp,
		AvgIrradiance:     avgIrradiance,
		PeakHours:         peakHours,
		CleaningEvents:    cleaningCount,
		AlarmCount:        alarmCount,
		Status:            "completed",
	}

	s.db.InsertPRReport(ctx, report)
	return report, nil
}

func (s *ReportService) ExportCSV(ctx context.Context, report *models.PRReport) ([]byte, error) {
	records := [][]string{
		{"光伏电站PR分析报告"},
		{"", ""},
		{"报告类型", report.ReportType},
		{"开始日期", report.StartDate.Format("2006-01-02 15:04:05")},
		{"结束日期", report.EndDate.Format("2006-01-02 15:04:05")},
		{"生成时间", report.GeneratedAt.Format("2006-01-02 15:04:05")},
		{"", ""},
		{"性能指标", "", ""},
		{"指标", "数值", "单位"},
		{"平均PR值", fmt.Sprintf("%.2f", report.AvgPR*100), "%"},
		{"最小PR值", fmt.Sprintf("%.2f", report.MinPR*100), "%"},
		{"最大PR值", fmt.Sprintf("%.2f", report.MaxPR*100), "%"},
		{"实际发电量", fmt.Sprintf("%.2f", report.TotalEnergy), "kWh"},
		{"理论发电量", fmt.Sprintf("%.2f", report.TheoreticalEnergy), "kWh"},
		{"峰值利用小时", fmt.Sprintf("%.2f", report.PeakHours), "h"},
		{"", ""},
		{"环境条件", "", ""},
		{"平均环境温度", fmt.Sprintf("%.2f", report.AvgTemperature), "°C"},
		{"平均辐照度", fmt.Sprintf("%.2f", report.AvgIrradiance), "W/m²"},
		{"", ""},
		{"运维记录", "", ""},
		{"清洗次数", strconv.Itoa(report.CleaningEvents), "次"},
		{"告警次数", strconv.Itoa(report.AlarmCount), "次"},
	}

	output, err := csvToBytes(records)
	if err != nil {
		return nil, err
	}

	plantData, _ := s.db.GetHistoricalData(ctx, report.StartDate, report.EndDate)
	if len(plantData) > 0 {
		output = append(output, []byte("\n\n详细数据\n")...)
		detailHeader := []string{"时间", "总功率(kW)", "总发电量(kWh)", "PR值(%)", "逆变器数量"}
		detailRecords := [][]string{detailHeader}
		for _, d := range plantData {
			detailRecords = append(detailRecords, []string{
				d.Timestamp.Format("2006-01-02 15:04:05"),
				fmt.Sprintf("%.2f", d.TotalPower/1000),
				fmt.Sprintf("%.2f", d.TotalEnergy),
				fmt.Sprintf("%.2f", d.PRValue*100),
				strconv.Itoa(d.InverterCount),
			})
		}
		detailBytes, _ := csvToBytes(detailRecords)
		output = append(output, detailBytes...)
	}

	return output, nil
}

func (s *ReportService) ExportJSON(ctx context.Context, report *models.PRReport) ([]byte, error) {
	type ReportExport struct {
		Report       *models.PRReport        `json:"report"`
		Summary      map[string]interface{} `json:"summary"`
		Recommendations []string            `json:"recommendations"`
	}

	summary := map[string]interface{}{
		"pr_rating":       s.getPRRating(report.AvgPR),
		"efficiency_loss": (1 - report.AvgPR) * 100,
		"performance_gap": (report.TheoreticalEnergy - report.TotalEnergy),
	}

	recommendations := s.generateRecommendations(report)

	export := ReportExport{
		Report:          report,
		Summary:         summary,
		Recommendations: recommendations,
	}

	return json.MarshalIndent(export, "", "  ")
}

func (s *ReportService) getPRRating(pr float64) string {
	switch {
	case pr >= 0.85:
		return "优秀"
	case pr >= 0.80:
		return "良好"
	case pr >= 0.75:
		return "一般"
	case pr >= 0.70:
		return "较差"
	default:
		return "很差"
	}
}

func (s *ReportService) generateRecommendations(report *models.PRReport) []string {
	var recs []string

	if report.AvgPR < 0.75 {
		recs = append(recs, "PR值偏低，建议检查组件清洁情况和系统效率")
	}

	if report.AvgTemperature > 35 {
		recs = append(recs, "运行温度偏高，建议检查通风和散热情况")
	}

	if report.CleaningEvents == 0 && report.AvgPR < 0.80 {
		recs = append(recs, "建议安排组件清洗以提高发电效率")
	}

	if report.AlarmCount > 5 {
		recs = append(recs, "告警次数较多，建议排查系统异常")
	}

	if len(recs) == 0 {
		recs = append(recs, "系统运行正常，继续保持定期巡检")
	}

	return recs
}

func csvToBytes(records [][]string) ([]byte, error) {
	pipeReader, pipeWriter := make(chan []byte), make(chan error)
	go func() {
		_ = pipeReader
		_ = pipeWriter
	}()

	var result []byte
	for _, row := range records {
		line := ""
		for i, field := range row {
			if i > 0 {
				line += ","
			}
			if containsComma(field) {
				line += "\"" + field + "\""
			} else {
				line += field
			}
		}
		result = append(result, []byte(line+"\n")...)
	}
	return result, nil
}

func containsComma(s string) bool {
	for _, c := range s {
		if c == ',' {
			return true
		}
	}
	return false
}

func (s *ReportService) GetReportHistory(ctx context.Context, limit int) ([]*models.PRReport, error) {
	return s.db.GetPRReports(ctx, limit)
}

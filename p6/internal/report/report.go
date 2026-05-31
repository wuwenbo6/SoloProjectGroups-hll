package report

import (
	"leakage-monitor/internal/database"
	"leakage-monitor/internal/models"
	"time"
)

func GenerateWeeklyReport(sensorID string) (*models.ReportData, error) {
	end := time.Now()
	start := end.AddDate(0, 0, -7)

	return generateReport(sensorID, "weekly", start, end)
}

func GenerateMonthlyReport(sensorID string) (*models.ReportData, error) {
	end := time.Now()
	start := end.AddDate(0, -1, 0)

	return generateReport(sensorID, "monthly", start, end)
}

func generateReport(sensorID, period string, start, end time.Time) (*models.ReportData, error) {
	data, err := database.GetSensorDataTimeRange(sensorID, start, end)
	if err != nil {
		return nil, err
	}

	if len(data) == 0 {
		return &models.ReportData{
			Period:          period,
			StartDate:       start,
			EndDate:         end,
			SensorID:        sensorID,
			PollutionLevels: make(map[int]int64),
		}, nil
	}

	var totalCurrent float64
	var maxCurrent float64
	var totalPulses int64
	pollutionLevels := make(map[int]int64)

	for _, d := range data {
		totalCurrent += d.PeakCurrent
		if d.PeakCurrent > maxCurrent {
			maxCurrent = d.PeakCurrent
		}
		totalPulses += int64(d.PulseCount)
		pollutionLevels[d.PollutionLevel]++
	}

	avgCurrent := totalCurrent / float64(len(data))

	alertCount, err := getAlertCount(sensorID, start, end)
	if err != nil {
		alertCount = 0
	}

	return &models.ReportData{
		Period:          period,
		StartDate:       start,
		EndDate:         end,
		SensorID:        sensorID,
		AvgCurrent:      avgCurrent,
		MaxCurrent:      maxCurrent,
		TotalPulses:     totalPulses,
		PollutionLevels: pollutionLevels,
		AlertCount:      alertCount,
	}, nil
}

func getAlertCount(sensorID string, start, end time.Time) (int64, error) {
	var count int64
	query := `
		SELECT COUNT(*)
		FROM alerts
		WHERE sensor_id = $1 AND timestamp >= $2 AND timestamp <= $3
	`
	err := database.DB.Get(&count, query, sensorID, start, end)
	return count, err
}

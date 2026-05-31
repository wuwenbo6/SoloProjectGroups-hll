package service

import (
	"context"
	"log"
	"math"
	"time"

	"github.com/google/uuid"

	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type CleaningService struct {
	db *database.Database
}

func NewCleaningService(db *database.Database) *CleaningService {
	return &CleaningService{db: db}
}

func (s *CleaningService) ProcessDroneInspections() error {
	ctx := context.Background()
	inspections, err := s.db.GetUnprocessedInspections(ctx)
	if err != nil {
		return err
	}

	for _, insp := range inspections {
		if insp.SoilingRate > 15 || insp.NeedsCleaning {
			strategies, err := s.db.GetCleaningStrategies(ctx)
			if err != nil {
				continue
			}

			for _, strat := range strategies {
				if strat.InverterID == insp.InverterID && strat.Enabled {
					if insp.SoilingRate >= strat.ThresholdSoiling {
						s.scheduleCleaning(ctx, insp.InverterID, insp)
					}
				}
			}
		}

		insp.Processed = true
		s.db.InsertDroneInspection(ctx, insp)
	}

	if len(inspections) > 0 {
		log.Printf("Processed %d drone inspections", len(inspections))
	}
	return nil
}

func (s *CleaningService) scheduleCleaning(ctx context.Context, inverterID string, insp *models.DroneInspection) {
	scheduledTime := time.Now().Add(48 * time.Hour)

	record := &models.CleaningRecord{
		ID:            "CLN-" + uuid.New().String()[:8],
		InverterID:    inverterID,
		ScheduledTime: scheduledTime,
		Method:        "drone_water",
		Cost:          500.0,
		Status:        "scheduled",
		Operator:      "auto_scheduler",
		Notes:         "Scheduled based on drone inspection data",
	}

	if err := s.db.InsertCleaningRecord(ctx, record); err != nil {
		log.Printf("Failed to schedule cleaning: %v", err)
	} else {
		log.Printf("Scheduled cleaning for %s at %s", inverterID, scheduledTime.Format(time.RFC3339))
	}
}

func (s *CleaningService) ProcessScheduledCleanings() error {
	ctx := context.Background()
	records, err := s.db.GetCleaningRecords(ctx, "", 50)
	if err != nil {
		return err
	}

	now := time.Now()
	for _, record := range records {
		if record.Status == "scheduled" && record.ScheduledTime.Before(now) {
			record.Status = "completed"
			record.CompletedTime = now
			record.PRAfter = record.PRBefore * 1.15

			if err := s.db.InsertCleaningRecord(ctx, record); err != nil {
				log.Printf("Failed to update cleaning record: %v", err)
			} else {
				log.Printf("Completed cleaning: %s", record.ID)
			}
		}
	}

	return nil
}

func (s *CleaningService) CalculateSoilingRate(inverterID string, currentPR float64) float64 {
	baselinePR := 0.85
	if currentPR <= 0 {
		return 0
	}
	soilingRate := (baselinePR - currentPR) / baselinePR * 100
	return math.Max(0, math.Min(100, soilingRate))
}

func (s *CleaningService) GetSoilingTrend(ctx context.Context, inverterID string, days int) ([]*models.SoilingTrend, error) {
	end := time.Now()
	start := end.AddDate(0, 0, -days)

	plantData, err := s.db.GetHistoricalData(ctx, start, end)
	if err != nil {
		return nil, err
	}

	var trends []*models.SoilingTrend
	for _, data := range plantData {
		soilingRate := s.CalculateSoilingRate(inverterID, data.PRValue)
		trends = append(trends, &models.SoilingTrend{
			InverterID:    inverterID,
			Date:          data.Timestamp,
			SoilingRate:   soilingRate,
			PRValue:       data.PRValue,
			DaysSinceClean: 0,
		})
	}

	return trends, nil
}

func (s *CleaningService) SimulateDroneInspection(inverterID string) *models.DroneInspection {
	now := time.Now()
	ambientTemp := 25 + math.Sin(float64(now.Hour())/12*math.Pi)*10
	hotSpotTemp := ambientTemp + 5 + math.Abs(now.Sub(now.Truncate(24*time.Hour)).Hours()-12)*3
	tempDiff := hotSpotTemp - ambientTemp

	baseSoiling := 5.0
	hoursSinceLastClean := 168.0
	soilingRate := baseSoiling + hoursSinceLastClean/24*1.5

	inspection := &models.DroneInspection{
		ID:            "DRN-" + uuid.New().String()[:8],
		Timestamp:     now,
		InverterID:    inverterID,
		PanelID:       "P-001",
		HotSpotTemp:   hotSpotTemp,
		AmbientTemp:   ambientTemp,
		TempDiff:      tempDiff,
		SoilingRate:   soilingRate,
		ImageURL:      "/images/drone/" + inverterID + "-" + now.Format("20060102") + ".jpg",
		Severity:      "low",
		NeedsCleaning: soilingRate > 20,
		Processed:     false,
	}

	if soilingRate > 15 {
		inspection.Severity = "medium"
	}
	if soilingRate > 25 {
		inspection.Severity = "high"
	}

	ctx := context.Background()
	s.db.InsertDroneInspection(ctx, inspection)
	log.Printf("Simulated drone inspection for %s: soiling=%.1f%%", inverterID, soilingRate)

	return inspection
}

func (s *CleaningService) InitDefaultStrategies(ctx context.Context, inverters []string) {
	for _, inv := range inverters {
		strategy := &models.CleaningStrategy{
			ID:              "STRAT-" + inv,
			Name:            "智能清洗策略 - " + inv,
			InverterID:      inv,
			Type:            "hybrid",
			ThresholdPR:     0.70,
			ThresholdSoiling: 20.0,
			IntervalDays:    90,
			Enabled:         true,
		}
		s.db.UpsertCleaningStrategy(ctx, strategy)
	}
	log.Printf("Initialized default cleaning strategies for %d inverters", len(inverters))
}

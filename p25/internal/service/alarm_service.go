package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"

	"pv-monitor/internal/config"
	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type AlarmService struct {
	db          *database.Database
	cfg         *config.AlarmConfig
	lastPower   map[string]float64
}

func NewAlarmService(db *database.Database, cfg *config.AlarmConfig) *AlarmService {
	return &AlarmService{
		db:        db,
		cfg:       cfg,
		lastPower: make(map[string]float64),
	}
}

func (s *AlarmService) CheckAlarms() error {
	ctx := context.Background()
	inverterData, err := s.db.GetAllLatestInverterData(ctx)
	if err != nil {
		return err
	}

	for _, data := range inverterData {
		if lastPower, exists := s.lastPower[data.InverterID]; exists && lastPower > 0 {
			dropPercentage := ((lastPower - data.Power) / lastPower) * 100

			if dropPercentage >= s.cfg.PowerDropThreshold {
				alarm := &models.Alarm{
					ID:           generateAlarmID(),
					InverterID:   data.InverterID,
					Type:         "POWER_DROP",
					Message:      fmt.Sprintf("逆变器 %s 功率下降超过 %.1f%%", data.InverterID, dropPercentage),
					Severity:     "WARNING",
					Value:        dropPercentage,
					Threshold:    s.cfg.PowerDropThreshold,
					Timestamp:    time.Now(),
					Acknowledged: false,
				}

				if err := s.db.InsertAlarm(ctx, alarm); err != nil {
					log.Printf("Failed to insert alarm: %v", err)
				} else {
					log.Printf("ALARM: %s - Power dropped %.2f%%", data.InverterID, dropPercentage)
				}
			}
		}

		s.lastPower[data.InverterID] = data.Power
	}

	return nil
}

func (s *AlarmService) GetActiveAlarms() ([]*models.Alarm, error) {
	ctx := context.Background()
	return s.db.GetActiveAlarms(ctx)
}

func (s *AlarmService) AcknowledgeAlarm(alarmID string) error {
	ctx := context.Background()
	return s.db.AcknowledgeAlarm(ctx, alarmID)
}

func generateAlarmID() string {
	return "ALM-" + uuid.New().String()[:8]
}

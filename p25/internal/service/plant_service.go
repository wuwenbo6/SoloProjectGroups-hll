package service

import (
	"context"
	"log"
	"math"
	"time"

	"pv-monitor/internal/config"
	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type PlantService struct {
	db                *database.Database
	cfg               *config.Config
	ratedPower        float64
	lastEnergyByInv   map[string]float64
	lastTimestampByInv map[string]time.Time
}

func NewPlantService(db *database.Database, cfg *config.Config) *PlantService {
	var totalRatedPower float64
	for _, inv := range cfg.Inverters {
		totalRatedPower += inv.RatedPower
	}

	service := &PlantService{
		db:                db,
		cfg:               cfg,
		ratedPower:        totalRatedPower,
		lastEnergyByInv:   make(map[string]float64),
		lastTimestampByInv: make(map[string]time.Time),
	}

	service.initFromDB()
	return service
}

func (s *PlantService) initFromDB() {
	ctx := context.Background()
	inverterData, err := s.db.GetAllLatestInverterData(ctx)
	if err != nil {
		log.Printf("Warning: failed to init from DB: %v", err)
		return
	}

	for _, data := range inverterData {
		s.lastEnergyByInv[data.InverterID] = data.Energy
		s.lastTimestampByInv[data.InverterID] = data.Timestamp
	}

	log.Printf("Initialized %d inverters from database", len(inverterData))
}

func (s *PlantService) AggregateData() error {
	ctx := context.Background()

	inverterData, err := s.db.GetAllLatestInverterData(ctx)
	if err != nil {
		return err
	}

	if len(inverterData) == 0 {
		return nil
	}

	var totalPower, totalEnergyDelta, totalEfficiency, totalTemperature float64
	var validInverterCount int

	for _, data := range inverterData {
		totalPower += data.Power
		if data.Efficiency > 0 {
			totalEfficiency += data.Efficiency
		}
		totalTemperature += data.Temperature
		validInverterCount++

		lastEnergy, hasLast := s.lastEnergyByInv[data.InverterID]
		lastTimestamp, hasLastTs := s.lastTimestampByInv[data.InverterID]

		if hasLast && hasLastTs {
			if data.Timestamp.After(lastTimestamp) {
				delta := data.Energy - lastEnergy
				if delta >= 0 && delta < 10000 {
					totalEnergyDelta += delta
				}
			}
		}

		s.lastEnergyByInv[data.InverterID] = data.Energy
		s.lastTimestampByInv[data.InverterID] = data.Timestamp
	}

	avgEfficiency := 0.0
	avgTemperature := 25.0
	if validInverterCount > 0 {
		avgEfficiency = totalEfficiency / float64(validInverterCount)
		avgTemperature = totalTemperature / float64(validInverterCount)
	}

	prValue := s.calculatePR(totalPower, avgTemperature)

	prevPlantData, _ := s.db.GetLatestPlantData(ctx)
	var totalEnergy float64
	if prevPlantData != nil {
		totalEnergy = prevPlantData.TotalEnergy + totalEnergyDelta
	} else {
		totalEnergy = totalEnergyDelta
	}

	plantData := &models.PlantData{
		Timestamp:     time.Now(),
		TotalPower:    totalPower,
		TotalEnergy:   totalEnergy,
		PRValue:       prValue,
		AvgEfficiency: avgEfficiency,
		InverterCount: len(inverterData),
	}

	if err := s.db.InsertPlantData(ctx, plantData); err != nil {
		log.Printf("Failed to insert plant data: %v", err)
		return err
	}

	s.simulateIRRadiance()

	log.Printf("Plant data aggregated: TotalPower=%.2fW, PR=%.2f%%, EnergyDelta=%.2fkWh, Inverters=%d",
		totalPower, prValue*100, totalEnergyDelta, len(inverterData))

	return nil
}

func (s *PlantService) calculatePR(actualPower, avgTemperature float64) float64 {
	if s.ratedPower == 0 {
		return 0
	}

	irradiance := s.getCurrentIRRadiance()
	if irradiance <= 0 {
		irradiance = 1000
	}

	tempCoef := -0.004
	tempRef := 25.0
	tempCorrection := 1 + tempCoef*(avgTemperature-tempRef)

	theoreticalPower := (s.ratedPower * irradiance * tempCorrection) / 1000.0
	if theoreticalPower <= 0 {
		return 0
	}

	pr := actualPower / theoreticalPower
	return math.Max(0, math.Min(1.5, pr))
}

func (s *PlantService) getCurrentIRRadiance() float64 {
	ctx := context.Background()
	now := time.Now()
	radianceData, err := s.db.GetIRRadiance(ctx, now.Add(-5*time.Minute), now)
	if err != nil || len(radianceData) == 0 {
		hour := time.Now().Hour()
		if hour >= 6 && hour <= 18 {
			return 800
		}
		return 100
	}

	return radianceData[len(radianceData)-1].Value
}

func (s *PlantService) simulateIRRadiance() {
	ctx := context.Background()
	now := time.Now()
	hour := float64(now.Hour()) + float64(now.Minute())/60.0

	var irradiance float64
	if hour >= 6 && hour <= 18 {
		peakHour := 12.0
		spread := 6.0
		irradiance = 1000 * math.Exp(-math.Pow(hour-peakHour, 2)/(2*spread*spread))
		irradiance += (math.Sin(float64(now.Unix())/100) * 50)
	} else {
		irradiance = 10
	}

	irradiance = math.Max(0, math.Min(1200, irradiance))

	s.db.InsertIRRadiance(ctx, &models.IRRadiance{
		Timestamp: now,
		Value:     irradiance,
	})
}

func (s *PlantService) GetPlantSummary() (*models.PlantData, error) {
	ctx := context.Background()
	data, err := s.db.GetLatestPlantData(ctx)
	if err != nil {
		return nil, err
	}
	return data, nil
}

func (s *PlantService) GetInverterSummary() ([]*models.InverterData, error) {
	ctx := context.Background()
	return s.db.GetAllLatestInverterData(ctx)
}

func (s *PlantService) GetDailyReport(date string) (*models.DailyReport, error) {
	ctx := context.Background()
	return s.db.GetDailyReport(ctx, date)
}

func (s *PlantService) GetMonthlyReport(year, month int) (*models.MonthlyReport, error) {
	ctx := context.Background()
	return s.db.GetMonthlyReport(ctx, year, month)
}

func (s *PlantService) GetYearlyReport(year int) (*models.YearlyReport, error) {
	ctx := context.Background()
	return s.db.GetYearlyReport(ctx, year)
}

func (s *PlantService) GetHistoricalData(start, end time.Time) ([]*models.PlantData, error) {
	ctx := context.Background()
	return s.db.GetHistoricalData(ctx, start, end)
}

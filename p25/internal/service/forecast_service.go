package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/google/uuid"

	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
)

type ForecastService struct {
	db         *database.Database
	httpClient *http.Client
	apiKey     string
}

func NewForecastService(db *database.Database, apiKey string) *ForecastService {
	return &ForecastService{
		db:         db,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		apiKey:     apiKey,
	}
}

func (s *ForecastService) FetchWeatherData() (*models.WeatherData, error) {
	weather := &models.WeatherData{
		Timestamp:     time.Now(),
		Temperature:   25.0,
		Humidity:      60.0,
		WindSpeed:     5.0,
		CloudCover:    20.0,
		Visibility:    10.0,
		UVIndex:       5.0,
		Precipitation: 0.0,
		Condition:     "sunny",
	}

	hour := float64(time.Now().Hour())
	if hour >= 6 && hour <= 18 {
		weather.Temperature = 20 + math.Sin((hour-6)/12*math.Pi)*15
		weather.UVIndex = 8 * math.Sin((hour-6)/12*math.Pi)
	}

	noise := (math.Sin(float64(time.Now().Unix())/3600) - 0.5) * 10
	weather.CloudCover = math.Max(0, math.Min(100, weather.CloudCover+noise))

	if weather.CloudCover > 70 {
		weather.Condition = "cloudy"
	} else if weather.CloudCover > 30 {
		weather.Condition = "partly_cloudy"
	}

	ctx := context.Background()
	s.db.InsertWeatherData(ctx, weather)

	return weather, nil
}

func (s *ForecastService) GenerateForecast(horizonHours int) error {
	ctx := context.Background()
	now := time.Now()

	ratedPower := 150000.0
	efficiency := 0.82

	for h := 1; h <= horizonHours; h++ {
		forecastTime := now.Add(time.Duration(h) * time.Hour)
		hour := float64(forecastTime.Hour())

		var solarFactor float64
		if hour >= 6 && hour <= 18 {
			solarFactor = math.Sin((hour - 6) / 12 * math.Pi)
		} else {
			solarFactor = 0
		}

		cloudFactor := 1.0 - 0.005*30
		tempFactor := 1.0 - 0.004*(28-25)

		predictedPower := ratedPower * solarFactor * cloudFactor * tempFactor * efficiency
		predictedEnergy := predictedPower / 1000

		confidence := 0.95 - float64(h)*0.02
		confLower := predictedPower * (confidence - 0.1)
		confUpper := predictedPower * (confidence + 0.1)

		forecast := &models.GenerationForecast{
			Timestamp:       now,
			ForecastTime:    forecastTime,
			HorizonHours:    h,
			PredictedPower:  math.Max(0, predictedPower),
			PredictedEnergy: math.Max(0, predictedEnergy),
			ConfidenceLower: math.Max(0, confLower),
			ConfidenceUpper: confUpper,
			ModelVersion:    "v1.0-sim",
			WeatherSource:   "simulated",
		}

		s.db.InsertForecast(ctx, forecast)
	}

	log.Printf("Generated %dh generation forecast", horizonHours)
	return nil
}

func (s *ForecastService) FetchOpenWeatherMap(lat, lon float64) (*models.WeatherData, error) {
	if s.apiKey == "" {
		return s.FetchWeatherData()
	}

	url := fmt.Sprintf(
		"https://api.openweathermap.org/data/2.5/weather?lat=%.6f&lon=%.6f&appid=%s&units=metric",
		lat, lon, s.apiKey,
	)

	resp, err := s.httpClient.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var owmResp struct {
		Main struct {
			Temp     float64 `json:"temp"`
			Humidity float64 `json:"humidity"`
		} `json:"main"`
		Wind struct {
			Speed float64 `json:"speed"`
		} `json:"wind"`
		Clouds struct {
			All float64 `json:"all"`
		} `json:"clouds"`
		Visibility int `json:"visibility"`
		Weather []struct {
			Main string `json:"main"`
		} `json:"weather"`
	}

	if err := json.Unmarshal(body, &owmResp); err != nil {
		return nil, err
	}

	weather := &models.WeatherData{
		Timestamp:     time.Now(),
		Temperature:   owmResp.Main.Temp,
		Humidity:      owmResp.Main.Humidity,
		WindSpeed:     owmResp.Wind.Speed,
		CloudCover:    owmResp.Clouds.All,
		Visibility:    float64(owmResp.Visibility) / 1000,
		UVIndex:       5.0,
		Precipitation: 0,
		Condition:     "clear",
	}

	if len(owmResp.Weather) > 0 {
		weather.Condition = owmResp.Weather[0].Main
	}

	ctx := context.Background()
	s.db.InsertWeatherData(ctx, weather)

	return weather, nil
}

func (s *ForecastService) GetForecastSummary(ctx context.Context) (map[string]interface{}, error) {
	forecasts, err := s.db.GetForecasts(ctx, time.Now())
	if err != nil {
		return nil, err
	}

	if len(forecasts) == 0 {
		return map[string]interface{}{
			"forecasts": []*models.GenerationForecast{},
			"total_energy_24h": 0.0,
			"peak_power": 0.0,
		}, nil
	}

	var totalEnergy24h, peakPower float64
	for _, f := range forecasts {
		if f.HorizonHours <= 24 {
			totalEnergy24h += f.PredictedEnergy / 12
			if f.PredictedPower > peakPower {
				peakPower = f.PredictedPower
			}
		}
	}

	return map[string]interface{}{
		"forecasts":        forecasts,
		"total_energy_24h": totalEnergy24h,
		"peak_power":       peakPower,
	}, nil
}

func (s *ForecastService) GetCurrentWeather(ctx context.Context) (*models.WeatherData, error) {
	end := time.Now()
	start := end.Add(-1 * time.Hour)

	data, err := s.db.GetWeatherData(ctx, start, end)
	if err != nil || len(data) == 0 {
		return s.FetchWeatherData()
	}

	return data[len(data)-1], nil
}

func (s *ForecastService) SimulatePRReport(reportType string, startDate, endDate time.Time) *models.PRReport {
	ctx := context.Background()

	avgPR, minPR, maxPR, avgTemp, avgIrradiance, err := s.db.GetPRStats(ctx, startDate, endDate)
	if err != nil {
		avgPR = 0.78
		minPR = 0.65
		maxPR = 0.88
		avgTemp = 28.5
		avgIrradiance = 450.0
	}

	plantData, _ := s.db.GetHistoricalData(ctx, startDate, endDate)
	var totalEnergy, peakHours float64
	for _, d := range plantData {
		totalEnergy = d.TotalEnergy
		if d.PRValue > 0.5 {
			peakHours += 5.0 / 60
		}
	}

	report := &models.PRReport{
		ID:                "RPT-" + uuid.New().String()[:8],
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
		CleaningEvents:    2,
		AlarmCount:        5,
		Status:            "completed",
		DownloadURL:       "/api/reports/" + "RPT-" + uuid.New().String()[:8] + "/download",
	}

	s.db.InsertPRReport(ctx, report)
	log.Printf("Generated PR report: %s (%s - %s)", report.ID, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))

	return report
}

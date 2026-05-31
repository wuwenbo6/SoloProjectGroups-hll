package pollution

import (
	"leakage-monitor/internal/config"
	"leakage-monitor/internal/database"
	"leakage-monitor/internal/models"
	"leakage-monitor/internal/signal"
	"math"
	"sync"
	"time"
)

type Calculator struct {
	levels             []float64
	noiseFilter        *signal.NoiseFilter
	envCorrector       *signal.EnvironmentCorrector
	adaptiveThreshold  *signal.AdaptiveThreshold
	seasonalThreshold  *signal.SeasonalThreshold
	useAdaptive        bool
}

var (
	instance *Calculator
	once     sync.Once
)

func GetCalculator() *Calculator {
	once.Do(func() {
		levels := []float64{
			config.App.Pollution.Level1Threshold,
			config.App.Pollution.Level2Threshold,
			config.App.Pollution.Level3Threshold,
			config.App.Pollution.Level4Threshold,
		}
		instance = &Calculator{
			levels:            levels,
			noiseFilter:       signal.NewNoiseFilter(5),
			envCorrector:      signal.NewEnvironmentCorrector(),
			adaptiveThreshold: signal.NewAdaptiveThreshold(levels),
			seasonalThreshold: signal.NewSeasonalThreshold(),
			useAdaptive:       true,
		}
	})
	return instance
}

func NewCalculator() *Calculator {
	return GetCalculator()
}

type ProcessResult struct {
	OriginalPulseCount int
	ValidatedPulseCount int
	OriginalPeakCurrent float64
	CorrectedPeakCurrent float64
	IsRaining         bool
	EstimatedHumidity float64
	RainFactor        float64
	SeasonalFactor    float64
	PollutionLevel    models.PollutionLevel
	AdaptiveThresholds []float64
}

func (c *Calculator) ProcessSensorDataWithCorrection(data *models.SensorData) (*ProcessResult, error) {
	result := &ProcessResult{
		OriginalPulseCount:   data.PulseCount,
		OriginalPeakCurrent:  data.PeakCurrent,
	}

	if len(data.WaveformData) > 10 {
		data.WaveformData = c.noiseFilter.SmoothenWaveform(data.WaveformData)
	}

	if len(data.WaveformData) > 10 {
		validatedPulses := c.noiseFilter.ValidatePulseCount(
			data.PulseCount,
			data.WaveformData,
			data.PeakCurrent,
		)
		data.PulseCount = validatedPulses
		result.ValidatedPulseCount = validatedPulses
	}

	result.IsRaining = signal.DetectRainFromWaveform(data.WaveformData)
	result.EstimatedHumidity = signal.EstimateHumidityFromWaveform(data.WaveformData)

	envData := signal.EnvironmentData{
		Rainfall: 0,
		Humidity: result.EstimatedHumidity,
	}
	if result.IsRaining {
		envData.Rainfall = 5.0
	}

	result.RainFactor = c.envCorrector.CalculateRainFactor(envData)
	result.SeasonalFactor = c.envCorrector.GetSeasonalFactor(data.Timestamp)

	correctedCurrent := c.envCorrector.CorrectCurrent(
		data.PeakCurrent,
		envData,
		data.Timestamp,
	)
	data.PeakCurrent = correctedCurrent
	result.CorrectedPeakCurrent = correctedCurrent

	frequencyFactor, err := c.CalculateFrequencyFactor(
		data.SensorID,
		config.App.Pollution.FrequencyWindowMinutes,
	)
	if err != nil {
		frequencyFactor = 0
	}

	c.adaptiveThreshold.AddData(
		data.SensorID,
		data.PeakCurrent,
		data.PulseCount,
		data.Timestamp,
	)

	var level models.PollutionLevel
	if c.useAdaptive {
		adaptiveLevel := c.adaptiveThreshold.GetPollutionLevel(
			data.SensorID,
			data.PeakCurrent,
			frequencyFactor,
		)
		level = models.PollutionLevel(adaptiveLevel)
		result.AdaptiveThresholds = c.adaptiveThreshold.GetThresholds(data.SensorID)
	} else {
		level = c.CalculateLevel(data.PeakCurrent, frequencyFactor)
	}

	if result.IsRaining && level > models.LevelSlight {
		level = models.PollutionLevel(c.envCorrector.CorrectPollutionLevel(int(level), envData))
	}

	data.PollutionLevel = int(level)
	result.PollutionLevel = level

	return result, nil
}

func (c *Calculator) CalculateLevel(peakCurrent float64, frequencyFactor float64) models.PollutionLevel {
	adjustedCurrent := peakCurrent * (1 + frequencyFactor*0.5)

	if adjustedCurrent >= c.levels[3] {
		return models.LevelCritical
	}
	if adjustedCurrent >= c.levels[2] {
		return models.LevelSevere
	}
	if adjustedCurrent >= c.levels[1] {
		return models.LevelModerate
	}
	if adjustedCurrent >= c.levels[0] {
		return models.LevelSlight
	}
	return models.LevelNormal
}

func (c *Calculator) CalculateFrequencyFactor(sensorID string, windowMinutes int) (float64, error) {
	window := time.Duration(windowMinutes) * time.Minute
	pulseCount, err := database.GetPulseCountInWindow(sensorID, window)
	if err != nil {
		return 0, err
	}

	baselinePulses := int64(windowMinutes / 5)
	if baselinePulses == 0 {
		baselinePulses = 1
	}

	factor := float64(pulseCount) / float64(baselinePulses)
	return math.Min(factor, 3.0), nil
}

func (c *Calculator) ProcessSensorData(data *models.SensorData) (models.PollutionLevel, error) {
	result, err := c.ProcessSensorDataWithCorrection(data)
	if err != nil {
		return models.LevelNormal, err
	}
	return result.PollutionLevel, nil
}

func (c *Calculator) ShouldAlert(level models.PollutionLevel) bool {
	return level >= models.LevelModerate
}

func (c *Calculator) GetAlertMessage(level models.PollutionLevel, sensorID string) string {
	messages := map[models.PollutionLevel]string{
		models.LevelSlight:   "轻微污秽检测",
		models.LevelModerate: "中度污秽警告",
		models.LevelSevere:   "严重污秽警报",
		models.LevelCritical: "危急污秽 - 立即处理",
	}
	return messages[level]
}

func (c *Calculator) GetAdaptiveThresholds(sensorID string) []float64 {
	return c.adaptiveThreshold.GetThresholds(sensorID)
}

func (c *Calculator) SetAdaptiveMode(enabled bool) {
	c.useAdaptive = enabled
}

func (c *Calculator) GetNoiseFilter() *signal.NoiseFilter {
	return c.noiseFilter
}

func (c *Calculator) GetEnvironmentCorrector() *signal.EnvironmentCorrector {
	return c.envCorrector
}

package signal

import (
	"math"
	"time"
)

type EnvironmentCorrector struct {
	rainThreshold      float64
	humidityThreshold  float64
	rainCorrectionMax  float64
	seasonalFactors    map[int]float64
}

func NewEnvironmentCorrector() *EnvironmentCorrector {
	return &EnvironmentCorrector{
		rainThreshold:     0.1,
		humidityThreshold: 80.0,
		rainCorrectionMax: 0.6,
		seasonalFactors: map[int]float64{
			1:  1.2,
			2:  1.1,
			3:  1.0,
			4:  0.9,
			5:  0.85,
			6:  0.8,
			7:  0.75,
			8:  0.8,
			9:  0.85,
			10: 0.95,
			11: 1.1,
			12: 1.15,
		},
	}
}

type EnvironmentData struct {
	Rainfall       float64
	Humidity       float64
	Temperature    float64
	Pressure       float64
}

func (c *EnvironmentCorrector) CalculateRainFactor(envData EnvironmentData) float64 {
	if envData.Rainfall <= 0 && envData.Humidity < c.humidityThreshold {
		return 1.0
	}

	rainFactor := 1.0
	if envData.Rainfall > 0 {
		rainImpact := envData.Rainfall / 10.0
		if rainImpact > 1.0 {
			rainImpact = 1.0
		}
		rainFactor = 1.0 - rainImpact*c.rainCorrectionMax
	}

	if envData.Humidity >= c.humidityThreshold {
		humidityImpact := (envData.Humidity - c.humidityThreshold) / (100 - c.humidityThreshold)
		humidityFactor := 1.0 - humidityImpact*(c.rainCorrectionMax*0.5)
		rainFactor = math.Min(rainFactor, humidityFactor)
	}

	return math.Max(rainFactor, 1.0-c.rainCorrectionMax)
}

func (c *EnvironmentCorrector) GetSeasonalFactor(t time.Time) float64 {
	month := int(t.Month())
	if factor, ok := c.seasonalFactors[month]; ok {
		return factor
	}
	return 1.0
}

func (c *EnvironmentCorrector) CorrectCurrent(peakCurrent float64, envData EnvironmentData, timestamp time.Time) float64 {
	rainFactor := c.CalculateRainFactor(envData)
	seasonalFactor := c.GetSeasonalFactor(timestamp)
	return peakCurrent * rainFactor * seasonalFactor
}

func (c *EnvironmentCorrector) CorrectPollutionLevel(baseLevel int, envData EnvironmentData) int {
	if envData.Rainfall > c.rainThreshold*2 {
		if baseLevel > 1 {
			return baseLevel - 1
		}
	}
	return baseLevel
}

func DetectRainFromWaveform(waveform []float64) bool {
	if len(waveform) < 100 {
		return false
	}

	noiseLevel := calculateNoiseLevel(waveform)
	rainNoiseThreshold := 0.05

	return noiseLevel > rainNoiseThreshold
}

func calculateNoiseLevel(waveform []float64) float64 {
	if len(waveform) < 2 {
		return 0
	}

	totalVariation := 0.0
	for i := 1; i < len(waveform); i++ {
		totalVariation += math.Abs(waveform[i] - waveform[i-1])
	}
	return totalVariation / float64(len(waveform)-1)
}

func EstimateHumidityFromWaveform(waveform []float64) float64 {
	baselineDrift := calculateBaselineDrift(waveform)
	humidity := 50.0 + baselineDrift*1000
	return math.Max(30.0, math.Min(95.0, humidity))
}

func calculateBaselineDrift(waveform []float64) float64 {
	if len(waveform) < 10 {
		return 0
	}

	segmentSize := len(waveform) / 5
	segmentMeans := make([]float64, 5)

	for i := 0; i < 5; i++ {
		start := i * segmentSize
		end := start + segmentSize
		if end > len(waveform) {
			end = len(waveform)
		}
		sum := 0.0
		for j := start; j < end; j++ {
			sum += waveform[j]
		}
		segmentMeans[i] = sum / float64(end-start)
	}

	maxDiff := 0.0
	for i := 1; i < 5; i++ {
		diff := math.Abs(segmentMeans[i] - segmentMeans[0])
		if diff > maxDiff {
			maxDiff = diff
		}
	}

	return maxDiff
}

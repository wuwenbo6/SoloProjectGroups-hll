package signal

import (
	"math"
	"sort"
	"time"
)

type NoiseFilter struct {
	windowSize      int
	thresholdFactor float64
	history         []float64
}

func NewNoiseFilter(windowSize int) *NoiseFilter {
	if windowSize < 3 {
		windowSize = 5
	}
	return &NoiseFilter{
		windowSize:      windowSize,
		thresholdFactor: 2.0,
		history:         make([]float64, 0, windowSize),
	}
}

func (f *NoiseFilter) MedianFilter(data []float64) []float64 {
	if len(data) < 3 {
		return data
	}

	result := make([]float64, len(data))
	kernel := 3
	half := kernel / 2

	for i := range data {
		window := make([]float64, 0, kernel)
		for j := i - half; j <= i+half; j++ {
			if j >= 0 && j < len(data) {
				window = append(window, data[j])
			}
		}
		sort.Float64s(window)
		result[i] = window[len(window)/2]
	}

	return result
}

func (f *NoiseFilter) RemoveOutliers(data []float64) []float64 {
	if len(data) < 4 {
		return data
	}

	mean, std := f.calculateMeanStd(data)
	threshold := f.thresholdFactor * std

	filtered := make([]float64, 0, len(data))
	for _, v := range data {
		if math.Abs(v-mean) <= threshold {
			filtered = append(filtered, v)
		}
	}

	if len(filtered) == 0 {
		return data
	}
	return filtered
}

func (f *NoiseFilter) calculateMeanStd(data []float64) (float64, float64) {
	if len(data) == 0 {
		return 0, 0
	}

	sum := 0.0
	for _, v := range data {
		sum += v
	}
	mean := sum / float64(len(data))

	variance := 0.0
	for _, v := range data {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(len(data))

	return mean, math.Sqrt(variance)
}

func (f *NoiseFilter) ValidatePulseCount(pulseCount int, waveform []float64, peakCurrent float64) int {
	if len(waveform) < 10 {
		return pulseCount
	}

	actualPeaks := f.countValidPeaks(waveform, peakCurrent)
	noiseRatio := float64(pulseCount-actualPeaks) / float64(pulseCount+1)

	if noiseRatio > 0.5 {
		return actualPeaks
	}

	return pulseCount
}

func (f *NoiseFilter) countValidPeaks(waveform []float64, threshold float64) int {
	if len(waveform) < 3 {
		return 0
	}

	minPeakHeight := threshold * 0.3
	if minPeakHeight < 0.1 {
		minPeakHeight = 0.1
	}

	peaks := 0
	for i := 1; i < len(waveform)-1; i++ {
		if waveform[i] > minPeakHeight &&
			waveform[i] > waveform[i-1] &&
			waveform[i] > waveform[i+1] {
			peaks++
		}
	}

	return peaks
}

func (f *NoiseFilter) SmoothenWaveform(waveform []float64) []float64 {
	smoothed := f.MedianFilter(waveform)
	return f.gaussianFilter(smoothed)
}

func (f *NoiseFilter) gaussianFilter(data []float64) []float64 {
	if len(data) < 5 {
		return data
	}

	kernel := []float64{0.06136, 0.24477, 0.38774, 0.24477, 0.06136}
	result := make([]float64, len(data))

	for i := range data {
		sum := 0.0
		weightSum := 0.0
		for j, k := range kernel {
			idx := i - 2 + j
			if idx >= 0 && idx < len(data) {
				sum += data[idx] * k
				weightSum += k
			}
		}
		result[i] = sum / weightSum
	}

	return result
}

type PulseValidator struct {
	minPulseWidth  time.Duration
	maxPulseWidth  time.Duration
	amplitudeThreshold float64
}

func NewPulseValidator() *PulseValidator {
	return &PulseValidator{
		minPulseWidth:     100 * time.Microsecond,
		maxPulseWidth:     10 * time.Millisecond,
		amplitudeThreshold: 0.1,
	}
}

func (v *PulseValidator) ValidatePulses(waveform []float64, sampleRate int) int {
	if len(waveform) < 3 || sampleRate <= 0 {
		return 0
	}

	sampleInterval := time.Second / time.Duration(sampleRate)
	validPulses := 0
	inPulse := false
	pulseStart := 0
	peakAmplitude := 0.0

	for i, sample := range waveform {
		if sample > v.amplitudeThreshold && !inPulse {
			inPulse = true
			pulseStart = i
			peakAmplitude = sample
		} else if inPulse {
			if sample > peakAmplitude {
				peakAmplitude = sample
			}
			if sample < v.amplitudeThreshold*0.5 {
				pulseDuration := time.Duration(i-pulseStart) * sampleInterval
				if pulseDuration >= v.minPulseWidth && pulseDuration <= v.maxPulseWidth {
					validPulses++
				}
				inPulse = false
				peakAmplitude = 0.0
			}
		}
	}

	return validPulses
}

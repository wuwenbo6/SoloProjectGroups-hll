package ptp

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"time"
)

type ReportGenerator struct {
}

func NewReportGenerator() *ReportGenerator {
	return &ReportGenerator{}
}

func (rg *ReportGenerator) GenerateSyncReport(
	metrics []SyncMetrics,
	testDuration time.Duration,
	masterQuality, slaveQuality ClockQuality,
	config SimulatorConfigReport,
	startTime time.Time,
) *SyncReport {
	if len(metrics) == 0 {
		return &SyncReport{
			ReportGeneratedAt: time.Now(),
			TestDuration:      testDuration,
			NetworkConfig:     config,
		}
	}

	pathDelays := make([]float64, len(metrics))
	clockOffsets := make([]float64, len(metrics))
	syncErrors := make([]float64, len(metrics))
	rateRatios := make([]float64, len(metrics))
	masterTemps := make([]float64, len(metrics))
	slaveTemps := make([]float64, len(metrics))
	masterFreqOffsets := make([]float64, len(metrics))
	slaveFreqOffsets := make([]float64, len(metrics))

	for i, m := range metrics {
		pathDelays[i] = float64(m.PathDelay)
		clockOffsets[i] = float64(m.ClockOffset)
		syncErrors[i] = float64(m.SyncError)
		rateRatios[i] = m.RateRatio
		masterTemps[i] = m.MasterTemperature
		slaveTemps[i] = m.SlaveTemperature
		masterFreqOffsets[i] = m.MasterFreqOffset
		slaveFreqOffsets[i] = m.SlaveFreqOffset
	}

	convergenceTime := rg.calculateConvergenceTime(metrics, startTime)

	lastMetric := metrics[len(metrics)-1]
	finalSyncError := lastMetric.SyncError
	finalRateRatio := lastMetric.RateRatio

	return &SyncReport{
		ReportGeneratedAt: time.Now(),
		TestDuration:      testDuration,
		TotalSyncCycles:   uint64(len(metrics)),
		MasterClockInfo:   masterQuality,
		SlaveClockInfo:    slaveQuality,
		PathDelayStats:    rg.calculateStats(pathDelays),
		ClockOffsetStats:  rg.calculateStats(clockOffsets),
		SyncErrorStats:    rg.calculateStats(syncErrors),
		RateRatioStats:    rg.calculateStats(rateRatios),
		MasterTempStats:   rg.calculateStats(masterTemps),
		SlaveTempStats:    rg.calculateStats(slaveTemps),
		MasterFreqOffset:  rg.calculateStats(masterFreqOffsets),
		SlaveFreqOffset:   rg.calculateStats(slaveFreqOffsets),
		ConvergenceTime:   convergenceTime,
		FinalSyncError:    finalSyncError,
		FinalRateRatio:    finalRateRatio,
		NetworkConfig:     config,
	}
}

func (rg *ReportGenerator) calculateStats(data []float64) StatsResult {
	if len(data) == 0 {
		return StatsResult{}
	}

	sorted := make([]float64, len(data))
	copy(sorted, data)
	sort.Float64s(sorted)

	n := len(data)
	sum := 0.0
	min := sorted[0]
	max := sorted[n-1]

	for _, v := range data {
		sum += v
	}
	mean := sum / float64(n)

	variance := 0.0
	for _, v := range data {
		diff := v - mean
		variance += diff * diff
	}
	variance /= float64(n)
	stdDev := math.Sqrt(variance)

	median := rg.percentile(sorted, 50)
	p95 := rg.percentile(sorted, 95)
	p99 := rg.percentile(sorted, 99)

	return StatsResult{
		Count:  n,
		Min:    min,
		Max:    max,
		Mean:   mean,
		StdDev: stdDev,
		Median: median,
		P95:    p95,
		P99:    p99,
	}
}

func (rg *ReportGenerator) percentile(sorted []float64, p float64) float64 {
	if len(sorted) == 0 {
		return 0
	}
	if len(sorted) == 1 {
		return sorted[0]
	}

	rank := (p / 100.0) * float64(len(sorted)-1)
	lowerIdx := int(math.Floor(rank))
	upperIdx := lowerIdx + 1
	if upperIdx >= len(sorted) {
		return sorted[len(sorted)-1]
	}

	weight := rank - float64(lowerIdx)
	return sorted[lowerIdx] + weight*(sorted[upperIdx]-sorted[lowerIdx])
}

func (rg *ReportGenerator) calculateConvergenceTime(metrics []SyncMetrics, startTime time.Time) time.Duration {
	threshold := int64(10000)
	consecutiveRequired := 10
	consecutive := 0

	for i, m := range metrics {
		absErr := m.SyncError
		if absErr < 0 {
			absErr = -absErr
		}
		if absErr <= threshold {
			consecutive++
			if consecutive >= consecutiveRequired {
				convergencePoint := metrics[i-consecutiveRequired+1].Timestamp
				return convergencePoint.Sub(startTime)
			}
		} else {
			consecutive = 0
		}
	}

	return 0
}

func (r *SyncReport) ToJSON() ([]byte, error) {
	return json.MarshalIndent(r, "", "  ")
}

func (r *SyncReport) ToJSONString() string {
	data, err := r.ToJSON()
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}
	return string(data)
}

func (r *SyncReport) ExportJSON(filePath string) error {
	data, err := r.ToJSON()
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

func (r *SyncReport) ExportCSV(filePath string) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	writer.Write([]string{"=== gPTP Synchronization Report ==="})
	writer.Write([]string{})

	writer.Write([]string{"Report Information"})
	writer.Write([]string{"Generated At", r.ReportGeneratedAt.Format(time.RFC3339)})
	writer.Write([]string{"Test Duration (s)", fmt.Sprintf("%.3f", r.TestDuration.Seconds())})
	writer.Write([]string{"Total Sync Cycles", fmt.Sprintf("%d", r.TotalSyncCycles)})
	writer.Write([]string{"Convergence Time (ms)", fmt.Sprintf("%.2f", r.ConvergenceTime.Seconds()*1000)})
	writer.Write([]string{"Final Sync Error (ns)", fmt.Sprintf("%d", r.FinalSyncError)})
	writer.Write([]string{"Final Rate Ratio", fmt.Sprintf("%.9f", r.FinalRateRatio)})
	writer.Write([]string{})

	writer.Write([]string{"Network Configuration"})
	writer.Write([]string{"Mean Delay (ns)", fmt.Sprintf("%d", r.NetworkConfig.MeanDelayNs)})
	writer.Write([]string{"Jitter Std Dev (ns)", fmt.Sprintf("%d", r.NetworkConfig.JitterStdDevNs)})
	writer.Write([]string{"Packet Loss Rate", fmt.Sprintf("%.4f", r.NetworkConfig.PacketLossRate)})
	writer.Write([]string{"Master Clock Drift", fmt.Sprintf("%.9f", r.NetworkConfig.MasterClockDrift)})
	writer.Write([]string{"Slave Clock Drift", fmt.Sprintf("%.9f", r.NetworkConfig.SlaveClockDrift)})
	writer.Write([]string{})

	writer.Write([]string{"Clock Quality"})
	writer.Write([]string{"Metric", "Master", "Slave"})
	writer.Write([]string{"Clock Class", fmt.Sprintf("%d", r.MasterClockInfo.ClockClass), fmt.Sprintf("%d", r.SlaveClockInfo.ClockClass)})
	writer.Write([]string{"Clock Accuracy", fmt.Sprintf("%d", r.MasterClockInfo.ClockAccuracy), fmt.Sprintf("%d", r.SlaveClockInfo.ClockAccuracy)})
	writer.Write([]string{"Offset Scaled Log Variance", fmt.Sprintf("%d", r.MasterClockInfo.OffsetScaledLogVariance), fmt.Sprintf("%d", r.SlaveClockInfo.OffsetScaledLogVariance)})
	writer.Write([]string{})

	writer.Write([]string{"Synchronization Statistics (ns unless noted)"})
	writer.Write([]string{"Metric", "Path Delay", "Clock Offset", "Sync Error", "Rate Ratio"})
	writer.Write([]string{"Count", fmt.Sprintf("%d", r.PathDelayStats.Count), fmt.Sprintf("%d", r.ClockOffsetStats.Count), fmt.Sprintf("%d", r.SyncErrorStats.Count), fmt.Sprintf("%d", r.RateRatioStats.Count)})
	writer.Write([]string{"Min", fmt.Sprintf("%.2f", r.PathDelayStats.Min), fmt.Sprintf("%.2f", r.ClockOffsetStats.Min), fmt.Sprintf("%.2f", r.SyncErrorStats.Min), fmt.Sprintf("%.9f", r.RateRatioStats.Min)})
	writer.Write([]string{"Max", fmt.Sprintf("%.2f", r.PathDelayStats.Max), fmt.Sprintf("%.2f", r.ClockOffsetStats.Max), fmt.Sprintf("%.2f", r.SyncErrorStats.Max), fmt.Sprintf("%.9f", r.RateRatioStats.Max)})
	writer.Write([]string{"Mean", fmt.Sprintf("%.2f", r.PathDelayStats.Mean), fmt.Sprintf("%.2f", r.ClockOffsetStats.Mean), fmt.Sprintf("%.2f", r.SyncErrorStats.Mean), fmt.Sprintf("%.9f", r.RateRatioStats.Mean)})
	writer.Write([]string{"Std Dev", fmt.Sprintf("%.2f", r.PathDelayStats.StdDev), fmt.Sprintf("%.2f", r.ClockOffsetStats.StdDev), fmt.Sprintf("%.2f", r.SyncErrorStats.StdDev), fmt.Sprintf("%.9f", r.RateRatioStats.StdDev)})
	writer.Write([]string{"Median", fmt.Sprintf("%.2f", r.PathDelayStats.Median), fmt.Sprintf("%.2f", r.ClockOffsetStats.Median), fmt.Sprintf("%.2f", r.SyncErrorStats.Median), fmt.Sprintf("%.9f", r.RateRatioStats.Median)})
	writer.Write([]string{"95th Percentile", fmt.Sprintf("%.2f", r.PathDelayStats.P95), fmt.Sprintf("%.2f", r.ClockOffsetStats.P95), fmt.Sprintf("%.2f", r.SyncErrorStats.P95), fmt.Sprintf("%.9f", r.RateRatioStats.P95)})
	writer.Write([]string{"99th Percentile", fmt.Sprintf("%.2f", r.PathDelayStats.P99), fmt.Sprintf("%.2f", r.ClockOffsetStats.P99), fmt.Sprintf("%.2f", r.SyncErrorStats.P99), fmt.Sprintf("%.9f", r.RateRatioStats.P99)})
	writer.Write([]string{})

	writer.Write([]string{"Temperature Statistics (°C)"})
	writer.Write([]string{"Metric", "Master", "Slave"})
	writer.Write([]string{"Min", fmt.Sprintf("%.2f", r.MasterTempStats.Min), fmt.Sprintf("%.2f", r.SlaveTempStats.Min)})
	writer.Write([]string{"Max", fmt.Sprintf("%.2f", r.MasterTempStats.Max), fmt.Sprintf("%.2f", r.SlaveTempStats.Max)})
	writer.Write([]string{"Mean", fmt.Sprintf("%.2f", r.MasterTempStats.Mean), fmt.Sprintf("%.2f", r.SlaveTempStats.Mean)})
	writer.Write([]string{"Std Dev", fmt.Sprintf("%.2f", r.MasterTempStats.StdDev), fmt.Sprintf("%.2f", r.SlaveTempStats.StdDev)})
	writer.Write([]string{})

	writer.Write([]string{"Frequency Offset Statistics"})
	writer.Write([]string{"Metric", "Master", "Slave"})
	writer.Write([]string{"Min", fmt.Sprintf("%.9f", r.MasterFreqOffset.Min), fmt.Sprintf("%.9f", r.SlaveFreqOffset.Min)})
	writer.Write([]string{"Max", fmt.Sprintf("%.9f", r.MasterFreqOffset.Max), fmt.Sprintf("%.9f", r.SlaveFreqOffset.Max)})
	writer.Write([]string{"Mean", fmt.Sprintf("%.9f", r.MasterFreqOffset.Mean), fmt.Sprintf("%.9f", r.SlaveFreqOffset.Mean)})
	writer.Write([]string{"Std Dev", fmt.Sprintf("%.9f", r.MasterFreqOffset.StdDev), fmt.Sprintf("%.9f", r.SlaveFreqOffset.StdDev)})
	writer.Write([]string{})

	return nil
}

func (r *SyncReport) Summary() string {
	var sb string
	sb += fmt.Sprintf("=== gPTP Synchronization Report ===\n")
	sb += fmt.Sprintf("Generated: %s\n", r.ReportGeneratedAt.Format(time.RFC3339))
	sb += fmt.Sprintf("Duration: %.1fs, Sync Cycles: %d\n", r.TestDuration.Seconds(), r.TotalSyncCycles)
	sb += fmt.Sprintf("\n")
	sb += fmt.Sprintf("Convergence Time: %.2f ms\n", r.ConvergenceTime.Seconds()*1000)
	sb += fmt.Sprintf("Final Sync Error: %d ns\n", r.FinalSyncError)
	sb += fmt.Sprintf("Final Rate Ratio: %.9f\n", r.FinalRateRatio)
	sb += fmt.Sprintf("\n")
	sb += fmt.Sprintf("Sync Error Statistics (ns):\n")
	sb += fmt.Sprintf("  Mean: %.2f ± %.2f\n", r.SyncErrorStats.Mean, r.SyncErrorStats.StdDev)
	sb += fmt.Sprintf("  Min/Max: %.2f / %.2f\n", r.SyncErrorStats.Min, r.SyncErrorStats.Max)
	sb += fmt.Sprintf("  Median: %.2f, P95: %.2f, P99: %.2f\n", r.SyncErrorStats.Median, r.SyncErrorStats.P95, r.SyncErrorStats.P99)
	sb += fmt.Sprintf("\n")
	sb += fmt.Sprintf("Path Delay Statistics (ns):\n")
	sb += fmt.Sprintf("  Mean: %.2f ± %.2f\n", r.PathDelayStats.Mean, r.PathDelayStats.StdDev)
	sb += fmt.Sprintf("  Min/Max: %.2f / %.2f\n", r.PathDelayStats.Min, r.PathDelayStats.Max)
	sb += fmt.Sprintf("\n")
	sb += fmt.Sprintf("Network Config: meanDelay=%dns, jitter=%dns, loss=%.2f%%\n",
		r.NetworkConfig.MeanDelayNs, r.NetworkConfig.JitterStdDevNs, r.NetworkConfig.PacketLossRate*100)

	return sb
}

func (r *SyncReport) ExportRawMetricsCSV(filePath string, metrics []SyncMetrics) error {
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := csv.NewWriter(file)
	defer writer.Flush()

	writer.Write([]string{
		"Timestamp", "PathDelayNs", "ClockOffsetNs", "SyncErrorNs",
		"RateRatio", "MasterTempC", "SlaveTempC",
		"MasterFreqOffset", "SlaveFreqOffset",
		"T1", "T2", "T3", "T4",
	})

	for _, m := range metrics {
		writer.Write([]string{
			m.Timestamp.Format(time.RFC3339Nano),
			fmt.Sprintf("%d", m.PathDelay),
			fmt.Sprintf("%d", m.ClockOffset),
			fmt.Sprintf("%d", m.SyncError),
			fmt.Sprintf("%.9f", m.RateRatio),
			fmt.Sprintf("%.4f", m.MasterTemperature),
			fmt.Sprintf("%.4f", m.SlaveTemperature),
			fmt.Sprintf("%.9f", m.MasterFreqOffset),
			fmt.Sprintf("%.9f", m.SlaveFreqOffset),
			fmt.Sprintf("%d", m.T1),
			fmt.Sprintf("%d", m.T2),
			fmt.Sprintf("%d", m.T3),
			fmt.Sprintf("%d", m.T4),
		})
	}

	return nil
}

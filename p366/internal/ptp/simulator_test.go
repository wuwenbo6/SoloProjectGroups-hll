package ptp

import (
	"fmt"
	"testing"
	"time"
)

func TestSyncConvergence(t *testing.T) {
	config := SimulatorConfig{
		MeanDelayNs:           500 * 1000,
		JitterStdDevNs:        0,
		PacketLossRate:        0.0,
		MasterClockDrift:      0,
		SlaveClockDrift:       50e-6,
		SyncInterval:          125 * time.Millisecond,
		PdelayInterval:        500 * time.Millisecond,
		MasterTempNominal:     25.0,
		SlaveTempNominal:      25.0,
		MasterTempDriftStdDev: 0.0,
		SlaveTempDriftStdDev:  0.0,
		MasterTempAlpha:       0.0,
		SlaveTempAlpha:        0.0,
		MasterTempBeta:        0.0,
		SlaveTempBeta:         0.0,
		MasterTempMeanRevK:    0.1,
		SlaveTempMeanRevK:     0.05,
	}

	sim := NewSimulator(config)

	results := make(chan SyncMetrics, 200)
	sim.SetMetricsCallback(func(m SyncMetrics) {
		results <- m
	})

	sim.Start()
	defer sim.Stop()

	fmt.Println("=== Sync convergence test ===")
	fmt.Printf("%-5s %12s %12s %12s %12s %12s %12s\n",
		"Sync", "Offset", "SyncErr", "PathDly", "freqCorr", "effFreq", "Ratio")

	for i := 0; i < 100; i++ {
		select {
		case m := <-results:
			fc := sim.slave.GetClock().GetFreqCorrection()
			nf := sim.slave.GetClock().GetNaturalFreq()
			eff := nf * (1 + fc)
			fmt.Printf("%-5d %12d %12d %12d %12.2e %12.6f %12.6f\n",
				i, m.ClockOffset, m.SyncError, m.PathDelay, fc, eff, m.RateRatio)
		case <-time.After(5 * time.Second):
			t.Fatal("Timeout waiting for metrics")
		}
	}
}

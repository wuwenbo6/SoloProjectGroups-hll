package client

import (
	"time"

	"github.com/owamp-client/pkg/protocol"
)

func CalculateOneWayDelay(sendTime, receiveTime time.Time) time.Duration {
	return receiveTime.Sub(sendTime)
}

func CalculateCompensatedDelay(sendTime, receiveTime time.Time, ntpOffset time.Duration) time.Duration {
	rawDelay := receiveTime.Sub(sendTime)
	return rawDelay - ntpOffset
}

type DelayStats struct {
	MinDelay              time.Duration `json:"min_delay"`
	MaxDelay              time.Duration `json:"max_delay"`
	AvgDelay              time.Duration `json:"avg_delay"`
	MinCompensatedDelay   time.Duration `json:"min_compensated_delay,omitempty"`
	MaxCompensatedDelay   time.Duration `json:"max_compensated_delay,omitempty"`
	AvgCompensatedDelay   time.Duration `json:"avg_compensated_delay,omitempty"`
	NTPOffset             time.Duration `json:"ntp_offset,omitempty"`
	NTPOffsetMs           float64       `json:"ntp_offset_ms,omitempty"`
	NTPServer             string        `json:"ntp_server,omitempty"`
	NTPRoundTripDelay     time.Duration `json:"ntp_round_trip_delay,omitempty"`
	TotalSent             int           `json:"total_sent"`
	TotalReceived         int           `json:"total_received"`
	LossRate              float64       `json:"loss_rate"`
	Jitter                time.Duration `json:"jitter"`
	FinalIntervalMs       float64       `json:"final_interval_ms,omitempty"`
	RateAdjustments       int           `json:"rate_adjustments,omitempty"`
	AvgForwardDelay       time.Duration `json:"avg_forward_delay,omitempty"`
	AvgForwardDelayMs     float64       `json:"avg_forward_delay_ms,omitempty"`
	AvgReverseDelay       time.Duration `json:"avg_reverse_delay,omitempty"`
	AvgReverseDelayMs     float64       `json:"avg_reverse_delay_ms,omitempty"`
	MinForwardDelay       time.Duration `json:"min_forward_delay,omitempty"`
	MaxForwardDelay       time.Duration `json:"max_forward_delay,omitempty"`
	MinReverseDelay       time.Duration `json:"min_reverse_delay,omitempty"`
	MaxReverseDelay       time.Duration `json:"max_reverse_delay,omitempty"`
	AvgRTT                time.Duration `json:"avg_rtt,omitempty"`
	AvgRTTMs              float64       `json:"avg_rtt_ms,omitempty"`
	IsSymmetric           bool          `json:"is_symmetric,omitempty"`
}

func CalculateStats(results []*protocol.TestResult) *DelayStats {
	if len(results) == 0 {
		return &DelayStats{}
	}

	var totalDelay, totalCompDelay time.Duration
	var minDelay, maxDelay, minCompDelay, maxCompDelay time.Duration
	var totalFwd, totalRev, totalRTT time.Duration
	var minFwd, maxFwd, minRev, maxRev time.Duration
	var receivedCount int
	var delays, compDelays []time.Duration
	var lastNTPOffset time.Duration
	var lastIntervalMs float64
	var hasCompensated, hasSymmetric bool
	var symmetricCount int

	for i, r := range results {
		if r.NTPOffset != 0 {
			lastNTPOffset = r.NTPOffset
		}
		if r.CurrentIntervalMs > 0 {
			lastIntervalMs = r.CurrentIntervalMs
		}

		if r.Success {
			receivedCount++
			delay := r.OneWayDelay
			delays = append(delays, delay)
			totalDelay += delay

			if i == 0 || delay < minDelay {
				minDelay = delay
			}
			if delay > maxDelay {
				maxDelay = delay
			}

			if r.CompensatedDelay > 0 {
				hasCompensated = true
				compDelay := r.CompensatedDelay
				compDelays = append(compDelays, compDelay)
				totalCompDelay += compDelay

				if i == 0 || compDelay < minCompDelay {
					minCompDelay = compDelay
				}
				if compDelay > maxCompDelay {
					maxCompDelay = compDelay
				}
			}

			if r.IsSymmetric {
				hasSymmetric = true
				symmetricCount++

				fwd := r.ForwardDelay
				rev := r.ReverseDelay
				rtt := r.RTT

				totalFwd += fwd
				totalRev += rev
				totalRTT += rtt

				if symmetricCount == 1 || fwd < minFwd {
					minFwd = fwd
				}
				if fwd > maxFwd {
					maxFwd = fwd
				}
				if symmetricCount == 1 || rev < minRev {
					minRev = rev
				}
				if rev > maxRev {
					maxRev = rev
				}
			}
		}
	}

	stats := &DelayStats{
		TotalSent:       len(results),
		TotalReceived:   receivedCount,
		LossRate:        float64(len(results)-receivedCount) / float64(len(results)) * 100,
		NTPOffset:       lastNTPOffset,
		NTPOffsetMs:     float64(lastNTPOffset.Nanoseconds()) / 1e6,
		FinalIntervalMs: lastIntervalMs,
		IsSymmetric:     hasSymmetric,
	}

	if receivedCount > 0 {
		stats.MinDelay = minDelay
		stats.MaxDelay = maxDelay
		stats.AvgDelay = totalDelay / time.Duration(receivedCount)

		if hasCompensated {
			stats.MinCompensatedDelay = minCompDelay
			stats.MaxCompensatedDelay = maxCompDelay
			stats.AvgCompensatedDelay = totalCompDelay / time.Duration(len(compDelays))
		}

		if hasSymmetric && symmetricCount > 0 {
			stats.AvgForwardDelay = totalFwd / time.Duration(symmetricCount)
			stats.AvgForwardDelayMs = float64(stats.AvgForwardDelay.Nanoseconds()) / 1e6
			stats.AvgReverseDelay = totalRev / time.Duration(symmetricCount)
			stats.AvgReverseDelayMs = float64(stats.AvgReverseDelay.Nanoseconds()) / 1e6
			stats.AvgRTT = totalRTT / time.Duration(symmetricCount)
			stats.AvgRTTMs = float64(stats.AvgRTT.Nanoseconds()) / 1e6
			stats.MinForwardDelay = minFwd
			stats.MaxForwardDelay = maxFwd
			stats.MinReverseDelay = minRev
			stats.MaxReverseDelay = maxRev
		}

		if len(delays) > 1 {
			var jitterSum time.Duration
			for i := 1; i < len(delays); i++ {
				diff := delays[i] - delays[i-1]
				if diff < 0 {
					diff = -diff
				}
				jitterSum += diff
			}
			stats.Jitter = jitterSum / time.Duration(len(delays)-1)
		}
	}

	return stats
}

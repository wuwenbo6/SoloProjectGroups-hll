package gtpv1

import (
	"sync"
	"time"
)

const (
	KBps = 1024
	MBps = 1024 * 1024
)

type QoSParameters struct {
	GBR_Uplink   uint64 `json:"gbrUplink"`
	GBR_Downlink uint64 `json:"gbrDownlink"`
	MBR_Uplink   uint64 `json:"mbrUplink"`
	MBR_Downlink uint64 `json:"mbrDownlink"`
	QCI          uint8  `json:"qci"`
}

type TokenBucket struct {
	rate       uint64
	capacity   uint64
	tokens     uint64
	lastUpdate time.Time
	mu         sync.Mutex
}

func NewTokenBucket(rate uint64, capacity uint64) *TokenBucket {
	return &TokenBucket{
		rate:       rate,
		capacity:   capacity,
		tokens:     capacity,
		lastUpdate: time.Now(),
	}
}

func (tb *TokenBucket) refill() {
	now := time.Now()
	elapsed := now.Sub(tb.lastUpdate).Seconds()
	if elapsed > 0 {
		newTokens := uint64(elapsed * float64(tb.rate))
		if newTokens > 0 {
			tb.tokens = min(tb.tokens+newTokens, tb.capacity)
			tb.lastUpdate = now
		}
	}
}

func (tb *TokenBucket) Consume(size uint64) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	tb.refill()

	if tb.tokens >= size {
		tb.tokens -= size
		return true
	}
	return false
}

func (tb *TokenBucket) TryConsume(size uint64) (bool, uint64) {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	tb.refill()

	if tb.tokens >= size {
		tb.tokens -= size
		return true, tb.tokens
	}
	return false, tb.tokens
}

func (tb *TokenBucket) GetRate() uint64 {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	return tb.rate
}

func (tb *TokenBucket) GetTokens() uint64 {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.refill()
	return tb.tokens
}

func (tb *TokenBucket) SetRate(rate uint64) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.rate = rate
}

type QoSController struct {
	UplinkGBR   *TokenBucket
	UplinkMBR   *TokenBucket
	DownlinkGBR *TokenBucket
	DownlinkMBR *TokenBucket
	Params      QoSParameters
}

func NewQoSController(params QoSParameters) *QoSController {
	qc := &QoSController{
		Params: params,
	}

	if params.GBR_Uplink > 0 {
		qc.UplinkGBR = NewTokenBucket(params.GBR_Uplink, params.GBR_Uplink)
	}
	if params.MBR_Uplink > 0 {
		qc.UplinkMBR = NewTokenBucket(params.MBR_Uplink, params.MBR_Uplink*2)
	}
	if params.GBR_Downlink > 0 {
		qc.DownlinkGBR = NewTokenBucket(params.GBR_Downlink, params.GBR_Downlink)
	}
	if params.MBR_Downlink > 0 {
		qc.DownlinkMBR = NewTokenBucket(params.MBR_Downlink, params.MBR_Downlink*2)
	}

	return qc
}

func (qc *QoSController) CheckUplink(size uint64) bool {
	if qc.UplinkMBR != nil {
		if !qc.UplinkMBR.Consume(size) {
			return false
		}
	}
	if qc.UplinkGBR != nil {
		qc.UplinkGBR.Consume(size)
	}
	return true
}

func (qc *QoSController) CheckDownlink(size uint64) bool {
	if qc.DownlinkMBR != nil {
		if !qc.DownlinkMBR.Consume(size) {
			return false
		}
	}
	if qc.DownlinkGBR != nil {
		qc.DownlinkGBR.Consume(size)
	}
	return true
}

func (qc *QoSController) GetStatus() map[string]interface{} {
	status := make(map[string]interface{})

	status["params"] = qc.Params

	if qc.UplinkGBR != nil {
		status["uplinkGBR_tokens"] = qc.UplinkGBR.GetTokens()
	}
	if qc.UplinkMBR != nil {
		status["uplinkMBR_tokens"] = qc.UplinkMBR.GetTokens()
	}
	if qc.DownlinkGBR != nil {
		status["downlinkGBR_tokens"] = qc.DownlinkGBR.GetTokens()
	}
	if qc.DownlinkMBR != nil {
		status["downlinkMBR_tokens"] = qc.DownlinkMBR.GetTokens()
	}

	return status
}

func (qc *QoSController) UpdateParams(params QoSParameters) {
	qc.Params = params

	if params.GBR_Uplink > 0 {
		if qc.UplinkGBR == nil {
			qc.UplinkGBR = NewTokenBucket(params.GBR_Uplink, params.GBR_Uplink)
		} else {
			qc.UplinkGBR.SetRate(params.GBR_Uplink)
		}
	}
	if params.MBR_Uplink > 0 {
		if qc.UplinkMBR == nil {
			qc.UplinkMBR = NewTokenBucket(params.MBR_Uplink, params.MBR_Uplink*2)
		} else {
			qc.UplinkMBR.SetRate(params.MBR_Uplink)
		}
	}
	if params.GBR_Downlink > 0 {
		if qc.DownlinkGBR == nil {
			qc.DownlinkGBR = NewTokenBucket(params.GBR_Downlink, params.GBR_Downlink)
		} else {
			qc.DownlinkGBR.SetRate(params.GBR_Downlink)
		}
	}
	if params.MBR_Downlink > 0 {
		if qc.DownlinkMBR == nil {
			qc.DownlinkMBR = NewTokenBucket(params.MBR_Downlink, params.MBR_Downlink*2)
		} else {
			qc.DownlinkMBR.SetRate(params.MBR_Downlink)
		}
	}
}

type QoSStatistics struct {
	UplinkPackets       uint64 `json:"uplinkPackets"`
	DownlinkPackets     uint64 `json:"downlinkPackets"`
	UplinkBytes         uint64 `json:"uplinkBytes"`
	DownlinkBytes       uint64 `json:"downlinkBytes"`
	UplinkDropped       uint64 `json:"uplinkDropped"`
	DownlinkDropped     uint64 `json:"downlinkDropped"`
	UplinkDroppedBytes  uint64 `json:"uplinkDroppedBytes"`
	DownlinkDroppedBytes uint64 `json:"downlinkDroppedBytes"`
}

func (qs *QoSStatistics) IncrementUplink(bytes uint64, dropped bool) {
	if dropped {
		qs.UplinkDropped++
		qs.UplinkDroppedBytes += bytes
	} else {
		qs.UplinkPackets++
		qs.UplinkBytes += bytes
	}
}

func (qs *QoSStatistics) IncrementDownlink(bytes uint64, dropped bool) {
	if dropped {
		qs.DownlinkDropped++
		qs.DownlinkDroppedBytes += bytes
	} else {
		qs.DownlinkPackets++
		qs.DownlinkBytes += bytes
	}
}

func DefaultQoSParameters() QoSParameters {
	return QoSParameters{
		GBR_Uplink:   64 * KBps,
		GBR_Downlink: 128 * KBps,
		MBR_Uplink:   256 * KBps,
		MBR_Downlink: 512 * KBps,
		QCI:          9,
	}
}

func QCItoQoSParameters(qci uint8) QoSParameters {
	switch qci {
	case 1:
		return QoSParameters{GBR_Uplink: 64 * KBps, GBR_Downlink: 64 * KBps, MBR_Uplink: 128 * KBps, MBR_Downlink: 128 * KBps, QCI: 1}
	case 2:
		return QoSParameters{GBR_Uplink: 128 * KBps, GBR_Downlink: 256 * KBps, MBR_Uplink: 256 * KBps, MBR_Downlink: 512 * KBps, QCI: 2}
	case 3:
		return QoSParameters{GBR_Uplink: 256 * KBps, GBR_Downlink: 512 * KBps, MBR_Uplink: 512 * KBps, MBR_Downlink: 1024 * KBps, QCI: 3}
	case 4:
		return QoSParameters{GBR_Uplink: 512 * KBps, GBR_Downlink: 1024 * KBps, MBR_Uplink: 1024 * KBps, MBR_Downlink: 2048 * KBps, QCI: 4}
	case 5:
		return QoSParameters{MBR_Uplink: 1024 * KBps, MBR_Downlink: 2048 * KBps, QCI: 5}
	case 6:
		return QoSParameters{MBR_Uplink: 512 * KBps, MBR_Downlink: 1024 * KBps, QCI: 6}
	case 7:
		return QoSParameters{MBR_Uplink: 256 * KBps, MBR_Downlink: 512 * KBps, QCI: 7}
	case 8:
		return QoSParameters{MBR_Uplink: 128 * KBps, MBR_Downlink: 256 * KBps, QCI: 8}
	case 9:
		fallthrough
	default:
		return DefaultQoSParameters()
	}
}

func min(a, b uint64) uint64 {
	if a < b {
		return a
	}
	return b
}

package stats

import (
	"sync"
	"sync/atomic"
	"time"
)

type HistogramBucket struct {
	Range    string  `json:"range"`
	Count    int64   `json:"count"`
	Percent  float64 `json:"percent"`
	MinMs    float64 `json:"min_ms"`
	MaxMs    float64 `json:"max_ms"`
}

type Histogram struct {
	Buckets  []HistogramBucket `json:"buckets"`
	Total    int64             `json:"total"`
}

type Snapshot struct {
	Timestamp     time.Time `json:"timestamp"`
	QPS           float64   `json:"qps"`
	SuccessRate   float64   `json:"success_rate"`
	ErrorRate     float64   `json:"error_rate"`
	AvgLatencyMs  float64   `json:"avg_latency_ms"`
	P50LatencyMs  float64   `json:"p50_latency_ms"`
	P95LatencyMs  float64   `json:"p95_latency_ms"`
	P99LatencyMs  float64   `json:"p99_latency_ms"`
	TotalRequests int64     `json:"total_requests"`
	TotalSuccess  int64     `json:"total_success"`
	TotalErrors   int64     `json:"total_errors"`
	ActiveClients int64     `json:"active_clients"`
	ConnRate      float64   `json:"conn_rate"`
	TotalConns    int64     `json:"total_conns"`
}

var histBounds = []float64{
	0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000,
}

type Collector struct {
	totalReqs    atomic.Int64
	totalSuccess atomic.Int64
	totalErrors  atomic.Int64
	activeConns  atomic.Int64
	totalConns   atomic.Int64

	intervalReqs    atomic.Int64
	intervalSuccess atomic.Int64
	intervalErrors  atomic.Int64
	intervalConns   atomic.Int64

	latencies sync.Mutex
	latBuf    []float64
	allLats   []float64
	hist      []int64

	lastSnap time.Time
}

func NewCollector() *Collector {
	return &Collector{
		latBuf:   make([]float64, 0, 4096),
		allLats:  make([]float64, 0, 65536),
		hist:     make([]int64, len(histBounds)),
		lastSnap: time.Now(),
	}
}

func (c *Collector) RecordSuccess(latency time.Duration) {
	c.totalReqs.Add(1)
	c.totalSuccess.Add(1)
	c.intervalReqs.Add(1)
	c.intervalSuccess.Add(1)

	ms := float64(latency.Microseconds()) / 1000.0
	c.latencies.Lock()
	c.latBuf = append(c.latBuf, ms)
	c.allLats = append(c.allLats, ms)
	c.addToHist(ms)
	c.latencies.Unlock()
}

func (c *Collector) RecordError() {
	c.totalReqs.Add(1)
	c.totalErrors.Add(1)
	c.intervalReqs.Add(1)
	c.intervalErrors.Add(1)
}

func (c *Collector) IncConn() {
	c.activeConns.Add(1)
	c.totalConns.Add(1)
	c.intervalConns.Add(1)
}

func (c *Collector) DecConn()    { c.activeConns.Add(-1) }
func (c *Collector) ActiveConns() int64 { return c.activeConns.Load() }

func (c *Collector) addToHist(ms float64) {
	for i := len(histBounds) - 1; i >= 0; i-- {
		if ms >= histBounds[i] {
			c.hist[i]++
			break
		}
	}
}

func (c *Collector) Snapshot() Snapshot {
	now := time.Now()
	elapsed := now.Sub(c.lastSnap).Seconds()
	if elapsed < 0.001 {
		elapsed = 0.001
	}

	iReqs := c.intervalReqs.Swap(0)
	iSucc := c.intervalSuccess.Swap(0)
	iErr := c.intervalErrors.Swap(0)
	iConns := c.intervalConns.Swap(0)

	c.latencies.Lock()
	lats := make([]float64, len(c.latBuf))
	copy(lats, c.latBuf)
	c.latBuf = c.latBuf[:0]
	allCopy := make([]float64, len(c.allLats))
	copy(allCopy, c.allLats)
	c.latencies.Unlock()

	qps := float64(iReqs) / elapsed
	sRate := safeDiv(float64(iSucc), float64(iReqs))
	eRate := safeDiv(float64(iErr), float64(iReqs))
	cRate := float64(iConns) / elapsed

	avg := avgFloat(allCopy)
	p50 := percentile(allCopy, 50)
	p95 := percentile(allCopy, 95)
	p99 := percentile(allCopy, 99)

	c.lastSnap = now

	return Snapshot{
		Timestamp:     now,
		QPS:           qps,
		SuccessRate:   sRate,
		ErrorRate:     eRate,
		AvgLatencyMs:  avg,
		P50LatencyMs:  p50,
		P95LatencyMs:  p95,
		P99LatencyMs:  p99,
		TotalRequests: c.totalReqs.Load(),
		TotalSuccess:  c.totalSuccess.Load(),
		TotalErrors:   c.totalErrors.Load(),
		ActiveClients: c.activeConns.Load(),
		ConnRate:      cRate,
		TotalConns:    c.totalConns.Load(),
	}
}

func (c *Collector) Histogram() Histogram {
	c.latencies.Lock()
	defer c.latencies.Unlock()

	var total int64
	for _, v := range c.hist {
		total += v
	}

	buckets := make([]HistogramBucket, len(histBounds))
	for i := 0; i < len(histBounds); i++ {
		b := HistogramBucket{
			MinMs: histBounds[i],
			Count: c.hist[i],
		}
		if i < len(histBounds)-1 {
			b.MaxMs = histBounds[i+1]
			b.Range = formatRange(histBounds[i], histBounds[i+1])
		} else {
			b.MaxMs = 1 << 30
			b.Range = formatRange(histBounds[i], -1)
		}
		if total > 0 {
			b.Percent = float64(c.hist[i]) / float64(total) * 100
		}
		buckets[i] = b
	}

	return Histogram{
		Buckets: buckets,
		Total:   total,
	}
}

func formatRange(min, max float64) string {
	if max < 0 {
		return fmtFloat(min) + "+"
	}
	return fmtFloat(min) + "-" + fmtFloat(max)
}

func fmtFloat(v float64) string {
	if v >= 1000 {
		return itoaF(int(v/1000)) + "s"
	}
	if v >= 1 {
		return itoaF(int(v)) + "ms"
	}
	if v >= 0.001 {
		return itoaF(int(v*1000)) + "μs"
	}
	return "0"
}

func itoaF(i int) string {
	if i == 0 {
		return "0"
	}
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	var buf [10]byte
	pos := 10
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}

func safeDiv(a, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a / b
}

func avgFloat(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	var s float64
	for _, x := range v {
		s += x
	}
	return s / float64(len(v))
}

func percentile(sorted []float64, p int) float64 {
	if len(sorted) == 0 {
		return 0
	}
	tmp := make([]float64, len(sorted))
	copy(tmp, sorted)
	sortFloats(tmp)
	idx := float64(len(tmp)-1) * float64(p) / 100.0
	lo := int(idx)
	hi := lo + 1
	if hi >= len(tmp) {
		return tmp[len(tmp)-1]
	}
	frac := idx - float64(lo)
	return tmp[lo]*(1-frac) + tmp[hi]*frac
}

func sortFloats(a []float64) {
	for i := 1; i < len(a); i++ {
		k := a[i]
		j := i - 1
		for j >= 0 && a[j] > k {
			a[j+1] = a[j]
			j--
		}
		a[j+1] = k
	}
}

package resolver

import (
	"context"
	"fmt"
	"math/rand"
	"sync"
	"sync/atomic"
	"time"

	"github.com/miekg/dns"
)

type Upstream interface {
	Name() string
	Type() string
	Query(ctx context.Context, req *dns.Msg) (*dns.Msg, error)
	Healthy() bool
	LastError() error
	SuccessCount() uint64
	ErrorCount() uint64
	AvgLatency() time.Duration
}

type BaseUpstream struct {
	name         string
	healthy      atomic.Bool
	lastError    atomic.Value
	successCount atomic.Uint64
	errorCount   atomic.Uint64
	latencySum   atomic.Int64
	latencyCount atomic.Uint64
}

func (b *BaseUpstream) SetName(name string) { b.name = name }

func (b *BaseUpstream) SetHealthy(h bool) { b.healthy.Store(h) }

func (b *BaseUpstream) Name() string { return b.name }

func (b *BaseUpstream) Healthy() bool { return b.healthy.Load() }

func (b *BaseUpstream) LastError() error {
	err := b.lastError.Load()
	if err == nil {
		return nil
	}
	return err.(error)
}

func (b *BaseUpstream) SuccessCount() uint64 { return b.successCount.Load() }

func (b *BaseUpstream) ErrorCount() uint64 { return b.errorCount.Load() }

func (b *BaseUpstream) AvgLatency() time.Duration {
	count := b.latencyCount.Load()
	if count == 0 {
		return 0
	}
	return time.Duration(b.latencySum.Load() / int64(count))
}

func (b *BaseUpstream) RecordSuccess(latency time.Duration) {
	b.healthy.Store(true)
	b.successCount.Add(1)
	b.latencySum.Add(int64(latency))
	b.latencyCount.Add(1)
}

func (b *BaseUpstream) RecordError(err error) {
	b.lastError.Store(err)
	b.errorCount.Add(1)
	b.healthy.Store(false)
}

type Manager struct {
	upstreams []Upstream
	strategy  string
	mu        sync.RWMutex
	lastUsed  int
}

const (
	StrategyFailover = "failover"
	StrategyRoundRobin = "round_robin"
	StrategyRandom   = "random"
	StrategyLatency  = "latency"
)

func NewManager(strategy string) *Manager {
	if strategy == "" {
		strategy = StrategyFailover
	}
	return &Manager{
		upstreams: make([]Upstream, 0),
		strategy:  strategy,
	}
}

func (m *Manager) AddUpstream(u Upstream) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.upstreams = append(m.upstreams, u)
}

func (m *Manager) Upstreams() []Upstream {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.upstreams
}

func (m *Manager) Query(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	m.mu.RLock()
	upstreams := make([]Upstream, len(m.upstreams))
	copy(upstreams, m.upstreams)
	m.mu.RUnlock()

	if len(upstreams) == 0 {
		return nil, fmt.Errorf("no upstreams configured")
	}

	var lastErr error
	var resp *dns.Msg

	ordered := m.orderUpstreams(upstreams)

	for _, u := range ordered {
		if !u.Healthy() && len(ordered) > 1 {
			continue
		}

		start := time.Now()
		resp, err := u.Query(ctx, req)
		latency := time.Since(start)

		if err == nil {
			if bu, ok := u.(interface{ RecordSuccess(time.Duration) }); ok {
				bu.RecordSuccess(latency)
			}
			return resp, nil
		}

		lastErr = err
		if bu, ok := u.(interface{ RecordError(error) }); ok {
			bu.RecordError(err)
		}

		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}

	if lastErr != nil {
		return nil, fmt.Errorf("all upstreams failed, last error: %w", lastErr)
	}
	return nil, fmt.Errorf("no healthy upstreams available")
}

func (m *Manager) orderUpstreams(upstreams []Upstream) []Upstream {
	result := make([]Upstream, len(upstreams))
	copy(result, upstreams)

	switch m.strategy {
	case StrategyRoundRobin:
		m.mu.Lock()
		m.lastUsed = (m.lastUsed + 1) % len(result)
		start := m.lastUsed
		m.mu.Unlock()
		result = append(result[start:], result[:start]...)

	case StrategyRandom:
		r := rand.New(rand.NewSource(time.Now().UnixNano()))
		for i := len(result) - 1; i > 0; i-- {
			j := r.Intn(i + 1)
			result[i], result[j] = result[j], result[i]
		}

	case StrategyLatency:
		for i := 1; i < len(result); i++ {
			key := result[i]
			j := i - 1
			for j >= 0 && (result[j].AvgLatency() == 0 || result[j].AvgLatency() > key.AvgLatency()) && key.AvgLatency() > 0 {
				result[j+1] = result[j]
				j--
			}
			result[j+1] = key
		}
	}

	return result
}

func (m *Manager) StartHealthCheck(interval time.Duration, testDomain string) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			m.checkHealth(testDomain)
		}
	}()
}

func (m *Manager) checkHealth(testDomain string) {
	m.mu.RLock()
	upstreams := make([]Upstream, len(m.upstreams))
	copy(upstreams, m.upstreams)
	m.mu.RUnlock()

	for _, u := range upstreams {
		go func(up Upstream) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()

			req := new(dns.Msg)
			req.SetQuestion(dns.Fqdn(testDomain), dns.TypeA)

			start := time.Now()
			resp, err := up.Query(ctx, req)
			latency := time.Since(start)

			if err == nil && resp != nil && resp.Rcode == dns.RcodeSuccess {
				if bu, ok := up.(interface{ RecordSuccess(time.Duration) }); ok {
					bu.RecordSuccess(latency)
				}
			} else if err != nil {
				if bu, ok := up.(interface{ RecordError(error) }); ok {
					bu.RecordError(err)
				}
			}
		}(u)
	}
}

type UpstreamStats struct {
	Name        string        `json:"name"`
	Type        string        `json:"type"`
	Healthy     bool          `json:"healthy"`
	Success     uint64        `json:"success"`
	Errors      uint64        `json:"errors"`
	AvgLatency  string        `json:"avg_latency"`
	LastError   string        `json:"last_error,omitempty"`
}

func (m *Manager) Stats() []UpstreamStats {
	m.mu.RLock()
	upstreams := make([]Upstream, len(m.upstreams))
	copy(upstreams, m.upstreams)
	m.mu.RUnlock()

	stats := make([]UpstreamStats, len(upstreams))
	for i, u := range upstreams {
		lastErr := ""
		if u.LastError() != nil {
			lastErr = u.LastError().Error()
		}
		stats[i] = UpstreamStats{
			Name:       u.Name(),
			Type:       u.Type(),
			Healthy:    u.Healthy(),
			Success:    u.SuccessCount(),
			Errors:     u.ErrorCount(),
			AvgLatency: u.AvgLatency().String(),
			LastError:  lastErr,
		}
	}
	return stats
}

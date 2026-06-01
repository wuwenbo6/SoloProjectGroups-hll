package socks5

import (
	"net"
	"sync"
	"time"
)

type Blacklist struct {
	mu    sync.RWMutex
	ips   map[string]struct{}
	nets  []*net.IPNet
}

func NewBlacklist() *Blacklist {
	return &Blacklist{
		ips:  make(map[string]struct{}),
		nets: make([]*net.IPNet, 0),
	}
}

func (b *Blacklist) AddIP(ip string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.ips[ip] = struct{}{}
}

func (b *Blacklist) AddCIDR(cidr string) error {
	_, ipNet, err := net.ParseCIDR(cidr)
	if err != nil {
		return err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	b.nets = append(b.nets, ipNet)
	return nil
}

func (b *Blacklist) RemoveIP(ip string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	delete(b.ips, ip)
}

func (b *Blacklist) Contains(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	if _, ok := b.ips[ip.String()]; ok {
		return true
	}
	for _, ipNet := range b.nets {
		if ipNet.Contains(ip) {
			return true
		}
	}
	return false
}

type TokenBucket struct {
	capacity   int64
	refillRate float64
	tokens     int64
	lastRefill time.Time
	mu         sync.Mutex
}

func NewTokenBucket(capacity int64, refillPerSecond float64) *TokenBucket {
	return &TokenBucket{
		capacity:   capacity,
		refillRate: refillPerSecond,
		tokens:     capacity,
		lastRefill: time.Now(),
	}
}

func (tb *TokenBucket) refill() {
	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	newTokens := int64(elapsed * tb.refillRate)
	if newTokens > 0 {
		tb.tokens += newTokens
		if tb.tokens > tb.capacity {
			tb.tokens = tb.capacity
		}
		tb.lastRefill = now
	}
}

func (tb *TokenBucket) Take(n int64) (int64, time.Duration) {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.refill()
	if tb.tokens >= n {
		tb.tokens -= n
		return n, 0
	}
	taken := tb.tokens
	tb.tokens = 0
	needed := n - taken
	waitTime := time.Duration(float64(needed) / tb.refillRate * float64(time.Second))
	return taken, waitTime
}

func (tb *TokenBucket) TryTake(n int64) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	tb.refill()
	if tb.tokens >= n {
		tb.tokens -= n
		return true
	}
	return false
}

type RateLimiter struct {
	upload   *TokenBucket
	download *TokenBucket
}

func NewRateLimiter(uploadBytesPerSec, downloadBytesPerSec int64) *RateLimiter {
	return &RateLimiter{
		upload:   NewTokenBucket(uploadBytesPerSec*10, float64(uploadBytesPerSec)),
		download: NewTokenBucket(downloadBytesPerSec*10, float64(downloadBytesPerSec)),
	}
}

func (rl *RateLimiter) LimitUpload(n int) (int, time.Duration) {
	taken, wait := rl.upload.Take(int64(n))
	return int(taken), wait
}

func (rl *RateLimiter) LimitDownload(n int) (int, time.Duration) {
	taken, wait := rl.download.Take(int64(n))
	return int(taken), wait
}

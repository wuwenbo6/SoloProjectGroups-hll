package cache

import (
	"container/list"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/miekg/dns"
)

type CacheEntry struct {
	key          string
	msg          *dns.Msg
	expireAt     time.Time
	lastAccessed time.Time
}

type DNSCache struct {
	mu          sync.RWMutex
	entries     map[string]*list.Element
	lruList     *list.List
	stats       Stats
	maxSize     int
	defaultTTL  time.Duration
}

type Stats struct {
	Hits          uint64
	Misses        uint64
	ExpiredHits   uint64
	Evictions     uint64
	Size          int
	MaxSize       int
	TotalRequests uint64
}

func NewDNSCache(maxSize int) *DNSCache {
	return &DNSCache{
		entries:    make(map[string]*list.Element),
		lruList:    list.New(),
		maxSize:    maxSize,
		defaultTTL: 5 * time.Minute,
		stats: Stats{
			MaxSize: maxSize,
		},
	}
}

func (c *DNSCache) Get(key string) (*dns.Msg, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.stats.TotalRequests++

	elem, exists := c.entries[key]
	if !exists {
		c.stats.Misses++
		return nil, false
	}

	entry := elem.Value.(*CacheEntry)

	if time.Now().After(entry.expireAt) {
		c.stats.ExpiredHits++
		c.stats.Misses++
		c.removeElement(elem)
		return nil, false
	}

	c.stats.Hits++
	entry.lastAccessed = time.Now()
	c.lruList.MoveToFront(elem)

	return entry.msg.Copy(), true
}

func (c *DNSCache) Set(key string, msg *dns.Msg, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if ttl <= 0 {
		ttl = c.defaultTTL
	}

	if elem, exists := c.entries[key]; exists {
		entry := elem.Value.(*CacheEntry)
		entry.msg = msg.Copy()
		entry.expireAt = time.Now().Add(ttl)
		entry.lastAccessed = time.Now()
		c.lruList.MoveToFront(elem)
		return
	}

	if c.lruList.Len() >= c.maxSize {
		c.evictLRU()
	}

	entry := &CacheEntry{
		key:          key,
		msg:          msg.Copy(),
		expireAt:     time.Now().Add(ttl),
		lastAccessed: time.Now(),
	}

	elem := c.lruList.PushFront(entry)
	c.entries[key] = elem
	c.stats.Size = c.lruList.Len()
}

func (c *DNSCache) evictLRU() {
	elem := c.lruList.Back()
	if elem == nil {
		return
	}

	entry := elem.Value.(*CacheEntry)
	delete(c.entries, entry.key)
	c.lruList.Remove(elem)
	c.stats.Evictions++
	c.stats.Size = c.lruList.Len()
}

func (c *DNSCache) removeElement(elem *list.Element) {
	entry := elem.Value.(*CacheEntry)
	delete(c.entries, entry.key)
	c.lruList.Remove(elem)
	c.stats.Size = c.lruList.Len()
}

func (c *DNSCache) GetStats() Stats {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.stats
}

func (c *DNSCache) HitRate() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()

	total := c.stats.Hits + c.stats.Misses
	if total == 0 {
		return 0
	}
	return float64(c.stats.Hits) / float64(total) * 100
}

func (c *DNSCache) EffectiveHitRate() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()

	total := c.stats.Hits + c.stats.Misses
	if total == 0 {
		return 0
	}
	return float64(c.stats.Hits+c.stats.ExpiredHits) / float64(total) * 100
}

func (c *DNSCache) CleanExpired() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	evicted := 0

	var next *list.Element
	for elem := c.lruList.Back(); elem != nil; elem = next {
		next = elem.Prev()
		entry := elem.Value.(*CacheEntry)
		if now.After(entry.expireAt) {
			delete(c.entries, entry.key)
			c.lruList.Remove(elem)
			evicted++
		}
	}

	c.stats.Size = c.lruList.Len()
	return evicted
}

func (c *DNSCache) GetEntryCount() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lruList.Len()
}

func GenerateCacheKey(req *dns.Msg) string {
	if len(req.Question) == 0 {
		return ""
	}

	q := req.Question[0]
	var parts []string

	parts = append(parts, strings.ToLower(q.Name))
	parts = append(parts, dns.TypeToString[q.Qtype])
	parts = append(parts, dns.ClassToString[q.Qclass])

	if opt := req.IsEdns0(); opt != nil {
		parts = append(parts, "edns")
		if opt.Do() {
			parts = append(parts, "do")
		}
		if opt.UDPSize() > 0 {
			parts = append(parts, "udp", strconv.Itoa(int(opt.UDPSize())))
		}
		for _, o := range opt.Option {
			switch o := o.(type) {
			case *dns.EDNS0_SUBNET:
				parts = append(parts, "subnet", o.Address.String())
			case *dns.EDNS0_COOKIE:
				parts = append(parts, "cookie")
			}
		}
	}

	if req.CheckingDisabled {
		parts = append(parts, "cd")
	}

	key := strings.Join(parts, "|")

	if len(key) > 256 {
		h := sha256.Sum256([]byte(key))
		key = hex.EncodeToString(h[:])
	}

	return key
}

func GetMinTTL(msg *dns.Msg) time.Duration {
	var minTTL uint32
	found := false

	for _, rr := range msg.Answer {
		if !found || rr.Header().Ttl < minTTL {
			minTTL = rr.Header().Ttl
			found = true
		}
	}
	for _, rr := range msg.Ns {
		if !found || rr.Header().Ttl < minTTL {
			minTTL = rr.Header().Ttl
			found = true
		}
	}
	for _, rr := range msg.Extra {
		if _, ok := rr.(*dns.OPT); ok {
			continue
		}
		if !found || rr.Header().Ttl < minTTL {
			minTTL = rr.Header().Ttl
			found = true
		}
	}

	if !found || minTTL == 0 {
		return 30 * time.Second
	}

	if minTTL < 5 {
		minTTL = 5
	}

	return time.Duration(minTTL) * time.Second
}

func AdjustTTLs(msg *dns.Msg, originalTime time.Time, ttl time.Duration) {
	remaining := uint32(time.Until(originalTime.Add(ttl)).Seconds())
	if remaining < 1 {
		remaining = 1
	}

	for _, rr := range msg.Answer {
		rr.Header().Ttl = remaining
	}
	for _, rr := range msg.Ns {
		rr.Header().Ttl = remaining
	}
	for _, rr := range msg.Extra {
		if _, ok := rr.(*dns.OPT); !ok {
			rr.Header().Ttl = remaining
		}
	}
}

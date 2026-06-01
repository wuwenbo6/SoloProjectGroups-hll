package blocker

import (
	"fmt"
	"sync"
	"time"

	"sip-detector/types"
)

type Blocker struct {
	blockedIPs   map[string]*types.BlockedIP
	mu           sync.RWMutex
	autoBlock    bool
	blockDuration time.Duration
	useIptables   bool
}

func NewBlocker(autoBlock bool, blockDuration time.Duration, useIptables bool) *Blocker {
	b := &Blocker{
		blockedIPs:    make(map[string]*types.BlockedIP),
		autoBlock:     autoBlock,
		blockDuration: blockDuration,
		useIptables:   useIptables,
	}
	go b.cleanupLoop()
	return b
}

func (b *Blocker) BlockIP(ip string, reason string, rate float64, weightedRate float64, geoInfo *types.GeoInfo, permanent bool) (*types.BlockedIP, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.blockedIPs[ip]; exists {
		return b.blockedIPs[ip], nil
	}

	duration := int64(b.blockDuration.Seconds())
	blockedAt := time.Now()
	expiresAt := blockedAt.Add(b.blockDuration)
	if permanent {
		duration = -1
		expiresAt = time.Time{}
	}

	blocked := &types.BlockedIP{
		IP:           ip,
		Reason:       reason,
		BlockedAt:    blockedAt,
		ExpiresAt:    expiresAt,
		Duration:     duration,
		Rate:         rate,
		WeightedRate: weightedRate,
		GeoInfo:      geoInfo,
		IsPermanent:  permanent,
		RuleSource:   "auto-detect",
	}

	b.blockedIPs[ip] = blocked

	if b.useIptables {
		if err := b.addIptablesRule(ip); err != nil {
			return blocked, err
		}
	}

	return blocked, nil
}

func (b *Blocker) UnblockIP(ip string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if _, exists := b.blockedIPs[ip]; !exists {
		return fmt.Errorf("IP %s not blocked", ip)
	}

	if b.useIptables {
		if err := b.removeIptablesRule(ip); err != nil {
			return err
		}
	}

	delete(b.blockedIPs, ip)
	return nil
}

func (b *Blocker) IsBlocked(ip string) bool {
	b.mu.RLock()
	defer b.mu.RUnlock()

	blocked, exists := b.blockedIPs[ip]
	if !exists {
		return false
	}

	if blocked.IsPermanent {
		return true
	}

	if time.Now().After(blocked.ExpiresAt) {
		return false
	}

	return true
}

func (b *Blocker) GetBlockedIPs() []*types.BlockedIP {
	b.mu.RLock()
	defer b.mu.RUnlock()

	result := make([]*types.BlockedIP, 0, len(b.blockedIPs))
	for _, blocked := range b.blockedIPs {
		if !blocked.IsPermanent && time.Now().After(blocked.ExpiresAt) {
			continue
		}
		result = append(result, blocked)
	}
	return result
}

func (b *Blocker) GetBlockedCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()

	count := 0
	for _, blocked := range b.blockedIPs {
		if blocked.IsPermanent || time.Now().Before(blocked.ExpiresAt) {
			count++
		}
	}
	return count
}

func (b *Blocker) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		b.cleanupExpired()
	}
}

func (b *Blocker) cleanupExpired() {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	for ip, blocked := range b.blockedIPs {
		if !blocked.IsPermanent && now.After(blocked.ExpiresAt) {
			if b.useIptables {
				b.removeIptablesRule(ip)
			}
			delete(b.blockedIPs, ip)
		}
	}
}

func (b *Blocker) addIptablesRule(ip string) error {
	return nil
}

func (b *Blocker) removeIptablesRule(ip string) error {
	return nil
}

func (b *Blocker) SetAutoBlock(enabled bool) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.autoBlock = enabled
}

func (b *Blocker) IsAutoBlockEnabled() bool {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.autoBlock
}

func (b *Blocker) GetBlockDuration() time.Duration {
	return b.blockDuration
}

package cache

import (
	"sync"
	"time"
)

type BindingEntry struct {
	MNPrefix    string    `json:"mn_prefix"`
	MAGAddress  string    `json:"mag_address"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Lifetime    uint16    `json:"lifetime"`
}

type BindingCache struct {
	mu     sync.RWMutex
	entries map[string]*BindingEntry
}

func NewBindingCache() *BindingCache {
	return &BindingCache{
		entries: make(map[string]*BindingEntry),
	}
}

func (bc *BindingCache) AddOrUpdate(mnPrefix, magAddress string, lifetime uint16) {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	now := time.Now()
	if entry, exists := bc.entries[mnPrefix]; exists {
		entry.MAGAddress = magAddress
		entry.UpdatedAt = now
		entry.Lifetime = lifetime
	} else {
		bc.entries[mnPrefix] = &BindingEntry{
			MNPrefix:   mnPrefix,
			MAGAddress: magAddress,
			CreatedAt:  now,
			UpdatedAt:  now,
			Lifetime:   lifetime,
		}
	}
}

func (bc *BindingCache) Get(mnPrefix string) (*BindingEntry, bool) {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	entry, exists := bc.entries[mnPrefix]
	return entry, exists
}

func (bc *BindingCache) GetAll() []*BindingEntry {
	bc.mu.RLock()
	defer bc.mu.RUnlock()

	entries := make([]*BindingEntry, 0, len(bc.entries))
	for _, entry := range bc.entries {
		entries = append(entries, entry)
	}
	return entries
}

func (bc *BindingCache) Delete(mnPrefix string) {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	delete(bc.entries, mnPrefix)
}

func (bc *BindingCache) CleanupExpired() {
	bc.mu.Lock()
	defer bc.mu.Unlock()

	now := time.Now()
	for prefix, entry := range bc.entries {
		expiryTime := entry.UpdatedAt.Add(time.Duration(entry.Lifetime) * time.Second)
		if now.After(expiryTime) {
			delete(bc.entries, prefix)
		}
	}
}

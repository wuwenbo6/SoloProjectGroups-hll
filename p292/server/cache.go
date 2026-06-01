package main

import (
	"sync"
	"time"
)

type BindingCache struct {
	store sync.Map
}

func NewBindingCache() *BindingCache {
	return &BindingCache{}
}

func (bc *BindingCache) Register(entry BCEEntry) {
	entry.RegisteredAt = time.Now()
	entry.ExpiresAt = time.Now().Add(time.Duration(entry.Lifetime) * time.Second)
	entry.TunnelPriority = entry.AccessTech.Priority()
	bc.store.Store(entry.MNID, entry)
}

func (bc *BindingCache) Update(entry BCEEntry) {
	entry.ExpiresAt = time.Now().Add(time.Duration(entry.Lifetime) * time.Second)
	entry.TunnelPriority = entry.AccessTech.Priority()
	bc.store.Store(entry.MNID, entry)
}

func (bc *BindingCache) DeRegister(mnID string) (BCEEntry, bool) {
	val, loaded := bc.store.LoadAndDelete(mnID)
	if !loaded {
		return BCEEntry{}, false
	}
	entry, ok := val.(BCEEntry)
	return entry, ok
}

func (bc *BindingCache) Lookup(mnID string) (BCEEntry, bool) {
	val, ok := bc.store.Load(mnID)
	if !ok {
		return BCEEntry{}, false
	}
	entry, ok := val.(BCEEntry)
	return entry, ok
}

func (bc *BindingCache) GetAll() []BCEEntry {
	now := time.Now()
	entries := make([]BCEEntry, 0)
	bc.store.Range(func(key, value any) bool {
		entry, ok := value.(BCEEntry)
		if !ok {
			return true
		}
		if now.After(entry.ExpiresAt) {
			bc.store.Delete(key)
			return true
		}
		entries = append(entries, entry)
		return true
	})
	return entries
}

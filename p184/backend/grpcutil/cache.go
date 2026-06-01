package grpcutil

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"google.golang.org/protobuf/reflect/protoregistry"
)

type CacheEntry struct {
	Services     []string
	ServiceHash  string
	LastRefresh  time.Time
	FileRegistry *protoregistry.Files
	MethodCache  map[string]*MethodCacheEntry
}

type MethodCacheEntry struct {
	InputSchema  map[string]interface{}
	OutputSchema map[string]interface{}
	Template     string
	InputType    string
	OutputType   string
}

type ServiceCache struct {
	mu       sync.RWMutex
	entries  map[string]*CacheEntry
	watchers map[string][]chan<- struct{}
}

var globalCache = &ServiceCache{
	entries:  make(map[string]*CacheEntry),
	watchers: make(map[string][]chan<- struct{}),
}

func cacheKey(address string, tls bool) string {
	h := sha256.New()
	h.Write([]byte(fmt.Sprintf("%s-%t", address, tls)))
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func computeServicesHash(services []string) string {
	h := sha256.New()
	for _, s := range services {
		h.Write([]byte(s))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

func GetCachedServices(address string, tls bool) ([]string, bool) {
	globalCache.mu.RLock()
	defer globalCache.mu.RUnlock()

	key := cacheKey(address, tls)
	entry, ok := globalCache.entries[key]
	if !ok {
		return nil, false
	}

	if time.Since(entry.LastRefresh) > 5*time.Minute {
		return nil, false
	}

	return entry.Services, true
}

func CacheServices(address string, tls bool, services []string) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	key := cacheKey(address, tls)
	newHash := computeServicesHash(services)

	entry, exists := globalCache.entries[key]
	if !exists {
		entry = &CacheEntry{
			MethodCache: make(map[string]*MethodCacheEntry),
		}
		globalCache.entries[key] = entry
	}

	oldHash := entry.ServiceHash
	entry.Services = services
	entry.ServiceHash = newHash
	entry.LastRefresh = time.Now()

	if exists && oldHash != newHash {
		entry.MethodCache = make(map[string]*MethodCacheEntry)
		entry.FileRegistry = nil
		notifyServiceChange(key)
	}
}

func GetCachedRegistry(address string, tls bool) (*protoregistry.Files, bool) {
	globalCache.mu.RLock()
	defer globalCache.mu.RUnlock()

	key := cacheKey(address, tls)
	entry, ok := globalCache.entries[key]
	if !ok || entry.FileRegistry == nil {
		return nil, false
	}
	return entry.FileRegistry, true
}

func CacheRegistry(address string, tls bool, reg *protoregistry.Files) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	key := cacheKey(address, tls)
	entry, ok := globalCache.entries[key]
	if !ok {
		entry = &CacheEntry{
			MethodCache: make(map[string]*MethodCacheEntry),
		}
		globalCache.entries[key] = entry
	}
	entry.FileRegistry = reg
}

func GetCachedMethod(address string, tls bool, method string) (*MethodCacheEntry, bool) {
	globalCache.mu.RLock()
	defer globalCache.mu.RUnlock()

	key := cacheKey(address, tls)
	entry, ok := globalCache.entries[key]
	if !ok {
		return nil, false
	}

	methodEntry, ok := entry.MethodCache[method]
	return methodEntry, ok
}

func CacheMethod(address string, tls bool, method string, entry *MethodCacheEntry) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	key := cacheKey(address, tls)
	cacheEntry, ok := globalCache.entries[key]
	if !ok {
		cacheEntry = &CacheEntry{
			MethodCache: make(map[string]*MethodCacheEntry),
		}
		globalCache.entries[key] = cacheEntry
	}
	cacheEntry.MethodCache[method] = entry
}

func InvalidateCache(address string, tls bool) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	key := cacheKey(address, tls)
	delete(globalCache.entries, key)
	notifyServiceChange(key)
}

func InvalidateAllCache() {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	for key := range globalCache.entries {
		delete(globalCache.entries, key)
		notifyServiceChange(key)
	}
}

func WatchServiceChanges(address string, tls bool) (<-chan struct{}, func()) {
	globalCache.mu.Lock()
	defer globalCache.mu.Unlock()

	key := cacheKey(address, tls)
	ch := make(chan struct{}, 1)
	globalCache.watchers[key] = append(globalCache.watchers[key], ch)

	cleanup := func() {
		globalCache.mu.Lock()
		defer globalCache.mu.Unlock()
		watchers := globalCache.watchers[key]
		for i, w := range watchers {
			if w == ch {
				globalCache.watchers[key] = append(watchers[:i], watchers[i+1:]...)
				break
			}
		}
		close(ch)
	}

	return ch, cleanup
}

func notifyServiceChange(key string) {
	watchers, ok := globalCache.watchers[key]
	if !ok {
		return
	}
	for _, w := range watchers {
		select {
		case w <- struct{}{}:
		default:
		}
	}
}

func StartServiceWatcher(ctx context.Context, address string, tls bool, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rc, err := NewReflectionClient(ctx, address, tls)
			if err != nil {
				continue
			}
			services, err := rc.ListServices(ctx)
			rc.Close()
			if err != nil {
				continue
			}

			key := cacheKey(address, tls)
			globalCache.mu.RLock()
			entry, exists := globalCache.entries[key]
			oldHash := ""
			if exists {
				oldHash = entry.ServiceHash
			}
			globalCache.mu.RUnlock()

			newHash := computeServicesHash(services)
			if oldHash != "" && oldHash != newHash {
				InvalidateCache(address, tls)
			}
			CacheServices(address, tls, services)
		}
	}
}

func GetCacheStats() string {
	globalCache.mu.RLock()
	defer globalCache.mu.RUnlock()

	stats := make(map[string]interface{})
	stats["total_connections"] = len(globalCache.entries)

	entries := make(map[string]interface{})
	for key, entry := range globalCache.entries {
		entries[key] = map[string]interface{}{
			"services_count":  len(entry.Services),
			"methods_cached":  len(entry.MethodCache),
			"has_registry":    entry.FileRegistry != nil,
			"last_refresh":    entry.LastRefresh,
			"watchers_count":  len(globalCache.watchers[key]),
		}
	}
	stats["entries"] = entries

	b, _ := json.MarshalIndent(stats, "", "  ")
	return string(b)
}

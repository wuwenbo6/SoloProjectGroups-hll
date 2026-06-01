package ripng

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"sync"
	"time"
)

const (
	CommandRequest  = 1
	CommandResponse = 2

	InfiniteMetric = 16

	MaxEntriesPerMessage = 25

	DefaultTimerInterval   = 1
	DefaultUpdateInterval  = 30
	DefaultTimeoutInterval = 180
	DefaultGarbageInterval = 120

	MulticastAddress = "FF02::9"
)

func FormatIPv6Full(addr netip.Addr) string {
	if !addr.Is6() {
		return addr.String()
	}
	b := addr.As16()
	return fmt.Sprintf("%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
		b[0], b[1], b[2], b[3],
		b[4], b[5], b[6], b[7],
		b[8], b[9], b[10], b[11],
		b[12], b[13], b[14], b[15])
}

func FormatIPv6PrefixFull(prefix netip.Prefix) string {
	return FormatIPv6Full(prefix.Addr()) + "/" + fmt.Sprintf("%d", prefix.Bits())
}

func CommonPrefix(a, b netip.Prefix) netip.Prefix {
	if a.Addr().Is4() != b.Addr().Is4() {
		return netip.Prefix{}
	}
	aBytes := a.Addr().As16()
	bBytes := b.Addr().As16()
	var commonBits int
	for i := 0; i < 16; i++ {
		diff := aBytes[i] ^ bBytes[i]
		if diff == 0 {
			commonBits += 8
		} else {
			for j := 7; j >= 0; j-- {
				if (diff & (1 << j)) == 0 {
					commonBits++
				} else {
					break
				}
			}
			break
		}
	}
	minBits := a.Bits()
	if b.Bits() < minBits {
		minBits = b.Bits()
	}
	if commonBits > minBits {
		commonBits = minBits
	}
	masked := make([]byte, 16)
	copy(masked, aBytes[:])
	for i := commonBits; i < 128; i++ {
		byteIdx := i / 8
		bitIdx := 7 - (i % 8)
		masked[byteIdx] &^= (1 << bitIdx)
	}
	addr, _ := netip.ParseAddr(fmt.Sprintf("%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
		masked[0], masked[1], masked[2], masked[3],
		masked[4], masked[5], masked[6], masked[7],
		masked[8], masked[9], masked[10], masked[11],
		masked[12], masked[13], masked[14], masked[15]))
	return netip.PrefixFrom(addr, commonBits)
}

func AggregateRoutes(prefixes []netip.Prefix) []netip.Prefix {
	if len(prefixes) == 0 {
		return nil
	}
	type prefixItem struct {
		prefix netip.Prefix
		used   bool
	}
	items := make([]prefixItem, len(prefixes))
	for i, p := range prefixes {
		items[i] = prefixItem{prefix: p, used: false}
	}
	var result []netip.Prefix
	for i := 0; i < len(items); i++ {
		if items[i].used {
			continue
		}
		aggregated := items[i].prefix
		items[i].used = true
		var aggregatedList []string
		aggregatedList = append(aggregatedList, items[i].prefix.String())
		for j := i + 1; j < len(items); j++ {
			if items[j].used {
				continue
			}
			common := CommonPrefix(aggregated, items[j].prefix)
			if common.IsValid() && common.Bits() < aggregated.Bits() && common.Bits() < items[j].prefix.Bits() {
				aggregated = common
				items[j].used = true
				aggregatedList = append(aggregatedList, items[j].prefix.String())
				i = -1
				break
			}
		}
		if i == -1 {
			continue
		}
		result = append(result, aggregated)
	}
	return result
}

type RouteEntry struct {
	Prefix        netip.Prefix `json:"prefix"`
	RouteTag      uint16       `json:"route_tag"`
	Metric        uint8        `json:"metric"`
	NextHop       netip.Addr   `json:"next_hop"`
	LearnedFrom   string       `json:"learned_from"`
	InterfaceName string       `json:"interface_name"`
	IsLocal       bool         `json:"is_local"`
	IsAggregate   bool         `json:"is_aggregate"`
	Aggregated    []string     `json:"aggregated,omitempty"`
	Timer         int          `json:"timer"`
	IsGarbage     bool         `json:"is_garbage"`
	Changed       bool         `json:"changed"`
}

type RIPngMessage struct {
	Command  byte         `json:"command"`
	Entries  []RouteEntry `json:"entries"`
	SenderID string       `json:"sender_id"`
	FromIF   string       `json:"from_interface"`
}

type RoutingTable struct {
	mu     sync.RWMutex
	Table  map[string]*RouteEntry `json:"table"`
	Owner  string                 `json:"owner"`
	events []RoutingEvent
}

type RoutingEvent struct {
	Timestamp time.Time   `json:"timestamp"`
	Type      string      `json:"type"`
	RouterID  string      `json:"router_id"`
	Detail    string      `json:"detail"`
	Entry     *RouteEntry `json:"entry,omitempty"`
}

func NewRoutingTable(owner string) *RoutingTable {
	return &RoutingTable{
		Table:  make(map[string]*RouteEntry),
		Owner:  owner,
		events: make([]RoutingEvent, 0),
	}
}

func routeKey(prefix netip.Prefix) string {
	return fmt.Sprintf("%s/%d", prefix.Addr().String(), prefix.Bits())
}

func (rt *RoutingTable) AddEvent(eventType, detail string, entry *RouteEntry) {
	rt.events = append(rt.events, RoutingEvent{
		Timestamp: time.Now(),
		Type:      eventType,
		RouterID:  rt.Owner,
		Detail:    detail,
		Entry:     entry,
	})
}

func (rt *RoutingTable) GetEvents() []RoutingEvent {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	result := make([]RoutingEvent, len(rt.events))
	copy(result, rt.events)
	return result
}

func (rt *RoutingTable) AddLocalRoute(prefix netip.Prefix, ifName string) {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(prefix)
	if existing, ok := rt.Table[key]; ok && existing.IsLocal {
		return
	}

	entry := &RouteEntry{
		Prefix:        prefix,
		Metric:        0,
		NextHop:       netip.IPv6Unspecified(),
		LearnedFrom:   "",
		InterfaceName: ifName,
		IsLocal:       true,
		Timer:         0,
		IsGarbage:     false,
		Changed:       true,
	}
	rt.Table[key] = entry
	rt.AddEvent("ADD_LOCAL", fmt.Sprintf("Added local route %s on %s", key, ifName), entry)
}

func (rt *RoutingTable) AddAggregateRoute(prefix netip.Prefix, aggregated []string, metric uint8, ifName string) {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(prefix)
	if existing, ok := rt.Table[key]; ok && existing.IsAggregate {
		existing.Aggregated = aggregated
		existing.Metric = metric
		existing.Changed = true
		rt.AddEvent("UPDATE_AGGREGATE", fmt.Sprintf("Updated aggregate route %s (covers %d routes)", key, len(aggregated)), existing)
		return
	}

	entry := &RouteEntry{
		Prefix:        prefix,
		Metric:        metric,
		NextHop:       netip.IPv6Unspecified(),
		LearnedFrom:   "",
		InterfaceName: ifName,
		IsLocal:       false,
		IsAggregate:   true,
		Aggregated:    aggregated,
		Timer:         0,
		IsGarbage:     false,
		Changed:       true,
	}
	rt.Table[key] = entry
	rt.AddEvent("ADD_AGGREGATE", fmt.Sprintf("Added aggregate route %s (covers %d routes)", key, len(aggregated)), entry)
}

func (rt *RoutingTable) RemoveAggregateRoute(prefix netip.Prefix) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(prefix)
	entry, exists := rt.Table[key]
	if !exists || !entry.IsAggregate {
		return false
	}

	delete(rt.Table, key)
	rt.AddEvent("REMOVE_AGGREGATE", fmt.Sprintf("Removed aggregate route %s", key), entry)
	return true
}

func (rt *RoutingTable) AutoAggregate(minPrefixLen int) []netip.Prefix {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	var prefixes []netip.Prefix
	for _, entry := range rt.Table {
		if entry.IsAggregate || entry.IsGarbage {
			continue
		}
		if entry.Prefix.Bits() > minPrefixLen {
			prefixes = append(prefixes, entry.Prefix)
		}
	}

	return AggregateRoutes(prefixes)
}

func (rt *RoutingTable) Update(entry *RouteEntry) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(entry.Prefix)
	existing, exists := rt.Table[key]

	if !exists {
		rt.Table[key] = entry
		rt.AddEvent("ROUTE_ADD", fmt.Sprintf("New route %s via %s metric %d", key, entry.LearnedFrom, entry.Metric), entry)
		return true
	}

	if existing.IsLocal {
		return false
	}

	if existing.IsGarbage {
		if entry.Metric < InfiniteMetric {
			rt.Table[key] = entry
			rt.AddEvent("ROUTE_REVIVE", fmt.Sprintf("Revived route %s via %s metric %d", key, entry.LearnedFrom, entry.Metric), entry)
			return true
		}
		return false
	}

	if entry.LearnedFrom == existing.LearnedFrom {
		if entry.Metric != existing.Metric {
			rt.Table[key] = entry
			rt.AddEvent("ROUTE_UPDATE", fmt.Sprintf("Updated route %s metric %d->%d", key, existing.Metric, entry.Metric), entry)
			return true
		}
		rt.Table[key] = entry
		return false
	}

	if entry.Metric < existing.Metric {
		rt.Table[key] = entry
		rt.AddEvent("ROUTE_BETTER", fmt.Sprintf("Better route %s via %s metric %d (was %d via %s)", key, entry.LearnedFrom, entry.Metric, existing.Metric, existing.LearnedFrom), entry)
		return true
	}

	return false
}

func (rt *RoutingTable) Invalidate(prefix netip.Prefix) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(prefix)
	entry, exists := rt.Table[key]
	if !exists || entry.IsLocal {
		return false
	}

	if entry.Metric >= InfiniteMetric {
		return false
	}

	entry.Metric = InfiniteMetric
	entry.IsGarbage = true
	entry.Changed = true
	entry.Timer = 0
	rt.AddEvent("ROUTE_INVALID", fmt.Sprintf("Invalidated route %s", key), entry)
	return true
}

func (rt *RoutingTable) Remove(prefix netip.Prefix) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	key := routeKey(prefix)
	if _, exists := rt.Table[key]; exists {
		delete(rt.Table, key)
		rt.AddEvent("ROUTE_REMOVE", fmt.Sprintf("Removed route %s", key), nil)
		return true
	}
	return false
}

func (rt *RoutingTable) GetAll() []RouteEntry {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	result := make([]RouteEntry, 0, len(rt.Table))
	for _, entry := range rt.Table {
		result = append(result, *entry)
	}
	return result
}

func (rt *RoutingTable) GetCopy() map[string]*RouteEntry {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	copy := make(map[string]*RouteEntry, len(rt.Table))
	for k, v := range rt.Table {
		entry := *v
		copy[k] = &entry
	}
	return copy
}

func (rt *RoutingTable) ToJSON() string {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	entries := rt.GetAll()
	data, _ := json.MarshalIndent(entries, "", "  ")
	return string(data)
}

func (rt *RoutingTable) TickTimers() []netip.Prefix {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	var toRemove []netip.Prefix

	for key, entry := range rt.Table {
		if entry.IsLocal {
			continue
		}

		entry.Timer++

		if !entry.IsGarbage && entry.Timer >= DefaultTimeoutInterval {
			entry.Metric = InfiniteMetric
			entry.IsGarbage = true
			entry.Changed = true
			entry.Timer = 0
			rt.AddEvent("ROUTE_TIMEOUT", fmt.Sprintf("Route %s timed out", key), entry)
		} else if entry.IsGarbage && entry.Timer >= DefaultGarbageInterval {
			toRemove = append(toRemove, entry.Prefix)
			rt.AddEvent("ROUTE_GARBAGE", fmt.Sprintf("Garbage collected route %s", key), entry)
		}
	}

	for _, prefix := range toRemove {
		delete(rt.Table, routeKey(prefix))
	}

	return toRemove
}

func (rt *RoutingTable) ClearChanged() {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	for _, entry := range rt.Table {
		entry.Changed = false
	}
}

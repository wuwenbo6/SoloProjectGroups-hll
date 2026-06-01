package mapserver

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/lisp-mapserver/internal/lisp"
)

type MappingEntry struct {
	EID         net.IP
	EIDMaskLen  uint8
	RLOCs       []lisp.RLOC
	TTL         uint32
	CreatedAt   time.Time
	LastQueried time.Time
	QueryCount  int
	Source      string
	RegisteredBy string
}

type MapServer struct {
	mappings  map[string]*MappingEntry
	mu        sync.RWMutex
	stats     ServerStats
	selector  *RLOCSelector
	counters  map[string]int
}

type ServerStats struct {
	TotalRequests   uint64
	TotalReplies    uint64
	TotalRegisters  uint64
	CacheHits       uint64
	CacheMisses     uint64
	Uptime          time.Duration
	StartTime       time.Time
}

type MappingInfo struct {
	EID          string     `json:"eid"`
	EIDMaskLen   uint8      `json:"eid_mask_len"`
	RLOCs        []RLOCInfo `json:"rlocs"`
	SelectedRLOC *RLOCInfo  `json:"selected_rloc,omitempty"`
	TTL          uint32     `json:"ttl"`
	QueryCount   int        `json:"query_count"`
	Source       string     `json:"source"`
	RegisteredBy string     `json:"registered_by,omitempty"`
	CreatedAt    string     `json:"created_at"`
	LastQueried  string     `json:"last_queried,omitempty"`
}

type RLOCInfo struct {
	IP       string `json:"ip"`
	Priority uint8  `json:"priority"`
	Weight   uint8  `json:"weight"`
}

func NewMapServer() *MapServer {
	ms := &MapServer{
		mappings: make(map[string]*MappingEntry),
		stats: ServerStats{
			StartTime: time.Now(),
		},
		selector: NewRLOCSelector(),
		counters: make(map[string]int),
	}
	ms.initDefaultMappings()
	return ms
}

func (ms *MapServer) initDefaultMappings() {
	defaultMappings := []struct {
		eid      string
		maskLen  uint8
		rlocs    []struct {
			ip       string
			priority uint8
			weight   uint8
		}
		ttl uint32
	}{
		{
			eid:     "10.1.1.1",
			maskLen: 32,
			rlocs: []struct {
				ip       string
				priority uint8
				weight   uint8
			}{
				{"192.168.1.10", 1, 100},
			},
			ttl: 1440,
		},
		{
			eid:     "10.1.1.2",
			maskLen: 32,
			rlocs: []struct {
				ip       string
				priority uint8
				weight   uint8
			}{
				{"192.168.1.20", 1, 100},
			},
			ttl: 1440,
		},
		{
			eid:     "10.1.2.0",
			maskLen: 24,
			rlocs: []struct {
				ip       string
				priority uint8
				weight   uint8
			}{
				{"192.168.2.10", 1, 50},
				{"192.168.2.11", 2, 50},
			},
			ttl: 1440,
		},
		{
			eid:     "10.2.0.0",
			maskLen: 16,
			rlocs: []struct {
				ip       string
				priority uint8
				weight   uint8
			}{
				{"192.168.3.10", 1, 100},
			},
			ttl: 1440,
		},
		{
			eid:     "172.16.0.1",
			maskLen: 32,
			rlocs: []struct {
				ip       string
				priority uint8
				weight   uint8
			}{
				{"10.0.0.1", 1, 100},
				{"10.0.0.2", 2, 50},
			},
			ttl: 1440,
		},
	}

	for _, dm := range defaultMappings {
		eidIP := net.ParseIP(dm.eid)
		if eidIP == nil {
			continue
		}
		eid4 := eidIP.To4()
		if eid4 == nil {
			eid4 = eidIP
		}
		eidCopy := make(net.IP, len(eid4))
		copy(eidCopy, eid4)

		rlocs := make([]lisp.RLOC, 0, len(dm.rlocs))
		for _, r := range dm.rlocs {
			rlocIP := net.ParseIP(r.ip)
			if rlocIP == nil {
				continue
			}
			ip4 := rlocIP.To4()
			if ip4 == nil {
				ip4 = rlocIP
			}
			ipCopy := make(net.IP, len(ip4))
			copy(ipCopy, ip4)
			rlocs = append(rlocs, lisp.NewRLOC(ipCopy, r.priority, r.weight))
		}

		entry := &MappingEntry{
			EID:        eidCopy,
			EIDMaskLen: dm.maskLen,
			RLOCs:      rlocs,
			TTL:        dm.ttl,
			CreatedAt:  time.Now(),
			QueryCount: 0,
			Source:     "static",
		}

		key := ms.getMappingKey(eidCopy, dm.maskLen)
		ms.mappings[key] = entry
	}
}

func (ms *MapServer) getMappingKey(eid net.IP, maskLen uint8) string {
	return fmt.Sprintf("%s/%d", eid.To4().String(), maskLen)
}

func (ms *MapServer) Lookup(eid net.IP) (*MappingEntry, bool) {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	ms.stats.TotalRequests++

	eid4 := eid.To4()
	if eid4 == nil {
		eid4 = eid
	}

	for _, entry := range ms.mappings {
		if ms.eidMatches(eid4, entry.EID, entry.EIDMaskLen) {
			entry.LastQueried = time.Now()
			entry.QueryCount++
			ms.stats.CacheHits++
			return entry, true
		}
	}

	ms.stats.CacheMisses++
	return nil, false
}

func (ms *MapServer) eidMatches(queryIP, entryIP net.IP, maskLen uint8) bool {
	mask := net.CIDRMask(int(maskLen), 32)
	query4 := queryIP.To4()
	entry4 := entryIP.To4()
	if query4 == nil || entry4 == nil {
		return false
	}
	queryNetwork := query4.Mask(mask)
	entryNetwork := entry4.Mask(mask)
	return queryNetwork.Equal(entryNetwork)
}

func (ms *MapServer) AddMapping(eid net.IP, maskLen uint8, rlocs []lisp.RLOC, ttl uint32) error {
	return ms.AddMappingWithSource(eid, maskLen, rlocs, ttl, "api", "")
}

func (ms *MapServer) AddMappingWithSource(eid net.IP, maskLen uint8, rlocs []lisp.RLOC, ttl uint32, source, registeredBy string) error {
	if eid == nil {
		return fmt.Errorf("invalid EID IP")
	}
	if len(rlocs) == 0 {
		return fmt.Errorf("at least one RLOC is required")
	}

	eid4 := eid.To4()
	if eid4 == nil {
		eid4 = eid
	}
	eidCopy := make(net.IP, len(eid4))
	copy(eidCopy, eid4)

	normalizedRLOCs := make([]lisp.RLOC, len(rlocs))
	for i, r := range rlocs {
		ip4 := r.IP.To4()
		if ip4 == nil {
			ip4 = r.IP
		}
		ipCopy := make(net.IP, len(ip4))
		copy(ipCopy, ip4)
		normalizedRLOCs[i] = r
		normalizedRLOCs[i].IP = ipCopy
	}

	ms.mu.Lock()
	defer ms.mu.Unlock()

	key := ms.getMappingKey(eidCopy, maskLen)
	ms.mappings[key] = &MappingEntry{
		EID:          eidCopy,
		EIDMaskLen:   maskLen,
		RLOCs:        normalizedRLOCs,
		TTL:          ttl,
		CreatedAt:    time.Now(),
		QueryCount:   0,
		Source:       source,
		RegisteredBy: registeredBy,
	}

	return nil
}

func (ms *MapServer) DeleteMapping(eid net.IP, maskLen uint8) bool {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	key := ms.getMappingKey(eid, maskLen)
	if _, exists := ms.mappings[key]; exists {
		delete(ms.mappings, key)
		return true
	}
	return false
}

func (ms *MapServer) GetAllMappings() []MappingInfo {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	result := make([]MappingInfo, 0, len(ms.mappings))
	for key, entry := range ms.mappings {
		rlocInfos := make([]RLOCInfo, 0, len(entry.RLOCs))
		for _, rloc := range entry.RLOCs {
			rlocInfos = append(rlocInfos, RLOCInfo{
				IP:       rloc.IP.String(),
				Priority: rloc.Priority,
				Weight:   rloc.Weight,
			})
		}

		var selectedRLOC *RLOCInfo
		selected := ms.selector.Select(entry.RLOCs, key)
		if selected != nil {
			selectedRLOC = &RLOCInfo{
				IP:       selected.IP.String(),
				Priority: selected.Priority,
				Weight:   selected.Weight,
			}
		}

		result = append(result, MappingInfo{
			EID:          entry.EID.String(),
			EIDMaskLen:   entry.EIDMaskLen,
			RLOCs:        rlocInfos,
			SelectedRLOC: selectedRLOC,
			TTL:          entry.TTL,
			QueryCount:   entry.QueryCount,
			Source:       entry.Source,
			RegisteredBy: entry.RegisteredBy,
			CreatedAt:    entry.CreatedAt.Format(time.RFC3339),
			LastQueried:  entry.LastQueried.Format(time.RFC3339),
		})
	}

	return result
}

func (ms *MapServer) SelectRLOC(eid net.IP) (*RLOCInfo, bool) {
	ms.mu.Lock()
	defer ms.mu.Unlock()

	for key, entry := range ms.mappings {
		if ms.eidMatches(eid, entry.EID, entry.EIDMaskLen) {
			selected := ms.selector.Select(entry.RLOCs, key)
			if selected != nil {
				return &RLOCInfo{
					IP:       selected.IP.String(),
					Priority: selected.Priority,
					Weight:   selected.Weight,
				}, true
			}
			return nil, true
		}
	}

	return nil, false
}

func (ms *MapServer) GetStats() ServerStats {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	ms.stats.Uptime = time.Since(ms.stats.StartTime)
	return ms.stats
}

func (ms *MapServer) HandleMapRequest(req *lisp.MapRequest) (*lisp.MapReply, error) {
	ms.stats.TotalReplies++

	if len(req.EIDRecords) == 0 {
		return nil, fmt.Errorf("no EID records in Map-Request")
	}

	eidRecord := req.EIDRecords[0]
	entry, found := ms.Lookup(eidRecord.Prefix)

	if !found {
		reply := lisp.NewMapReply(req.Nonce, eidRecord.Prefix, nil)
		reply.Records[0].ACT = 1
		return reply, nil
	}

	reply := lisp.NewMapReply(req.Nonce, entry.EID, entry.RLOCs)
	reply.Records[0].TTL = entry.TTL
	reply.Records[0].EIDMaskLen = entry.EIDMaskLen

	return reply, nil
}

func (ms *MapServer) HandleMapRegister(reg *lisp.MapRegister) (*lisp.MapNotify, error) {
	ms.stats.TotalRegisters++

	if len(reg.Records) == 0 {
		return nil, fmt.Errorf("no records in Map-Register")
	}

	for _, rec := range reg.Records {
		eidIP := rec.EIDPrefix.Prefix
		if eidIP == nil {
			continue
		}

		rlocs := make([]lisp.RLOC, len(rec.Locators))
		copy(rlocs, rec.Locators)

		err := ms.AddMappingWithSource(eidIP, rec.EIDMaskLen, rlocs, rec.TTL, "register", eidIP.String())
		if err != nil {
			log.Printf("Failed to register EID %s: %v", eidIP.String(), err)
			continue
		}

		log.Printf("Registered EID %s/%d via Map-Register (TTL=%d, %d RLOCs)",
			eidIP.String(), rec.EIDMaskLen, rec.TTL, len(rec.Locators))
	}

	notify := lisp.NewMapNotifyFromRegister(reg)
	return notify, nil
}

type MappingStatEntry struct {
	EID          string `json:"eid"`
	EIDMaskLen   uint8  `json:"eid_mask_len"`
	Source       string `json:"source"`
	RegisteredBy string `json:"registered_by"`
	TTL          uint32 `json:"ttl"`
	RLOCCount    int    `json:"rloc_count"`
	QueryCount   int    `json:"query_count"`
	CreatedAt    string `json:"created_at"`
	LastQueried  string `json:"last_queried"`
}

type MappingStatsExport struct {
	GeneratedAt   string             `json:"generated_at"`
	ServerUptime  string             `json:"server_uptime"`
	TotalMappings int                `json:"total_mappings"`
	BySource      map[string]int     `json:"by_source"`
	Mappings      []MappingStatEntry `json:"mappings"`
	Summary       StatsSummary       `json:"summary"`
}

type StatsSummary struct {
	TotalRequests  uint64 `json:"total_requests"`
	TotalReplies   uint64 `json:"total_replies"`
	TotalRegisters uint64 `json:"total_registers"`
	CacheHits      uint64 `json:"cache_hits"`
	CacheMisses    uint64 `json:"cache_misses"`
	HitRate        string `json:"hit_rate"`
}

func (ms *MapServer) ExportStats() MappingStatsExport {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	ms.stats.Uptime = time.Since(ms.stats.StartTime)

	bySource := make(map[string]int)
	entries := make([]MappingStatEntry, 0, len(ms.mappings))

	for _, entry := range ms.mappings {
		bySource[entry.Source]++
		entries = append(entries, MappingStatEntry{
			EID:          entry.EID.String(),
			EIDMaskLen:   entry.EIDMaskLen,
			Source:       entry.Source,
			RegisteredBy: entry.RegisteredBy,
			TTL:          entry.TTL,
			RLOCCount:    len(entry.RLOCs),
			QueryCount:   entry.QueryCount,
			CreatedAt:    entry.CreatedAt.Format(time.RFC3339),
			LastQueried:  entry.LastQueried.Format(time.RFC3339),
		})
	}

	hitRate := "0.00%"
	if ms.stats.TotalRequests > 0 {
		rate := float64(ms.stats.CacheHits) / float64(ms.stats.TotalRequests) * 100
		hitRate = fmt.Sprintf("%.2f%%", rate)
	}

	return MappingStatsExport{
		GeneratedAt:   time.Now().Format(time.RFC3339),
		ServerUptime:  ms.stats.Uptime.String(),
		TotalMappings: len(ms.mappings),
		BySource:      bySource,
		Mappings:      entries,
		Summary: StatsSummary{
			TotalRequests:  ms.stats.TotalRequests,
			TotalReplies:   ms.stats.TotalReplies,
			TotalRegisters: ms.stats.TotalRegisters,
			CacheHits:      ms.stats.CacheHits,
			CacheMisses:    ms.stats.CacheMisses,
			HitRate:        hitRate,
		},
	}
}

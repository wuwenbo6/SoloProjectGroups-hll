package target

import (
	"sync"
	"time"
)

type LatencyStats struct {
	Count uint64
	Min   time.Duration
	Max   time.Duration
	Total time.Duration
	mu    sync.Mutex
}

func NewLatencyStats() *LatencyStats {
	return &LatencyStats{
		Min: time.Hour,
	}
}

func (ls *LatencyStats) Record(d time.Duration) {
	ls.mu.Lock()
	defer ls.mu.Unlock()

	ls.Count++
	ls.Total += d
	if d < ls.Min {
		ls.Min = d
	}
	if d > ls.Max {
		ls.Max = d
	}
}

func (ls *LatencyStats) Avg() time.Duration {
	ls.mu.Lock()
	defer ls.mu.Unlock()

	if ls.Count == 0 {
		return 0
	}
	return ls.Total / time.Duration(ls.Count)
}

func (ls *LatencyStats) Snapshot() map[string]interface{} {
	ls.mu.Lock()
	defer ls.mu.Unlock()

	snap := make(map[string]interface{})
	snap["count"] = ls.Count
	snap["total_ns"] = ls.Total.Nanoseconds()
	if ls.Count > 0 {
		snap["min_ns"] = ls.Min.Nanoseconds()
		snap["max_ns"] = ls.Max.Nanoseconds()
		snap["avg_ns"] = (ls.Total / time.Duration(ls.Count)).Nanoseconds()
	} else {
		snap["min_ns"] = int64(0)
		snap["max_ns"] = int64(0)
		snap["avg_ns"] = int64(0)
	}
	return snap
}

type ConnStats struct {
	ConnectTime   time.Time
	Transport     string
	AdminCmdCount uint64
	IOCmdCount    uint64
	ReadBytes     uint64
	WriteBytes    uint64
	AdminLatency  *LatencyStats
	IOLatency     *LatencyStats
	ReadLatency   *LatencyStats
	WriteLatency  *LatencyStats
	PendingCmds   map[uint16]time.Time
	mu            sync.Mutex
}

func NewConnStats(transport string) *ConnStats {
	return &ConnStats{
		ConnectTime:  time.Now(),
		Transport:    transport,
		AdminLatency: NewLatencyStats(),
		IOLatency:    NewLatencyStats(),
		ReadLatency:  NewLatencyStats(),
		WriteLatency: NewLatencyStats(),
		PendingCmds:  make(map[uint16]time.Time),
	}
}

func (cs *ConnStats) CommandStart(ccid uint16) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	cs.PendingCmds[ccid] = time.Now()
}

func (cs *ConnStats) CommandDone(ccid uint16, qid uint16, opcode uint8, dataLen int) {
	cs.mu.Lock()
	start, ok := cs.PendingCmds[ccid]
	if ok {
		delete(cs.PendingCmds, ccid)
	}
	cs.mu.Unlock()

	if !ok {
		return
	}

	elapsed := time.Since(start)

	if qid == 0 {
		cs.AdminCmdCount++
		cs.AdminLatency.Record(elapsed)
	} else {
		cs.IOCmdCount++
		cs.IOLatency.Record(elapsed)

		switch opcode {
		case 0x02:
			cs.ReadBytes += uint64(dataLen)
			cs.ReadLatency.Record(elapsed)
		case 0x01:
			cs.WriteBytes += uint64(dataLen)
			cs.WriteLatency.Record(elapsed)
		}
	}
}

func (cs *ConnStats) Snapshot() map[string]interface{} {
	cs.mu.Lock()
	duration := time.Since(cs.ConnectTime)
	pending := len(cs.PendingCmds)
	cs.mu.Unlock()

	snap := make(map[string]interface{})
	snap["transport"] = cs.Transport
	snap["connected_at"] = cs.ConnectTime.Format(time.RFC3339)
	snap["duration_ns"] = duration.Nanoseconds()
	snap["admin_cmd_count"] = cs.AdminCmdCount
	snap["io_cmd_count"] = cs.IOCmdCount
	snap["read_bytes"] = cs.ReadBytes
	snap["write_bytes"] = cs.WriteBytes
	snap["pending_commands"] = pending
	snap["admin_latency"] = cs.AdminLatency.Snapshot()
	snap["io_latency"] = cs.IOLatency.Snapshot()
	snap["read_latency"] = cs.ReadLatency.Snapshot()
	snap["write_latency"] = cs.WriteLatency.Snapshot()

	if duration.Seconds() > 0 {
		snap["iops"] = float64(cs.IOCmdCount) / duration.Seconds()
		snap["read_throughput"] = float64(cs.ReadBytes) / duration.Seconds()
		snap["write_throughput"] = float64(cs.WriteBytes) / duration.Seconds()
	} else {
		snap["iops"] = float64(0)
		snap["read_throughput"] = float64(0)
		snap["write_throughput"] = float64(0)
	}

	return snap
}

type MemoryRegion struct {
	ID      uint32
	Address uint64
	Length  uint32
	RKey    uint32
	LKey    uint32
	Access  uint32
}

type MemoryRegistry struct {
	regions map[uint32]*MemoryRegion
	nextID  uint32
	mu      sync.Mutex
}

func NewMemoryRegistry() *MemoryRegistry {
	return &MemoryRegistry{
		regions: make(map[uint32]*MemoryRegion),
		nextID:  1,
	}
}

func (mr *MemoryRegistry) Register(addr uint64, length uint32, access uint32) *MemoryRegion {
	mr.mu.Lock()
	defer mr.mu.Unlock()

	region := &MemoryRegion{
		ID:      mr.nextID,
		Address: addr,
		Length:  length,
		RKey:    mr.nextID,
		LKey:    mr.nextID,
		Access:  access,
	}
	mr.nextID++
	mr.regions[region.ID] = region
	return region
}

func (mr *MemoryRegistry) Deregister(id uint32) {
	mr.mu.Lock()
	defer mr.mu.Unlock()
	delete(mr.regions, id)
}

func (mr *MemoryRegistry) Get(id uint32) *MemoryRegion {
	mr.mu.Lock()
	defer mr.mu.Unlock()
	return mr.regions[id]
}

func (mr *MemoryRegistry) Count() int {
	mr.mu.Lock()
	defer mr.mu.Unlock()
	return len(mr.regions)
}

package vlan

import (
	"fmt"
	"sync"
	"time"
)

type VLANAllocation struct {
	VLANID      int        `json:"vlan_id"`
	SessionID   string     `json:"session_id"`
	Username    string     `json:"username,omitempty"`
	Description string     `json:"description,omitempty"`
	AllocatedAt time.Time  `json:"allocated_at"`
	Released    bool       `json:"released"`
	ReleasedAt  *time.Time `json:"released_at,omitempty"`
	PoolName    string     `json:"pool_name"`
}

type VLANPool struct {
	mu            sync.RWMutex
	pools         map[string]*PoolRange
	allocations   map[int]*VLANAllocation
	history       []*VLANAllocation
	nextHistoryID int
}

type PoolRange struct {
	Name     string `json:"name"`
	Start    int    `json:"start"`
	End      int    `json:"end"`
	nextID   int
	freeList []int
}

func NewVLANPool() *VLANPool {
	vp := &VLANPool{
		pools:       make(map[string]*PoolRange),
		allocations: make(map[int]*VLANAllocation),
		history:     make([]*VLANAllocation, 0, 1000),
	}

	vp.AddPool("residential", 100, 199)
	vp.AddPool("business", 200, 299)
	vp.AddPool("management", 300, 399)
	vp.AddPool("guest", 400, 499)

	return vp
}

func (vp *VLANPool) AddPool(name string, start, end int) {
	vp.mu.Lock()
	defer vp.mu.Unlock()
	vp.pools[name] = &PoolRange{
		Name:     name,
		Start:    start,
		End:      end,
		nextID:   start,
		freeList: make([]int, 0),
	}
}

func (vp *VLANPool) Allocate(poolName, sessionID, username string) (*VLANAllocation, error) {
	vp.mu.Lock()
	defer vp.mu.Unlock()

	pool, ok := vp.pools[poolName]
	if !ok {
		return nil, fmt.Errorf("VLAN pool '%s' not found", poolName)
	}

	var vlanID int
	var fromFreeList bool

	if len(pool.freeList) > 0 {
		vlanID = pool.freeList[0]
		pool.freeList = pool.freeList[1:]
		fromFreeList = true
	} else {
		found := false
		for attempts := 0; attempts <= (pool.End - pool.Start); attempts++ {
			vlanID = pool.nextID
			pool.nextID++
			if pool.nextID > pool.End {
				pool.nextID = pool.Start
			}

			if _, allocated := vp.allocations[vlanID]; !allocated {
				found = true
				break
			}
		}

		if !found {
			return nil, fmt.Errorf("VLAN pool '%s' exhausted (range %d-%d)", poolName, pool.Start, pool.End)
		}
	}

	if _, allocated := vp.allocations[vlanID]; allocated {
		return nil, fmt.Errorf("VLAN %d already allocated", vlanID)
	}

	alloc := &VLANAllocation{
		VLANID:      vlanID,
		SessionID:   sessionID,
		Username:    username,
		Description: fmt.Sprintf("Pool: %s, User: %s", poolName, username),
		AllocatedAt: time.Now(),
		Released:    false,
		PoolName:    poolName,
	}

	if fromFreeList {
		alloc.Description += " (recycled from free pool)"
	}

	vp.allocations[vlanID] = alloc
	return alloc, nil
}

func (vp *VLANPool) AllocateSpecific(vlanID int, sessionID, username string) (*VLANAllocation, error) {
	vp.mu.Lock()
	defer vp.mu.Unlock()

	if _, allocated := vp.allocations[vlanID]; allocated {
		return nil, fmt.Errorf("VLAN %d already allocated", vlanID)
	}

	poolName := vp.getPoolNameForVLANLocked(vlanID)

	alloc := &VLANAllocation{
		VLANID:      vlanID,
		SessionID:   sessionID,
		Username:    username,
		Description: fmt.Sprintf("Manual allocation, User: %s", username),
		AllocatedAt: time.Now(),
		Released:    false,
		PoolName:    poolName,
	}
	vp.allocations[vlanID] = alloc
	return alloc, nil
}

func (vp *VLANPool) getPoolNameForVLANLocked(vlanID int) string {
	for _, pool := range vp.pools {
		if vlanID >= pool.Start && vlanID <= pool.End {
			return pool.Name
		}
	}
	return "unknown"
}

func (vp *VLANPool) Release(vlanID int) error {
	vp.mu.Lock()
	defer vp.mu.Unlock()

	alloc, ok := vp.allocations[vlanID]
	if !ok {
		return fmt.Errorf("VLAN %d not allocated", vlanID)
	}

	pool, ok := vp.pools[alloc.PoolName]
	if !ok {
		return fmt.Errorf("VLAN pool '%s' not found", alloc.PoolName)
	}

	now := time.Now()
	alloc.Released = true
	alloc.ReleasedAt = &now

	historyAlloc := *alloc
	vp.history = append(vp.history, &historyAlloc)
	if len(vp.history) > 1000 {
		vp.history = vp.history[1:]
	}

	pool.freeList = append(pool.freeList, vlanID)

	delete(vp.allocations, vlanID)
	return nil
}

func (vp *VLANPool) ReleaseBySession(sessionID string) error {
	vp.mu.Lock()
	defer vp.mu.Unlock()

	for vlanID, alloc := range vp.allocations {
		if alloc.SessionID == sessionID {
			pool, ok := vp.pools[alloc.PoolName]
			if !ok {
				delete(vp.allocations, vlanID)
				return fmt.Errorf("VLAN pool '%s' not found", alloc.PoolName)
			}

			now := time.Now()
			alloc.Released = true
			alloc.ReleasedAt = &now

			historyAlloc := *alloc
			vp.history = append(vp.history, &historyAlloc)
			if len(vp.history) > 1000 {
				vp.history = vp.history[1:]
			}

			pool.freeList = append(pool.freeList, vlanID)

			delete(vp.allocations, vlanID)
			return nil
		}
	}
	return fmt.Errorf("no VLAN allocation found for session %s", sessionID)
}

func (vp *VLANPool) GetFreeList(poolName string) []int {
	vp.mu.RLock()
	defer vp.mu.RUnlock()

	pool, ok := vp.pools[poolName]
	if !ok {
		return nil
	}

	result := make([]int, len(pool.freeList))
	copy(result, pool.freeList)
	return result
}

func (vp *VLANPool) ListHistory() []*VLANAllocation {
	vp.mu.RLock()
	defer vp.mu.RUnlock()

	result := make([]*VLANAllocation, len(vp.history))
	copy(result, vp.history)
	return result
}

func (vp *VLANPool) GetAllocation(vlanID int) (*VLANAllocation, bool) {
	vp.mu.RLock()
	defer vp.mu.RUnlock()
	alloc, ok := vp.allocations[vlanID]
	if !ok {
		return nil, false
	}
	return alloc, true
}

func (vp *VLANPool) ListAllocations() []*VLANAllocation {
	vp.mu.RLock()
	defer vp.mu.RUnlock()
	result := make([]*VLANAllocation, 0, len(vp.allocations))
	for _, alloc := range vp.allocations {
		result = append(result, alloc)
	}
	return result
}

func (vp *VLANPool) ListPools() []*PoolRange {
	vp.mu.RLock()
	defer vp.mu.RUnlock()
	result := make([]*PoolRange, 0, len(vp.pools))
	for _, pool := range vp.pools {
		result = append(result, pool)
	}
	return result
}

func (vp *VLANPool) PoolStats(poolName string) (total, used, available int, err error) {
	vp.mu.RLock()
	defer vp.mu.RUnlock()

	pool, ok := vp.pools[poolName]
	if !ok {
		return 0, 0, 0, fmt.Errorf("VLAN pool '%s' not found", poolName)
	}

	total = pool.End - pool.Start + 1
	for vlanID := pool.Start; vlanID <= pool.End; vlanID++ {
		if _, allocated := vp.allocations[vlanID]; allocated {
			used++
		}
	}
	available = total - used
	return
}

func (vp *VLANPool) GetPoolForVLAN(vlanID int) string {
	vp.mu.RLock()
	defer vp.mu.RUnlock()
	for _, pool := range vp.pools {
		if vlanID >= pool.Start && vlanID <= pool.End {
			return pool.Name
		}
	}
	return "unknown"
}

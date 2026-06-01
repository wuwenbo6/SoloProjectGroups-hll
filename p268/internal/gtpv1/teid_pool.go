package gtpv1

import (
	"fmt"
	"sync"
)

type TEIDPool struct {
	mu           sync.RWMutex
	nextTEID     uint32
	teidToPDP    map[uint32]string
	pdpToTEID    map[string]uint32
	freeTEIDs    []uint32
	teidType     string
	startTEID    uint32
}

func NewTEIDPool(teidType string, startTEID uint32) *TEIDPool {
	return &TEIDPool{
		nextTEID:  startTEID,
		teidToPDP: make(map[uint32]string),
		pdpToTEID: make(map[string]uint32),
		freeTEIDs: make([]uint32, 0),
		teidType:  teidType,
		startTEID: startTEID,
	}
}

func (p *TEIDPool) Allocate(pdpID string) (uint32, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if _, exists := p.pdpToTEID[pdpID]; exists {
		return 0, fmt.Errorf("TEID already allocated for PDP %s", pdpID)
	}

	var teid uint32
	if len(p.freeTEIDs) > 0 {
		teid = p.freeTEIDs[len(p.freeTEIDs)-1]
		p.freeTEIDs = p.freeTEIDs[:len(p.freeTEIDs)-1]
	} else {
		teid = p.nextTEID
		p.nextTEID++
		if p.nextTEID == 0 {
			p.nextTEID = p.startTEID
		}
	}

	p.teidToPDP[teid] = pdpID
	p.pdpToTEID[pdpID] = teid

	return teid, nil
}

func (p *TEIDPool) Release(pdpID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	teid, exists := p.pdpToTEID[pdpID]
	if !exists {
		return fmt.Errorf("no TEID found for PDP %s", pdpID)
	}

	delete(p.pdpToTEID, pdpID)
	delete(p.teidToPDP, teid)

	p.freeTEIDs = append(p.freeTEIDs, teid)

	return nil
}

func (p *TEIDPool) GetTEID(pdpID string) (uint32, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	teid, exists := p.pdpToTEID[pdpID]
	return teid, exists
}

func (p *TEIDPool) GetPDP(teid uint32) (string, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	pdpID, exists := p.teidToPDP[teid]
	return pdpID, exists
}

func (p *TEIDPool) Size() int {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return len(p.pdpToTEID)
}

func (p *TEIDPool) FreeCount() int {
	p.mu.RLock()
	defer p.mu.RUnlock()

	return len(p.freeTEIDs)
}

func (p *TEIDPool) GetAllMappings() map[string]uint32 {
	p.mu.RLock()
	defer p.mu.RUnlock()

	mappings := make(map[string]uint32, len(p.pdpToTEID))
	for k, v := range p.pdpToTEID {
		mappings[k] = v
	}
	return mappings
}

func (p *TEIDPool) Reset() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.nextTEID = p.startTEID
	p.teidToPDP = make(map[uint32]string)
	p.pdpToTEID = make(map[string]uint32)
	p.freeTEIDs = make([]uint32, 0)
}

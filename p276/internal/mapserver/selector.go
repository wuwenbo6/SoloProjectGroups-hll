package mapserver

import (
	"math/rand"
	"sort"
	"sync"

	"github.com/lisp-mapserver/internal/lisp"
)

type RLOCSelector struct {
	mu     sync.Mutex
	states map[string]*wrrState
}

type wrrState struct {
	currentWeights []int
	lastIndex     int
}

func NewRLOCSelector() *RLOCSelector {
	return &RLOCSelector{
		states: make(map[string]*wrrState),
	}
}

func (s *RLOCSelector) Select(rlocs []lisp.RLOC, key string) *lisp.RLOC {
	if len(rlocs) == 0 {
		return nil
	}

	if len(rlocs) == 1 {
		return &rlocs[0]
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	highestPriority := findMinPriority(rlocs)
	candidates := filterByPriority(rlocs, highestPriority)

	if len(candidates) == 1 {
		return &candidates[0]
	}

	return s.weightedRoundRobin(candidates, key)
}

func (s *RLOCSelector) weightedRoundRobin(rlocs []lisp.RLOC, key string) *lisp.RLOC {
	state, exists := s.states[key]
	if !exists || len(state.currentWeights) != len(rlocs) {
		weights := make([]int, len(rlocs))
		for i, r := range rlocs {
			weights[i] = int(r.Weight)
			if weights[i] == 0 {
				weights[i] = 1
			}
		}
		state = &wrrState{
			currentWeights: make([]int, len(rlocs)),
			lastIndex:      -1,
		}
		copy(state.currentWeights, weights)
		s.states[key] = state
	}

	totalWeight := 0
	for _, r := range rlocs {
		w := int(r.Weight)
		if w == 0 {
			w = 1
		}
		totalWeight += w
	}

	for i := range state.currentWeights {
		state.currentWeights[i] += int(rlocs[i].Weight)
		if rlocs[i].Weight == 0 {
			state.currentWeights[i] += 1
		}
	}

	maxIdx := 0
	for i := 1; i < len(state.currentWeights); i++ {
		if state.currentWeights[i] > state.currentWeights[maxIdx] {
			maxIdx = i
		}
	}

	state.currentWeights[maxIdx] -= totalWeight

	return &rlocs[maxIdx]
}

func (s *RLOCSelector) Reset(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.states, key)
}

func findMinPriority(rlocs []lisp.RLOC) uint8 {
	if len(rlocs) == 0 {
		return 255
	}
	minP := rlocs[0].Priority
	for _, r := range rlocs[1:] {
		if r.Priority < minP {
			minP = r.Priority
		}
	}
	return minP
}

func filterByPriority(rlocs []lisp.RLOC, priority uint8) []lisp.RLOC {
	result := make([]lisp.RLOC, 0)
	for _, r := range rlocs {
		if r.Priority == priority {
			result = append(result, r)
		}
	}
	return result
}

func SelectRLOCByRoundRobin(rlocs []lisp.RLOC, key string, counter *int) *lisp.RLOC {
	if len(rlocs) == 0 {
		return nil
	}

	groups := groupByPriority(rlocs)

	priorities := make([]uint8, 0, len(groups))
	for p := range groups {
		priorities = append(priorities, p)
	}
	sort.Slice(priorities, func(i, j int) bool {
		return priorities[i] < priorities[j]
	})

	highestGroup := groups[priorities[0]]
	if len(highestGroup) == 1 {
		return &highestGroup[0]
	}

	totalWeight := 0
	for _, r := range highestGroup {
		if r.Weight > 0 {
			totalWeight += int(r.Weight)
		}
	}

	if totalWeight == 0 {
		idx := *counter % len(highestGroup)
		*counter++
		return &highestGroup[idx]
	}

	remaining := *counter % totalWeight
	*counter++

	cumWeight := 0
	for i := range highestGroup {
		w := int(highestGroup[i].Weight)
		if w == 0 {
			continue
		}
		cumWeight += w
		if remaining < cumWeight {
			return &highestGroup[i]
		}
	}

	return &highestGroup[0]
}

func groupByPriority(rlocs []lisp.RLOC) map[uint8][]lisp.RLOC {
	groups := make(map[uint8][]lisp.RLOC)
	for _, r := range rlocs {
		groups[r.Priority] = append(groups[r.Priority], r)
	}
	return groups
}

func SelectRLOCRandomWeighted(rlocs []lisp.RLOC) *lisp.RLOC {
	if len(rlocs) == 0 {
		return nil
	}

	groups := groupByPriority(rlocs)
	priorities := make([]uint8, 0, len(groups))
	for p := range groups {
		priorities = append(priorities, p)
	}
	sort.Slice(priorities, func(i, j int) bool {
		return priorities[i] < priorities[j]
	})

	highestGroup := groups[priorities[0]]
	if len(highestGroup) == 1 {
		return &highestGroup[0]
	}

	totalWeight := 0
	for _, r := range highestGroup {
		if r.Weight > 0 {
			totalWeight += int(r.Weight)
		}
	}

	if totalWeight == 0 {
		return &highestGroup[0]
	}

	randVal := rand.Intn(totalWeight)
	cumWeight := 0
	for i := range highestGroup {
		w := int(highestGroup[i].Weight)
		if w == 0 {
			continue
		}
		cumWeight += w
		if randVal < cumWeight {
			return &highestGroup[i]
		}
	}

	return &highestGroup[0]
}

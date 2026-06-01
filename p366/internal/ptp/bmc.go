package ptp

import (
	"sync"
	"time"
)

type BMCA struct {
	mu sync.RWMutex
}

func NewBMCA() *BMCA {
	return &BMCA{}
}

func (b *BMCA) Compare(dsA, dsB *ClockDataSource) BMCComparisonResult {
	if dsA.Priority1 != dsB.Priority1 {
		if dsA.Priority1 < dsB.Priority1 {
			return BMCBetter
		}
		return BMCWorse
	}

	qual := b.compareClockQuality(dsA.ClockQuality, dsB.ClockQuality)
	if qual != BMCEqual {
		return qual
	}

	if dsA.Priority2 != dsB.Priority2 {
		if dsA.Priority2 < dsB.Priority2 {
			return BMCWorse
		}
		return BMCBetter
	}

	if dsA.GMIdentity != dsB.GMIdentity {
		if dsA.GMIdentity < dsB.GMIdentity {
			return BMCBetter
		}
		return BMCWorse
	}

	if dsA.StepsRemoved != dsB.StepsRemoved {
		if dsA.StepsRemoved < dsB.StepsRemoved {
			return BMCBetter
		}
		return BMCWorse
	}

	return BMCEqual
}

func (b *BMCA) compareClockQuality(qa, qb ClockQuality) BMCComparisonResult {
	if qa.ClockClass != qb.ClockClass {
		if qa.ClockClass < qb.ClockClass {
			return BMCBetter
		}
		return BMCWorse
	}

	if qa.ClockAccuracy != qb.ClockAccuracy {
		if qa.ClockAccuracy < qb.ClockAccuracy {
			return BMCBetter
		}
		return BMCWorse
	}

	if qa.OffsetScaledLogVariance != qb.OffsetScaledLogVariance {
		if qa.OffsetScaledLogVariance < qb.OffsetScaledLogVariance {
			return BMCBetter
		}
		return BMCWorse
	}

	return BMCEqual
}

func NewPTPNode(portID uint16, clock *Clock, priority1, priority2 uint8, quality ClockQuality) *PTPNode {
	clockID := ClockIdentity(uint64(time.Now().UnixNano()) + uint64(portID)*1000000)
	return &PTPNode{
		ClockIdentity: clockID,
		PortID:        portID,
		State:         NodeStateInitializing,
		Clock:         clock,
		ClockQuality:  quality,
		Priority1:     priority1,
		Priority2:     priority2,
		StepsRemoved:  0,
		Neighbors:     make(map[uint16]*Neighbor),
	}
}

func (n *PTPNode) GetClockDataSource() *ClockDataSource {
	n.mu.RLock()
	defer n.mu.RUnlock()

	return &ClockDataSource{
		PortIdentity: PortIdentity{
			ClockIdentity: n.ClockIdentity,
			PortNumber:    n.PortID,
		},
		GMIdentity:          n.ParentIdentity,
		ClockQuality:        n.ClockQuality,
		Priority1:           n.Priority1,
		Priority2:           n.Priority2,
		StepsRemoved:        n.StepsRemoved,
		TimeSource:          0x20,
	}
}

func (n *PTPNode) AddOrUpdateNeighbor(portID uint16, clockIdentity ClockIdentity,
	quality ClockQuality, priority1, priority2 uint8, stepsRemoved uint16) {
	n.mu.Lock()
	defer n.mu.Unlock()

	neighbor, exists := n.Neighbors[portID]
	if !exists {
		neighbor = &Neighbor{
			PortID:        portID,
			ClockIdentity: clockIdentity,
			IsActive:      true,
		}
		n.Neighbors[portID] = neighbor
	}

	neighbor.ClockIdentity = clockIdentity
	neighbor.ClockQuality = quality
	neighbor.Priority1 = priority1
	neighbor.Priority2 = priority2
	neighbor.StepsRemoved = stepsRemoved
	neighbor.LastAnnounceTime = time.Now()
	neighbor.IsActive = true
}

func (n *PTPNode) UpdateNeighborMetrics(portID uint16, pathDelay, syncError int64, rateRatio float64) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if neighbor, exists := n.Neighbors[portID]; exists {
		neighbor.PathDelay = pathDelay
		neighbor.LastSyncError = syncError
		neighbor.RateRatio = rateRatio
		if neighbor.AvgSyncError == 0 {
			neighbor.AvgSyncError = syncError
		} else {
			neighbor.AvgSyncError = int64(0.9*float64(neighbor.AvgSyncError) + 0.1*float64(syncError))
		}
	}
}

func (n *PTPNode) RemoveNeighbor(portID uint16) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if neighbor, exists := n.Neighbors[portID]; exists {
		neighbor.IsActive = false
	}
}

func (n *PTPNode) GetActiveNeighbors() []*Neighbor {
	n.mu.RLock()
	defer n.mu.RUnlock()

	result := make([]*Neighbor, 0, len(n.Neighbors))
	for _, neighbor := range n.Neighbors {
		if neighbor.IsActive && time.Since(neighbor.LastAnnounceTime) < 3*time.Second {
			result = append(result, neighbor)
		} else {
			neighbor.IsActive = false
		}
	}
	return result
}

func (n *PTPNode) CleanupInactiveNeighbors(timeout time.Duration) {
	n.mu.Lock()
	defer n.mu.Unlock()

	for portID, neighbor := range n.Neighbors {
		if time.Since(neighbor.LastAnnounceTime) > timeout {
			neighbor.IsActive = false
			delete(n.Neighbors, portID)
		}
	}
}

func (n *PTPNode) GetState() NodeState {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.State
}

func (n *PTPNode) SetState(state NodeState) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.State = state
}

func (n *PTPNode) SetMasterPriority(ds *ClockDataSource) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.MasterPriority = *ds
}

func (n *PTPNode) GetMasterPriority() ClockDataSource {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.MasterPriority
}

func (n *PTPNode) GetNeighbor(portID uint16) (*Neighbor, bool) {
	n.mu.RLock()
	defer n.mu.RUnlock()
	neighbor, exists := n.Neighbors[portID]
	return neighbor, exists
}

func NodeStateToString(state NodeState) string {
	switch state {
	case NodeStateInitializing:
		return "INITIALIZING"
	case NodeStateSlave:
		return "SLAVE"
	case NodeStateMaster:
		return "MASTER"
	case NodeStatePassive:
		return "PASSIVE"
	case NodeStateFaulty:
		return "FAULTY"
	default:
		return "UNKNOWN"
	}
}

func (n *PTPNode) CreateAnnounceMessage() *PTPMessage {
	n.mu.RLock()
	defer n.mu.RUnlock()

	return &PTPMessage{
		MsgType:         MsgAnnounce,
		SourcePortID:    n.PortID,
		Timestamp:       n.Clock.Now(),
	}
}

func (n *PTPNode) ProcessAnnounce(msg *PTPMessage, remoteDS *ClockDataSource) BMCComparisonResult {
	localDS := n.GetClockDataSource()

	bmca := NewBMCA()
	result := bmca.Compare(remoteDS, localDS)

	n.AddOrUpdateNeighbor(
		msg.SourcePortID,
		remoteDS.PortIdentity.ClockIdentity,
		remoteDS.ClockQuality,
		remoteDS.Priority1,
		remoteDS.Priority2,
		remoteDS.StepsRemoved,
	)

	return result
}

func (n *PTPNode) ElectBestMaster() (*Neighbor, *ClockDataSource) {
	neighbors := n.GetActiveNeighbors()
	if len(neighbors) == 0 {
		return nil, n.GetClockDataSource()
	}

	bmca := NewBMCA()
	var best *Neighbor
	var bestDS *ClockDataSource

	for _, neighbor := range neighbors {
		remoteDS := &ClockDataSource{
			PortIdentity: PortIdentity{
				ClockIdentity: neighbor.ClockIdentity,
				PortNumber:    neighbor.PortID,
			},
			GMIdentity:    neighbor.ClockIdentity,
			ClockQuality:  neighbor.ClockQuality,
			Priority1:     neighbor.Priority1,
			Priority2:     neighbor.Priority2,
			StepsRemoved:  neighbor.StepsRemoved + 1,
			TimeSource:    0x20,
		}

		if bestDS == nil {
			best = neighbor
			bestDS = remoteDS
			continue
		}

		if bmca.Compare(remoteDS, bestDS) == BMCBetter {
			best = neighbor
			bestDS = remoteDS
		}
	}

	localDS := n.GetClockDataSource()
	if bmca.Compare(localDS, bestDS) == BMCBetter {
		return nil, localDS
	}

	return best, bestDS
}

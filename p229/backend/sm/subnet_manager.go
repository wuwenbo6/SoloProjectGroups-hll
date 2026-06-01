package sm

import (
	"container/heap"
	"fmt"
	"math"
	"sync"
	"time"

	"ib-subnet-manager/model"
	"ib-subnet-manager/routing"
)

type SubnetManager struct {
	sync.RWMutex
	nodes            map[model.GUID]*model.Node
	links            []*model.Link
	lidAllocator     *LIDAllocator
	routeTables      map[model.GUID]*model.RouteTable
	smLID            model.LID
	isMaster         bool
	topology         *model.SubnetTopology
	adaptiveRouter   *routing.AdaptiveRouter
	adaptiveRouting  bool
	opensmConfig     *model.OpenSMConfig
}

type LIDAllocator struct {
	nextLID model.LID
	used    map[model.LID]bool
	mu      sync.Mutex
}

func NewLIDAllocator() *LIDAllocator {
	return &LIDAllocator{
		nextLID: 1,
		used:    make(map[model.LID]bool),
	}
}

func (la *LIDAllocator) Allocate() model.LID {
	la.mu.Lock()
	defer la.mu.Unlock()
	for la.used[la.nextLID] {
		la.nextLID++
		if la.nextLID > 0xFFFE {
			la.nextLID = 1
		}
	}
	lid := la.nextLID
	la.used[lid] = true
	la.nextLID++
	return lid
}

func (la *LIDAllocator) Release(lid model.LID) {
	la.mu.Lock()
	defer la.mu.Unlock()
	delete(la.used, lid)
}

func NewSubnetManager() *SubnetManager {
	sm := &SubnetManager{
		nodes:        make(map[model.GUID]*model.Node),
		links:        make([]*model.Link, 0),
		lidAllocator: NewLIDAllocator(),
		routeTables:  make(map[model.GUID]*model.RouteTable),
		isMaster:     true,
		adaptiveRouting: false,
		opensmConfig: &model.OpenSMConfig{
			Priority:       0,
			RoutingEngine:  "minhop",
			AdaptiveRouting: model.AdaptiveRoutingConfig{
				Enabled:             false,
				CongestionThreshold: 0.7,
				MinPathDifference:   1,
				RebalanceInterval:   30,
				MaxPathChanges:      10,
				UseFCN:              true,
				UseVL15:             false,
			},
			LMC:            0,
			MTU:            4096,
			VLCount:        8,
			SL2VLMap:       make([]int, 16),
			QOSLevels:      []model.QOSLevel{},
			PartitionKeys:  []uint16{0x7fff, 0x0001},
			SAEnabled:      true,
			PerfMgrEnabled: true,
			EventPlugin:    "",
			LogLevel:       "info",
		},
	}
	sm.smLID = sm.lidAllocator.Allocate()
	sm.adaptiveRouter = routing.NewAdaptiveRouter(sm.opensmConfig.AdaptiveRouting)
	return sm
}

func (sm *SubnetManager) SetAdaptiveRouting(enabled bool) {
	sm.Lock()
	defer sm.Unlock()

	sm.adaptiveRouting = enabled
	sm.opensmConfig.AdaptiveRouting.Enabled = enabled
	if enabled {
		sm.opensmConfig.RoutingEngine = "adaptive"
	} else {
		sm.opensmConfig.RoutingEngine = "minhop"
	}
}

func (sm *SubnetManager) GetAdaptiveRouter() *routing.AdaptiveRouter {
	return sm.adaptiveRouter
}

func (sm *SubnetManager) GetCongestionSummary() map[model.GUID]map[int]model.CongestionStats {
	sm.RLock()
	defer sm.RUnlock()

	topology := &model.Topology{Nodes: sm.nodes}
	return sm.adaptiveRouter.GetCongestionSummary(topology)
}

func (sm *SubnetManager) RebalanceRoutes() int {
	sm.Lock()
	defer sm.Unlock()

	topology := &model.Topology{Nodes: sm.nodes}
	return sm.adaptiveRouter.RebalanceRoutes(topology, sm.routeTables)
}

func (sm *SubnetManager) UpdateCongestionStats() {
	sm.Lock()
	defer sm.Unlock()

	topology := &model.Topology{Nodes: sm.nodes}
	sm.adaptiveRouter.UpdateCongestionStats(topology)
}

func (sm *SubnetManager) GetOpenSMConfig() *model.OpenSMConfig {
	sm.RLock()
	defer sm.RUnlock()

	return sm.opensmConfig
}

func (sm *SubnetManager) GetSimpleTopology() *model.Topology {
	sm.RLock()
	defer sm.RUnlock()

	return &model.Topology{Nodes: sm.nodes}
}

func (sm *SubnetManager) AddNode(node *model.Node) error {
	sm.Lock()
	defer sm.Unlock()

	if _, exists := sm.nodes[node.GUID]; exists {
		return fmt.Errorf("node with GUID %x already exists", node.GUID)
	}

	node.LID = sm.lidAllocator.Allocate()
	if node.Ports == nil {
		node.Ports = make(map[int]*model.Port)
	}
	for i := 1; i <= node.NumPorts; i++ {
		if _, exists := node.Ports[i]; !exists {
			node.Ports[i] = &model.Port{
				PortNum:         i,
				State:           model.PortStateDown,
				LastChange:      time.Now(),
				TrainingState:   model.LTStateIdle,
				TrainingProgress: 0,
				LFTConfigured:   false,
				Counters: model.PortCounters{
					LastUpdate: time.Now(),
				},
			}
		}
	}

	sm.nodes[node.GUID] = node
	sm.UpdateTopology()
	return nil
}

func (sm *SubnetManager) RemoveNode(guid model.GUID) error {
	sm.Lock()
	defer sm.Unlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return fmt.Errorf("node with GUID %x not found", guid)
	}

	sm.lidAllocator.Release(node.LID)
	delete(sm.nodes, guid)
	delete(sm.routeTables, guid)

	sm.links = sm.links[:0]
	for _, n := range sm.nodes {
		for portNum, port := range n.Ports {
			if port.NeighborGUID == guid {
				port.NeighborGUID = 0
				port.NeighborPort = 0
				port.State = model.PortStateDown
				n.Ports[portNum] = port
			}
		}
	}
	sm.discoverLinks()
	sm.UpdateTopology()
	return nil
}

func (sm *SubnetManager) ConnectNodes(fromGUID model.GUID, fromPort int, toGUID model.GUID, toPort int) error {
	sm.Lock()
	defer sm.Unlock()

	fromNode, exists := sm.nodes[fromGUID]
	if !exists {
		return fmt.Errorf("source node %x not found", fromGUID)
	}
	toNode, exists := sm.nodes[toGUID]
	if !exists {
		return fmt.Errorf("destination node %x not found", toGUID)
	}

	if fromPort < 1 || fromPort > fromNode.NumPorts {
		return fmt.Errorf("invalid port %d on source node", fromPort)
	}
	if toPort < 1 || toPort > toNode.NumPorts {
		return fmt.Errorf("invalid port %d on destination node", toPort)
	}

	fromNode.Ports[fromPort].NeighborGUID = toGUID
	fromNode.Ports[fromPort].NeighborPort = toPort
	fromNode.Ports[fromPort].State = model.PortStateInit
	fromNode.Ports[fromPort].TrainingState = model.LTStatePolling
	fromNode.Ports[fromPort].TrainingProgress = 0
	fromNode.Ports[fromPort].LinkWidth = "4x"
	fromNode.Ports[fromPort].LinkSpeed = "EDR"
	fromNode.Ports[fromPort].Rate = 100
	fromNode.Ports[fromPort].LastChange = time.Now()

	toNode.Ports[toPort].NeighborGUID = fromGUID
	toNode.Ports[toPort].NeighborPort = fromPort
	toNode.Ports[toPort].State = model.PortStateInit
	toNode.Ports[toPort].TrainingState = model.LTStatePolling
	toNode.Ports[toPort].TrainingProgress = 0
	toNode.Ports[toPort].LinkWidth = "4x"
	toNode.Ports[toPort].LinkSpeed = "EDR"
	toNode.Ports[toPort].Rate = 100
	toNode.Ports[toPort].LastChange = time.Now()

	sm.discoverLinks()
	sm.UpdateTopology()
	return nil
}

func (sm *SubnetManager) discoverLinks() {
	sm.links = make([]*model.Link, 0)
	seen := make(map[string]bool)

	for guid, node := range sm.nodes {
		for portNum, port := range node.Ports {
			if port.NeighborGUID != 0 && port.State == model.PortStateActive {
				key := fmt.Sprintf("%x:%d-%x:%d", guid, portNum, port.NeighborGUID, port.NeighborPort)
				reverseKey := fmt.Sprintf("%x:%d-%x:%d", port.NeighborGUID, port.NeighborPort, guid, portNum)
				if !seen[key] && !seen[reverseKey] {
					sm.links = append(sm.links, &model.Link{
						FromGUID:  guid,
						FromPort:  portNum,
						ToGUID:    port.NeighborGUID,
						ToPort:    port.NeighborPort,
						Active:    true,
						Bandwidth: 100,
					})
					seen[key] = true
				}
			}
		}
	}
}

func (sm *SubnetManager) UpdateTopology() {
	sm.topology = &model.SubnetTopology{
		Nodes:     make(map[model.GUID]*model.Node),
		Links:     sm.links,
		Timestamp: time.Now(),
	}
	for guid, node := range sm.nodes {
		sm.topology.Nodes[guid] = node
	}
}

func (sm *SubnetManager) GetTopology() *model.SubnetTopology {
	sm.RLock()
	defer sm.RUnlock()
	return sm.topology
}

func (sm *SubnetManager) GetNode(guid model.GUID) (*model.Node, bool) {
	sm.RLock()
	defer sm.RUnlock()
	node, exists := sm.nodes[guid]
	return node, exists
}

func (sm *SubnetManager) GetAllNodes() map[model.GUID]*model.Node {
	sm.RLock()
	defer sm.RUnlock()
	nodes := make(map[model.GUID]*model.Node)
	for guid, node := range sm.nodes {
		nodes[guid] = node
	}
	return nodes
}

func (sm *SubnetManager) GetAllSwitches() []model.GUID {
	sm.RLock()
	defer sm.RUnlock()
	var switches []model.GUID
	for guid, node := range sm.nodes {
		if node.NodeType == model.NodeTypeSwitch {
			switches = append(switches, guid)
		}
	}
	return switches
}

func (sm *SubnetManager) ComputeRoutes() error {
	sm.Lock()
	defer sm.Unlock()

	sm.routeTables = make(map[model.GUID]*model.RouteTable)
	for guid, node := range sm.nodes {
		if node.NodeType == model.NodeTypeSwitch {
			sm.routeTables[guid] = &model.RouteTable{
				SwitchGUID: guid,
				Entries:    make(map[model.LID]*model.DLIDMapping),
			}
		}
	}

	for srcGUID := range sm.nodes {
		for dstGUID, dstNode := range sm.nodes {
			if srcGUID == dstGUID {
				continue
			}
			path, err := sm.computeShortestPath(srcGUID, dstGUID)
			if err != nil {
				continue
			}
			sm.propagateRoute(path, dstNode.LID)
		}
	}

	return nil
}

type PathItem struct {
	guid     model.GUID
	port     int
	distance int
}

type PriorityQueue []*PathItem

func (pq PriorityQueue) Len() int { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].distance < pq[j].distance }
func (pq PriorityQueue) Swap(i, j int) { pq[i], pq[j] = pq[j], pq[i] }

func (pq *PriorityQueue) Push(x interface{}) {
	item := x.(*PathItem)
	*pq = append(*pq, item)
}

func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	*pq = old[0 : n-1]
	return item
}

func (sm *SubnetManager) computeShortestPath(srcGUID, dstGUID model.GUID) ([]model.GUID, error) {
	distances := make(map[model.GUID]int)
	previous := make(map[model.GUID]model.GUID)
	arrivalPort := make(map[model.GUID]int)

	for guid := range sm.nodes {
		distances[guid] = math.MaxInt32
		previous[guid] = 0
	}
	distances[srcGUID] = 0

	pq := &PriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &PathItem{guid: srcGUID, distance: 0})

	for pq.Len() > 0 {
		current := heap.Pop(pq).(*PathItem)
		currentGUID := current.guid

		if currentGUID == dstGUID {
			break
		}

		if current.distance > distances[currentGUID] {
			continue
		}

		currentNode := sm.nodes[currentGUID]
		for _, port := range currentNode.Ports {
			if port.State != model.PortStateActive || port.NeighborGUID == 0 {
				continue
			}

			neighborGUID := port.NeighborGUID
			newDist := distances[currentGUID] + 1

			if newDist < distances[neighborGUID] {
				distances[neighborGUID] = newDist
				previous[neighborGUID] = currentGUID
				arrivalPort[neighborGUID] = port.NeighborPort
				heap.Push(pq, &PathItem{guid: neighborGUID, distance: newDist})
			}
		}
	}

	if distances[dstGUID] == math.MaxInt32 {
		return nil, fmt.Errorf("no path from %x to %x", srcGUID, dstGUID)
	}

	var path []model.GUID
	for current := dstGUID; current != 0; current = previous[current] {
		path = append([]model.GUID{current}, path...)
	}

	return path, nil
}

func (sm *SubnetManager) propagateRoute(path []model.GUID, dlid model.LID) {
	if len(path) < 2 {
		return
	}

	for i := 0; i < len(path)-1; i++ {
		currentGUID := path[i]
		nextGUID := path[i+1]

		currentNode := sm.nodes[currentGUID]
		if currentNode.NodeType != model.NodeTypeSwitch {
			continue
		}

		rt, exists := sm.routeTables[currentGUID]
		if !exists {
			continue
		}

		var outPort int
		for portNum, port := range currentNode.Ports {
			if port.NeighborGUID == nextGUID {
				outPort = portNum
				break
			}
		}

		if outPort > 0 {
			rt.Entries[dlid] = &model.DLIDMapping{
				DLID:     dlid,
				OutPort:  outPort,
				Path:     sm.guidPathToLIDPath(path),
				HopCount: len(path) - 1,
			}
		}
	}
}

func (sm *SubnetManager) guidPathToLIDPath(guidPath []model.GUID) []model.LID {
	lidPath := make([]model.LID, len(guidPath))
	for i, guid := range guidPath {
		lidPath[i] = sm.nodes[guid].LID
	}
	return lidPath
}

func (sm *SubnetManager) GetRouteTable(switchGUID model.GUID) (*model.RouteTable, bool) {
	sm.RLock()
	defer sm.RUnlock()
	rt, exists := sm.routeTables[switchGUID]
	return rt, exists
}

func (sm *SubnetManager) GetAllRouteTables() map[model.GUID]*model.RouteTable {
	sm.RLock()
	defer sm.RUnlock()
	tables := make(map[model.GUID]*model.RouteTable)
	for guid, rt := range sm.routeTables {
		tables[guid] = rt
	}
	return tables
}

func (sm *SubnetManager) GetNodeInfo(guid model.GUID) (*model.NodeInfo, error) {
	sm.RLock()
	defer sm.RUnlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return nil, fmt.Errorf("node %x not found", guid)
	}

	return &model.NodeInfo{
		GUID:            node.GUID,
		NodeType:        node.NodeType,
		Name:            node.Name,
		LID:             node.LID,
		NumPorts:        node.NumPorts,
		SystemImageGUID: node.SystemImageGUID,
		VendorID:        node.VendorID,
		DeviceID:        node.DeviceID,
		Revision:        node.Revision,
	}, nil
}

func (sm *SubnetManager) GetPortInfo(guid model.GUID, portNum int) (*model.PortInfo, error) {
	sm.RLock()
	defer sm.RUnlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return nil, fmt.Errorf("node %x not found", guid)
	}

	port, exists := node.Ports[portNum]
	if !exists {
		return nil, fmt.Errorf("port %d not found on node %x", portNum, guid)
	}

	return &model.PortInfo{
		PortNum:       port.PortNum,
		State:         port.State,
		PhysicalState: port.PhysicalState,
		LinkWidth:     port.LinkWidth,
		LinkSpeed:     port.LinkSpeed,
		LID:           node.LID,
		MasterSM_LID:  sm.smLID,
	}, nil
}

func (sm *SubnetManager) SimulateTraffic() {
	sm.Lock()
	defer sm.Unlock()

	for _, node := range sm.nodes {
		for _, port := range node.Ports {
			if port.State == model.PortStateActive {
				port.Counters.XmtData += uint64(time.Now().UnixNano() % 1000000)
				port.Counters.RcvData += uint64(time.Now().UnixNano() % 1000000)
				port.Counters.XmtPkts += uint64(time.Now().UnixNano() % 1000)
				port.Counters.RcvPkts += uint64(time.Now().UnixNano() % 1000)
				port.Counters.LastUpdate = time.Now()
			}
		}
	}
}

func (sm *SubnetManager) SetLFTBlock(guid model.GUID, blockNum int, lftBlock []byte) error {
	sm.Lock()
	defer sm.Unlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return fmt.Errorf("node %x not found", guid)
	}

	if node.NodeType != model.NodeTypeSwitch {
		return fmt.Errorf("node %x is not a switch", guid)
	}

	rt, exists := sm.routeTables[guid]
	if !exists {
		rt = &model.RouteTable{
			SwitchGUID: guid,
			Entries:    make(map[model.LID]*model.DLIDMapping),
		}
		sm.routeTables[guid] = rt
	}

	baseLID := blockNum * 64
	for i := 0; i < 64 && i < len(lftBlock); i++ {
		lid := model.LID(baseLID + i)
		outPort := int(lftBlock[i])
		if outPort > 0 {
			rt.Entries[lid] = &model.DLIDMapping{
				DLID:    lid,
				OutPort: outPort,
			}
		}
	}

	if port, ok := node.Ports[1]; ok {
		port.LFTConfigured = true
		port.LFTConfigBlock = blockNum
	}

	return nil
}

func (sm *SubnetManager) AdvanceLinkTraining(guid model.GUID, portNum int) error {
	sm.Lock()
	defer sm.Unlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return fmt.Errorf("node %x not found", guid)
	}

	port, exists := node.Ports[portNum]
	if !exists {
		return fmt.Errorf("port %d not found", portNum)
	}

	states := []model.LinkTrainingState{
		model.LTStateIdle,
		model.LTStatePolling,
		model.LTStateConfiguration,
		model.LTStateTraining,
		model.LTStateBringUp,
		model.LTStateOperational,
	}

	currentIdx := 0
	for i, s := range states {
		if s == port.TrainingState {
			currentIdx = i
			break
		}
	}

	if currentIdx < len(states)-1 {
		port.TrainingState = states[currentIdx+1]
		port.TrainingProgress = (currentIdx + 1) * 20

		if port.TrainingState == model.LTStateOperational {
			port.State = model.PortStateActive
			port.PhysicalState = "LinkUp"
			port.TrainingProgress = 100
		}

		if port.NeighborGUID != 0 {
			if neighborNode, ok := sm.nodes[port.NeighborGUID]; ok {
				if neighborPort, ok := neighborNode.Ports[port.NeighborPort]; ok {
					neighborPort.TrainingState = port.TrainingState
					neighborPort.TrainingProgress = port.TrainingProgress
					if neighborPort.TrainingState == model.LTStateOperational {
						neighborPort.State = model.PortStateActive
						neighborPort.PhysicalState = "LinkUp"
					}
				}
			}
		}
	}

	port.LastChange = time.Now()
	return nil
}

func (sm *SubnetManager) StartLinkTraining(guid model.GUID, portNum int) error {
	sm.Lock()
	defer sm.Unlock()

	node, exists := sm.nodes[guid]
	if !exists {
		return fmt.Errorf("node %x not found", guid)
	}

	port, exists := node.Ports[portNum]
	if !exists {
		return fmt.Errorf("port %d not found", portNum)
	}

	port.TrainingState = model.LTStatePolling
	port.TrainingProgress = 0
	port.State = model.PortStateInit
	port.LastChange = time.Now()

	return nil
}

func (sm *SubnetManager) GetLFTDistributionStatus() map[model.GUID]map[int]bool {
	sm.RLock()
	defer sm.RUnlock()

	status := make(map[model.GUID]map[int]bool)
	for guid, node := range sm.nodes {
		if node.NodeType != model.NodeTypeSwitch {
			continue
		}
		status[guid] = make(map[int]bool)
		rt, ok := sm.routeTables[guid]
		if !ok {
			continue
		}
		for lid := range rt.Entries {
			blockNum := int(lid) / 64
			status[guid][blockNum] = true
		}
	}
	return status
}

package routing

import (
	"fmt"
	"math/rand"
	"time"

	"ib-subnet-manager/model"
)

type AdaptiveRouter struct {
	config       model.AdaptiveRoutingConfig
	pathCache    map[model.GUID]map[model.GUID][][]model.GUID
	rebalanceTicker *time.Ticker
}

func NewAdaptiveRouter(config model.AdaptiveRoutingConfig) *AdaptiveRouter {
	return &AdaptiveRouter{
		config:    config,
		pathCache: make(map[model.GUID]map[model.GUID][][]model.GUID),
	}
}

func (ar *AdaptiveRouter) FindAllPaths(topology *model.Topology, srcGUID, dstGUID model.GUID, maxPaths int) [][]model.GUID {
	var paths [][]model.GUID
	visited := make(map[model.GUID]bool)
	currentPath := []model.GUID{srcGUID}

	ar.dfs(topology, srcGUID, dstGUID, visited, currentPath, &paths, maxPaths)

	ar.pathCache[srcGUID] = make(map[model.GUID][][]model.GUID)
	ar.pathCache[srcGUID][dstGUID] = paths

	return paths
}

func (ar *AdaptiveRouter) dfs(topology *model.Topology, current, dst model.GUID, visited map[model.GUID]bool, path []model.GUID, paths *[][]model.GUID, maxPaths int) {
	if len(*paths) >= maxPaths {
		return
	}

	if current == dst {
		pathCopy := make([]model.GUID, len(path))
		copy(pathCopy, path)
		*paths = append(*paths, pathCopy)
		return
	}

	visited[current] = true
	node := topology.Nodes[current]
	if node == nil {
		return
	}

	for _, port := range node.Ports {
		if port.NeighborGUID == 0 || visited[port.NeighborGUID] {
			continue
		}
		neighbor := topology.Nodes[port.NeighborGUID]
		if neighbor == nil {
			continue
		}
		path = append(path, port.NeighborGUID)
		ar.dfs(topology, port.NeighborGUID, dst, visited, path, paths, maxPaths)
		path = path[:len(path)-1]
	}
	delete(visited, current)
}

func (ar *AdaptiveRouter) SelectAdaptivePath(topology *model.Topology, switchGUID model.GUID, dstLID model.LID, paths [][]model.GUID) (int, error) {
	if len(paths) == 0 {
		return 0, fmt.Errorf("no paths available")
	}

	if !ar.config.Enabled {
		return ar.selectMinHopPath(paths), nil
	}

	bestPathIdx := 0
	bestScore := -1.0

	for i, path := range paths {
		score := ar.calculatePathScore(topology, path)
		if score > bestScore {
			bestScore = score
			bestPathIdx = i
		}
	}

	if len(paths) > 1 && rand.Float64() < 0.1 {
		bestPathIdx = rand.Intn(len(paths))
	}

	return bestPathIdx, nil
}

func (ar *AdaptiveRouter) selectMinHopPath(paths [][]model.GUID) int {
	minHops := len(paths[0])
	bestIdx := 0
	for i, path := range paths {
		if len(path) < minHops {
			minHops = len(path)
			bestIdx = i
		}
	}
	return bestIdx
}

func (ar *AdaptiveRouter) calculatePathScore(topology *model.Topology, path []model.GUID) float64 {
	score := 0.0
	pathLength := len(path)

	for i := 0; i < pathLength-1; i++ {
		nodeGUID := path[i]
		nextGUID := path[i+1]
		node := topology.Nodes[nodeGUID]
		if node == nil {
			continue
		}

		for _, port := range node.Ports {
			if port.NeighborGUID == nextGUID {
				congestion := port.Congestion.CongestionLevel
				utilization := port.Congestion.Utilization

				score += 1.0 - congestion*0.5 - utilization*0.3
				break
			}
		}
	}

	score /= float64(pathLength)
	score += (10.0 - float64(pathLength)) * 0.05

	return score
}

func (ar *AdaptiveRouter) RebalanceRoutes(topology *model.Topology, routeTables map[model.GUID]*model.RouteTable) int {
	changes := 0

	for switchGUID, rt := range routeTables {
		if changes >= ar.config.MaxPathChanges {
			break
		}

		switchNode := topology.Nodes[switchGUID]
		if switchNode == nil || switchNode.NodeType != model.NodeTypeSwitch {
			continue
		}

		for dstLID, mapping := range rt.Entries {
			if changes >= ar.config.MaxPathChanges {
				break
			}

			currentPort := switchNode.Ports[mapping.OutPort]
			if currentPort == nil {
				continue
			}

			if currentPort.Congestion.CongestionLevel < ar.config.CongestionThreshold {
				continue
			}

			dstNode := topology.Nodes[model.GUID(dstLID)]
			if dstNode == nil {
				continue
			}

			allPaths := ar.FindAllPaths(topology, switchGUID, model.GUID(dstLID), 5)
			if len(allPaths) <= 1 {
				continue
			}

			bestIdx, err := ar.SelectAdaptivePath(topology, switchGUID, dstLID, allPaths)
			if err != nil {
				continue
			}

			if len(allPaths[bestIdx]) < 2 {
				continue
			}

			nextHop := allPaths[bestIdx][1]
			outPort := ar.findPortForNeighbor(switchNode, nextHop)

			if outPort > 0 && outPort != mapping.OutPort {
				mapping.OutPort = outPort
				mapping.Path = make([]model.LID, len(allPaths[bestIdx]))
				for i, guid := range allPaths[bestIdx] {
					mapping.Path[i] = model.LID(guid)
				}
				mapping.HopCount = len(allPaths[bestIdx]) - 1
				changes++
			}
		}
	}

	return changes
}

func (ar *AdaptiveRouter) findPortForNeighbor(node *model.Node, neighborGUID model.GUID) int {
	for portNum, port := range node.Ports {
		if port.NeighborGUID == neighborGUID {
			return portNum
		}
	}
	return 0
}

func (ar *AdaptiveRouter) UpdateCongestionStats(topology *model.Topology) {
	for _, node := range topology.Nodes {
		for _, port := range node.Ports {
			if port.NeighborGUID == 0 {
				continue
			}

			port.Lock()

			port.Counters.XmtData += uint64(rand.Intn(10000000))
			port.Counters.RcvData += uint64(rand.Intn(10000000))
			port.Counters.XmtPkts += uint64(rand.Intn(1000))
			port.Counters.RcvPkts += uint64(rand.Intn(1000))

			port.Congestion.XmitWaitDepth = uint64(rand.Intn(100))
			port.Congestion.RcvWaitDepth = uint64(rand.Intn(50))
			port.Congestion.MarkedPkts += uint64(rand.Intn(50))
			port.Congestion.CongestionLevel = rand.Float64()
			port.Congestion.Utilization = rand.Float64()
			port.Congestion.LastUpdate = time.Now()

			port.Counters.LastUpdate = time.Now()
			port.Unlock()
		}
	}
}

func (ar *AdaptiveRouter) GetCongestionSummary(topology *model.Topology) map[model.GUID]map[int]model.CongestionStats {
	summary := make(map[model.GUID]map[int]model.CongestionStats)

	for guid, node := range topology.Nodes {
		summary[guid] = make(map[int]model.CongestionStats)
		for portNum, port := range node.Ports {
			port.RLock()
			summary[guid][portNum] = port.Congestion
			port.RUnlock()
		}
	}

	return summary
}

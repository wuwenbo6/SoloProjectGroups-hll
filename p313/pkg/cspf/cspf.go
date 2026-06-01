package cspf

import (
	"container/heap"
	"fmt"
	"math"

	"pcep-server/pkg/topology"
)

const (
	AFFINITY_BIT_GOLD     uint32 = 0x01
	AFFINITY_BIT_SILVER   uint32 = 0x02
	AFFINITY_BIT_BRONZE   uint32 = 0x04
	AFFINITY_BIT_PROTECT  uint32 = 0x08
	AFFINITY_BIT_LOWLAT   uint32 = 0x10
	AFFINITY_BIT_HIGHPRI  uint32 = 0x20
	AFFINITY_BIT_BACKUP   uint32 = 0x40
	AFFINITY_BIT_ENCRYPT  uint32 = 0x80
)

type Affinity struct {
	IncludeAny uint32 `json:"include_any"`
	IncludeAll uint32 `json:"include_all"`
	Exclude    uint32 `json:"exclude"`
}

func CheckAffinity(linkAffinity uint32, affinity Affinity) bool {
	if affinity.Exclude != 0 {
		if linkAffinity&affinity.Exclude != 0 {
			return false
		}
	}

	if affinity.IncludeAll != 0 {
		if linkAffinity&affinity.IncludeAll != affinity.IncludeAll {
			return false
		}
	}

	if affinity.IncludeAny != 0 {
		if linkAffinity&affinity.IncludeAny == 0 {
			return false
		}
	}

	return true
}

type WeightConfig struct {
	MetricWeight   float64 `json:"metric_weight"`
	LatencyWeight  float64 `json:"latency_weight"`
	BandwidthWeight float64 `json:"bandwidth_weight"`
}

func DefaultWeightConfig() WeightConfig {
	return WeightConfig{
		MetricWeight:    1.0,
		LatencyWeight:   0.0,
		BandwidthWeight: 0.0,
	}
}

type Constraints struct {
	Bandwidth float64
	Metric    int
	Exclude   []string
	Affinity  Affinity
	Weights   WeightConfig
}

type PathResult struct {
	Nodes      []string
	Links      []string
	Metric     int
	Cost       float64
	TotalLatency float64
	MinBandwidth float64
}

type item struct {
	nodeID string
	cost   float64
	index  int
}

type priorityQueue []*item

func (pq priorityQueue) Len() int { return len(pq) }

func (pq priorityQueue) Less(i, j int) bool {
	return pq[i].cost < pq[j].cost
}

func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

func (pq *priorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*item)
	item.index = n
	*pq = append(*pq, item)
}

func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

type CSPF struct {
	topo *topology.Topology
}

func NewCSPF(topo *topology.Topology) *CSPF {
	return &CSPF{topo: topo}
}

func (c *CSPF) ComputePath(source, target string, constraints Constraints) (*PathResult, error) {
	if c.topo.GetNode(source) == nil {
		return nil, fmt.Errorf("source node %s not found", source)
	}
	if c.topo.GetNode(target) == nil {
		return nil, fmt.Errorf("target node %s not found", target)
	}

	weights := constraints.Weights
	if weights.MetricWeight == 0 && weights.LatencyWeight == 0 && weights.BandwidthWeight == 0 {
		weights = DefaultWeightConfig()
	}

	excludeMap := make(map[string]bool)
	for _, id := range constraints.Exclude {
		excludeMap[id] = true
	}

	dist := make(map[string]float64)
	prev := make(map[string]string)
	prevLink := make(map[string]string)
	visited := make(map[string]bool)

	nodes := c.topo.GetNodes()
	for id := range nodes {
		dist[id] = math.MaxFloat64
		prev[id] = ""
		prevLink[id] = ""
	}
	dist[source] = 0

	pq := make(priorityQueue, 0)
	heap.Init(&pq)
	heap.Push(&pq, &item{nodeID: source, cost: 0})

	adj := c.buildAdjacencyList(constraints, excludeMap, weights)

	for pq.Len() > 0 {
		current := heap.Pop(&pq).(*item)
		currentNode := current.nodeID

		if visited[currentNode] {
			continue
		}
		visited[currentNode] = true

		if currentNode == target {
			break
		}

		for _, edge := range adj[currentNode] {
			if visited[edge.to] {
				continue
			}

			newCost := dist[currentNode] + edge.combinedCost
			if newCost < dist[edge.to] {
				dist[edge.to] = newCost
				prev[edge.to] = currentNode
				prevLink[edge.to] = edge.linkID
				heap.Push(&pq, &item{nodeID: edge.to, cost: newCost})
			}
		}
	}

	if dist[target] == math.MaxFloat64 {
		return nil, fmt.Errorf("no path found from %s to %s with given constraints", source, target)
	}

	pathNodes := []string{}
	pathLinks := []string{}
	current := target

	for current != "" {
		pathNodes = append([]string{current}, pathNodes...)
		if prevLink[current] != "" {
			pathLinks = append([]string{prevLink[current]}, pathLinks...)
		}
		current = prev[current]
	}

	totalMetric := 0
	var totalLatency float64
	minBandwidth := math.MaxFloat64

	for _, linkID := range pathLinks {
		link := c.topo.GetLink(linkID)
		if link != nil {
			totalMetric += link.Metric
			totalLatency += link.Latency
			availableBW := link.Bandwidth - link.ReservedBW
			if availableBW < minBandwidth {
				minBandwidth = availableBW
			}
		}
	}

	return &PathResult{
		Nodes:        pathNodes,
		Links:        pathLinks,
		Metric:       totalMetric,
		Cost:         dist[target],
		TotalLatency: totalLatency,
		MinBandwidth: minBandwidth,
	}, nil
}

type edge struct {
	to           string
	linkID       string
	metric       int
	latency      float64
	bandwidth    float64
	combinedCost float64
}

func computeCombinedCost(metric int, latency float64, availableBW float64, weights WeightConfig) float64 {
	var cost float64

	if weights.MetricWeight > 0 {
		cost += weights.MetricWeight * float64(metric)
	}

	if weights.LatencyWeight > 0 {
		cost += weights.LatencyWeight * latency
	}

	if weights.BandwidthWeight > 0 {
		if availableBW > 0 {
			cost += weights.BandwidthWeight * (1000.0 / availableBW)
		} else {
			cost += weights.BandwidthWeight * 1000000.0
		}
	}

	return cost
}

func (c *CSPF) buildAdjacencyList(constraints Constraints, exclude map[string]bool, weights WeightConfig) map[string][]edge {
	adj := make(map[string][]edge)
	links := c.topo.GetAvailableLinks()

	for _, link := range links {
		if exclude[link.ID] {
			continue
		}

		availableBW := link.Bandwidth - link.ReservedBW
		if availableBW < constraints.Bandwidth {
			continue
		}

		if !CheckAffinity(link.Affinity, constraints.Affinity) {
			continue
		}

		combinedCost := computeCombinedCost(link.Metric, link.Latency, availableBW, weights)

		if _, ok := adj[link.Source]; !ok {
			adj[link.Source] = []edge{}
		}
		adj[link.Source] = append(adj[link.Source], edge{
			to:           link.Target,
			linkID:       link.ID,
			metric:       link.Metric,
			latency:      link.Latency,
			bandwidth:    availableBW,
			combinedCost: combinedCost,
		})

		if _, ok := adj[link.Target]; !ok {
			adj[link.Target] = []edge{}
		}
		adj[link.Target] = append(adj[link.Target], edge{
			to:           link.Source,
			linkID:       link.ID,
			metric:       link.Metric,
			latency:      link.Latency,
			bandwidth:    availableBW,
			combinedCost: combinedCost,
		})
	}

	return adj
}

func AffinityName(bit uint32) string {
	names := map[uint32]string{
		AFFINITY_BIT_GOLD:    "GOLD",
		AFFINITY_BIT_SILVER:  "SILVER",
		AFFINITY_BIT_BRONZE:  "BRONZE",
		AFFINITY_BIT_PROTECT: "PROTECT",
		AFFINITY_BIT_LOWLAT:  "LOWLAT",
		AFFINITY_BIT_HIGHPRI: "HIGHPRI",
		AFFINITY_BIT_BACKUP:  "BACKUP",
		AFFINITY_BIT_ENCRYPT: "ENCRYPT",
	}
	if name, ok := names[bit]; ok {
		return name
	}
	return fmt.Sprintf("BIT%d", bit)
}

func AffinityBits(mask uint32) []string {
	bits := []string{}
	for i := uint32(0); i < 32; i++ {
		bit := uint32(1) << i
		if mask&bit != 0 {
			bits = append(bits, AffinityName(bit))
		}
	}
	return bits
}

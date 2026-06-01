package topology

import (
	"encoding/json"
	"os"
	"sync"
)

type Node struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	IP       string  `json:"ip"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
}

type Link struct {
	ID         string  `json:"id"`
	Source     string  `json:"source"`
	Target     string  `json:"target"`
	Bandwidth  float64 `json:"bandwidth"`
	ReservedBW float64 `json:"reserved_bw"`
	Metric     int     `json:"metric"`
	Latency    float64 `json:"latency"`
	Affinity   uint32  `json:"affinity"`
}

type Topology struct {
	Nodes map[string]*Node `json:"nodes"`
	Links map[string]*Link `json:"links"`
	mu    sync.RWMutex
}

func NewTopology() *Topology {
	return &Topology{
		Nodes: make(map[string]*Node),
		Links: make(map[string]*Link),
	}
}

func (t *Topology) AddNode(node *Node) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Nodes[node.ID] = node
}

func (t *Topology) AddLink(link *Link) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.Links[link.ID] = link
}

func (t *Topology) GetNode(id string) *Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Nodes[id]
}

func (t *Topology) GetLink(id string) *Link {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.Links[id]
}

func (t *Topology) GetLinks() map[string]*Link {
	t.mu.RLock()
	defer t.mu.RUnlock()
	links := make(map[string]*Link)
	for k, v := range t.Links {
		links[k] = v
	}
	return links
}

func (t *Topology) GetNodes() map[string]*Node {
	t.mu.RLock()
	defer t.mu.RUnlock()
	nodes := make(map[string]*Node)
	for k, v := range t.Nodes {
		nodes[k] = v
	}
	return nodes
}

func (t *Topology) GetAvailableLinks() []*Link {
	t.mu.RLock()
	defer t.mu.RUnlock()
	links := make([]*Link, 0, len(t.Links))
	for _, link := range t.Links {
		links = append(links, link)
	}
	return links
}

func (t *Topology) ReserveBandwidth(linkIDs []string, bw float64) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	for _, linkID := range linkIDs {
		link, exists := t.Links[linkID]
		if !exists {
			return false
		}
		if link.Bandwidth-link.ReservedBW < bw {
			return false
		}
	}

	for _, linkID := range linkIDs {
		t.Links[linkID].ReservedBW += bw
	}
	return true
}

func (t *Topology) ReleaseBandwidth(linkIDs []string, bw float64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	for _, linkID := range linkIDs {
		if link, exists := t.Links[linkID]; exists {
			link.ReservedBW -= bw
			if link.ReservedBW < 0 {
				link.ReservedBW = 0
			}
		}
	}
}

func (t *Topology) LoadFromFile(filename string) error {
	data, err := os.ReadFile(filename)
	if err != nil {
		return err
	}

	type topologyJSON struct {
		Nodes []*Node `json:"nodes"`
		Links []*Link `json:"links"`
	}

	var tj topologyJSON
	if err := json.Unmarshal(data, &tj); err != nil {
		return err
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	for _, node := range tj.Nodes {
		t.Nodes[node.ID] = node
	}
	for _, link := range tj.Links {
		t.Links[link.ID] = link
	}

	return nil
}

func (t *Topology) ToJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()

	type topologyJSON struct {
		Nodes []*Node `json:"nodes"`
		Links []*Link `json:"links"`
	}

	tj := topologyJSON{
		Nodes: make([]*Node, 0, len(t.Nodes)),
		Links: make([]*Link, 0, len(t.Links)),
	}

	for _, node := range t.Nodes {
		tj.Nodes = append(tj.Nodes, node)
	}
	for _, link := range t.Links {
		tj.Links = append(tj.Links, link)
	}

	return json.MarshalIndent(tj, "", "  ")
}

package dht

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"sort"
	"sync"
	"time"

	"dht-krpc-simulator/krpc"
)

const K = 8
const NumBuckets = 160
const TokenTTL = 10 * time.Minute

type Peer struct {
	IP   [4]byte
	Port int
}

func (p Peer) String() string {
	return fmt.Sprintf("%d.%d.%d.%d:%d", p.IP[0], p.IP[1], p.IP[2], p.IP[3], p.Port)
}

type PeerEntry struct {
	Peer     Peer
	Added    time.Time
	InfoHash krpc.NodeID
}

type TokenEntry struct {
	Token     string
	ExpiresAt time.Time
	InfoHash  krpc.NodeID
	NodeAddr  string
}

type Node struct {
	ID       krpc.NodeID
	Addr     krpc.NodeAddr
	LastSeen time.Time
}

func (n *Node) String() string {
	return fmt.Sprintf("%s@%s", n.ID, n.Addr)
}

type KBucket struct {
	Index    int
	Nodes    []*Node
	mu       sync.RWMutex
	capacity int
}

func NewKBucket(index int) *KBucket {
	return &KBucket{
		Index:    index,
		Nodes:    make([]*Node, 0, K),
		capacity: K,
	}
}

func (b *KBucket) Add(node *Node) bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i, n := range b.Nodes {
		if n.ID == node.ID {
			b.Nodes = append(b.Nodes[:i], b.Nodes[i+1:]...)
			b.Nodes = append(b.Nodes, node)
			return true
		}
	}

	if len(b.Nodes) >= b.capacity {
		return false
	}

	b.Nodes = append(b.Nodes, node)
	return true
}

func (b *KBucket) Oldest() *Node {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if len(b.Nodes) == 0 {
		return nil
	}
	return b.Nodes[0]
}

func (b *KBucket) ReplaceOldest(newNode *Node) *Node {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.Nodes) == 0 {
		b.Nodes = append(b.Nodes, newNode)
		return nil
	}
	oldest := b.Nodes[0]
	b.Nodes = append(b.Nodes[1:])
	b.Nodes = append(b.Nodes, newNode)
	return oldest
}

func (b *KBucket) TouchOldest() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.Nodes) > 0 {
		b.Nodes[0].LastSeen = time.Now()
		b.Nodes = append(b.Nodes[1:], b.Nodes[0])
	}
}

func (b *KBucket) Remove(id krpc.NodeID) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i, n := range b.Nodes {
		if n.ID == id {
			b.Nodes = append(b.Nodes[:i], b.Nodes[i+1:]...)
			return
		}
	}
}

func (b *KBucket) Find(id krpc.NodeID) *Node {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, n := range b.Nodes {
		if n.ID == id {
			return n
		}
	}
	return nil
}

func (b *KBucket) Size() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.Nodes)
}

type RoutingTable struct {
	SelfID    krpc.NodeID
	Buckets   [NumBuckets]*KBucket
	mu        sync.RWMutex
	PingFunc  func(addr string) (bool, error)
	peers     map[string]map[string]PeerEntry
	peersMu   sync.RWMutex
	tokens    map[string]TokenEntry
	tokensMu  sync.RWMutex
	resources map[string]string
}

func NewRoutingTable(selfID krpc.NodeID) *RoutingTable {
	rt := &RoutingTable{
		SelfID:    selfID,
		peers:     make(map[string]map[string]PeerEntry),
		tokens:    make(map[string]TokenEntry),
		resources: make(map[string]string),
	}
	for i := 0; i < NumBuckets; i++ {
		rt.Buckets[i] = NewKBucket(i)
	}
	return rt
}

func (rt *RoutingTable) generateToken(infoHash krpc.NodeID, nodeAddr string) string {
	h := sha1.New()
	h.Write([]byte(nodeAddr))
	h.Write([]byte(infoHash.String()))
	h.Write([]byte(time.Now().Truncate(TokenTTL).String()))
	token := hex.EncodeToString(h.Sum(nil))[:8]

	rt.tokensMu.Lock()
	rt.tokens[token] = TokenEntry{
		Token:     token,
		ExpiresAt: time.Now().Add(TokenTTL),
		InfoHash:  infoHash,
		NodeAddr:  nodeAddr,
	}
	rt.tokensMu.Unlock()

	rt.cleanupTokens()
	return token
}

func (rt *RoutingTable) validateToken(token string, infoHash krpc.NodeID, nodeAddr string) bool {
	rt.tokensMu.RLock()
	entry, ok := rt.tokens[token]
	rt.tokensMu.RUnlock()

	if !ok {
		return false
	}
	if time.Now().After(entry.ExpiresAt) {
		return false
	}
	if entry.InfoHash != infoHash {
		return false
	}
	if entry.NodeAddr != nodeAddr {
		return false
	}
	return true
}

func (rt *RoutingTable) cleanupTokens() {
	rt.tokensMu.Lock()
	defer rt.tokensMu.Unlock()

	now := time.Now()
	for k, v := range rt.tokens {
		if now.After(v.ExpiresAt) {
			delete(rt.tokens, k)
		}
	}
}

func (rt *RoutingTable) GetPeers(infoHash krpc.NodeID, requesterAddr string) (string, []krpc.CompactPeerInfo) {
	rt.peersMu.RLock()
	defer rt.peersMu.RUnlock()

	infoHashStr := infoHash.String()
	peerMap, ok := rt.peers[infoHashStr]
	if !ok {
		token := rt.generateToken(infoHash, requesterAddr)
		return token, nil
	}

	var peers []krpc.CompactPeerInfo
	for _, entry := range peerMap {
		peers = append(peers, krpc.CompactPeerInfo{
			IP:   entry.Peer.IP,
			Port: entry.Peer.Port,
		})
	}

	token := rt.generateToken(infoHash, requesterAddr)
	return token, peers
}

func (rt *RoutingTable) AnnouncePeer(infoHash krpc.NodeID, peer Peer, token string, nodeAddr string) bool {
	if !rt.validateToken(token, infoHash, nodeAddr) {
		return false
	}

	infoHashStr := infoHash.String()

	rt.peersMu.Lock()
	if _, ok := rt.peers[infoHashStr]; !ok {
		rt.peers[infoHashStr] = make(map[string]PeerEntry)
	}

	peerKey := peer.String()
	rt.peers[infoHashStr][peerKey] = PeerEntry{
		Peer:     peer,
		Added:    time.Now(),
		InfoHash: infoHash,
	}
	rt.peersMu.Unlock()

	rt.AddAnnouncedResource(infoHashStr)
	return true
}

func (rt *RoutingTable) AddAnnouncedResource(infoHashStr string) {
	rt.resources[infoHashStr] = time.Now().Format(time.RFC3339)
}

func (rt *RoutingTable) AnnouncePeerWithToken(infoHash krpc.NodeID, peer Peer) string {
	infoHashStr := infoHash.String()

	rt.peersMu.Lock()
	if _, ok := rt.peers[infoHashStr]; !ok {
		rt.peers[infoHashStr] = make(map[string]PeerEntry)
	}

	peerKey := peer.String()
	rt.peers[infoHashStr][peerKey] = PeerEntry{
		Peer:     peer,
		Added:    time.Now(),
		InfoHash: infoHash,
	}
	rt.peersMu.Unlock()

	rt.AddAnnouncedResource(infoHashStr)
	return "internal"
}

func (rt *RoutingTable) GetAllPeers() map[string][]PeerEntry {
	rt.peersMu.RLock()
	defer rt.peersMu.RUnlock()

	result := make(map[string][]PeerEntry)
	for infoHash, peerMap := range rt.peers {
		for _, entry := range peerMap {
			result[infoHash] = append(result[infoHash], entry)
		}
	}
	return result
}

func (rt *RoutingTable) GetResources() map[string]string {
	result := make(map[string]string)
	for k, v := range rt.resources {
		result[k] = v
	}
	return result
}

func (rt *RoutingTable) bucketIndex(id krpc.NodeID) int {
	distance := rt.SelfID.XOR(id)
	pl := distance.PrefixLen()
	idx := NumBuckets - 1 - pl
	if idx < 0 {
		idx = 0
	}
	if idx >= NumBuckets {
		idx = NumBuckets - 1
	}
	return idx
}

func (rt *RoutingTable) AddNode(node *Node) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	idx := rt.bucketIndex(node.ID)
	bucket := rt.Buckets[idx]

	added := bucket.Add(node)
	if added {
		return true
	}

	if rt.PingFunc == nil {
		return false
	}

	oldest := bucket.Oldest()
	if oldest == nil {
		return bucket.Add(node)
	}

	addr := oldest.Addr.String()
	alive, err := rt.PingFunc(addr)
	if err == nil && alive {
		bucket.TouchOldest()
		return false
	}

	bucket.ReplaceOldest(node)
	return true
}

func (rt *RoutingTable) RemoveNode(id krpc.NodeID) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	idx := rt.bucketIndex(id)
	rt.Buckets[idx].Remove(id)
}

func (rt *RoutingTable) FindNode(id krpc.NodeID) *Node {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	idx := rt.bucketIndex(id)
	return rt.Buckets[idx].Find(id)
}

func (rt *RoutingTable) FindClosest(target krpc.NodeID, count int) []*Node {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	idx := rt.bucketIndex(target)

	var result []*Node

	result = append(result, rt.Buckets[idx].Nodes...)

	if len(result) < count {
		for i := idx - 1; i >= 0 && len(result) < count; i-- {
			rt.Buckets[i].mu.RLock()
			result = append(result, rt.Buckets[i].Nodes...)
			rt.Buckets[i].mu.RUnlock()
		}
		for i := idx + 1; i < NumBuckets && len(result) < count; i++ {
			rt.Buckets[i].mu.RLock()
			result = append(result, rt.Buckets[i].Nodes...)
			rt.Buckets[i].mu.RUnlock()
		}
	}

	type nodeDist struct {
		node *Node
		dist krpc.NodeID
	}
	var sorted []nodeDist
	for _, n := range result {
		sorted = append(sorted, nodeDist{n, target.XOR(n.ID)})
	}
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if compareNodeIDs(sorted[i].dist, sorted[j].dist) > 0 {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	result = make([]*Node, 0, count)
	for i := 0; i < count && i < len(sorted); i++ {
		result = append(result, sorted[i].node)
	}

	return result
}

func compareNodeIDs(a, b krpc.NodeID) int {
	for i := 0; i < krpc.NodeIDLength; i++ {
		if a[i] < b[i] {
			return -1
		}
		if a[i] > b[i] {
			return 1
		}
	}
	return 0
}

func (rt *RoutingTable) TotalNodes() int {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	total := 0
	for _, b := range rt.Buckets {
		total += b.Size()
	}
	return total
}

type BucketInfo struct {
	BucketIndex int        `json:"bucket_index"`
	MinPrefix   string     `json:"min_prefix"`
	MaxPrefix   string     `json:"max_prefix"`
	Nodes       []NodeInfo `json:"nodes"`
}

type NodeInfo struct {
	NodeID   string `json:"node_id"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	LastSeen string `json:"last_seen"`
}

func (rt *RoutingTable) ToJSON() []BucketInfo {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	var result []BucketInfo
	for i, b := range rt.Buckets {
		b.mu.RLock()
		if len(b.Nodes) == 0 {
			b.mu.RUnlock()
			continue
		}

		bi := BucketInfo{
			BucketIndex: i,
			MinPrefix:   fmt.Sprintf("bucket %d", i),
			MaxPrefix:   fmt.Sprintf("distance prefix %d", NumBuckets-1-i),
		}

		for _, n := range b.Nodes {
			bi.Nodes = append(bi.Nodes, NodeInfo{
				NodeID:   n.ID.String(),
				IP:       fmt.Sprintf("%d.%d.%d.%d", n.Addr.IP[0], n.Addr.IP[1], n.Addr.IP[2], n.Addr.IP[3]),
				Port:     n.Addr.Port,
				LastSeen: n.LastSeen.Format(time.RFC3339),
			})
		}
		b.mu.RUnlock()
		result = append(result, bi)
	}
	return result
}

type ExportedRoutingTable struct {
	SelfID      string              `json:"self_id"`
	GeneratedAt string              `json:"generated_at"`
	TotalNodes  int                 `json:"total_nodes"`
	TotalPeers  int                 `json:"total_peers"`
	Resources   int                 `json:"total_resources"`
	Buckets     []ExportedBucket    `json:"buckets"`
	Peers       []ExportedPeerEntry `json:"peers"`
}

type ExportedBucket struct {
	BucketIndex int            `json:"bucket_index"`
	Capacity    int            `json:"capacity"`
	NodeCount   int            `json:"node_count"`
	PrefixRange string         `json:"prefix_range"`
	Nodes       []ExportedNode `json:"nodes"`
}

type ExportedNode struct {
	NodeID   string `json:"node_id"`
	Address  string `json:"address"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	LastSeen string `json:"last_seen"`
	Uptime   string `json:"uptime"`
}

type ExportedPeerEntry struct {
	InfoHash string `json:"info_hash"`
	PeerAddr string `json:"peer_address"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	AddedAt  string `json:"added_at"`
}

func (rt *RoutingTable) ExportRoutingTable() ExportedRoutingTable {
	rt.mu.RLock()
	rt.peersMu.RLock()
	rt.tokensMu.RLock()
	defer func() {
		rt.tokensMu.RUnlock()
		rt.peersMu.RUnlock()
		rt.mu.RUnlock()
	}()

	now := time.Now()
	export := ExportedRoutingTable{
		SelfID:      rt.SelfID.String(),
		GeneratedAt: now.Format(time.RFC3339),
	}

	for i, b := range rt.Buckets {
		b.mu.RLock()
		if len(b.Nodes) == 0 {
			b.mu.RUnlock()
			continue
		}

		eb := ExportedBucket{
			BucketIndex: i,
			Capacity:    K,
			NodeCount:   len(b.Nodes),
			PrefixRange: fmt.Sprintf("prefix length %d (bucket %d)", NumBuckets-1-i, i),
		}

		for _, n := range b.Nodes {
			uptime := now.Sub(n.LastSeen).Truncate(time.Second).String()
			eb.Nodes = append(eb.Nodes, ExportedNode{
				NodeID:   n.ID.String(),
				Address:  n.Addr.String(),
				IP:       fmt.Sprintf("%d.%d.%d.%d", n.Addr.IP[0], n.Addr.IP[1], n.Addr.IP[2], n.Addr.IP[3]),
				Port:     n.Addr.Port,
				LastSeen: n.LastSeen.Format(time.RFC3339),
				Uptime:   uptime,
			})
			export.TotalNodes++
		}

		b.mu.RUnlock()
		export.Buckets = append(export.Buckets, eb)
	}

	sort.Slice(export.Buckets, func(i, j int) bool {
		return export.Buckets[i].BucketIndex < export.Buckets[j].BucketIndex
	})

	for infoHash, peerMap := range rt.peers {
		for _, entry := range peerMap {
			export.Peers = append(export.Peers, ExportedPeerEntry{
				InfoHash: infoHash,
				PeerAddr: entry.Peer.String(),
				IP:       fmt.Sprintf("%d.%d.%d.%d", entry.Peer.IP[0], entry.Peer.IP[1], entry.Peer.IP[2], entry.Peer.IP[3]),
				Port:     entry.Peer.Port,
				AddedAt:  entry.Added.Format(time.RFC3339),
			})
			export.TotalPeers++
		}
	}

	export.Resources = len(rt.resources)

	return export
}

func (rt *RoutingTable) ExportResources() map[string]interface{} {
	rt.peersMu.RLock()
	defer rt.peersMu.RUnlock()

	result := make(map[string]interface{})
	result["generated_at"] = time.Now().Format(time.RFC3339)
	result["total_resources"] = len(rt.resources)
	result["total_peers"] = len(rt.GetAllPeers())

	resources := make([]map[string]interface{}, 0)
	for infoHash, announcedAt := range rt.resources {
		peers := rt.peers[infoHash]
		peerAddrs := make([]string, 0, len(peers))
		for _, entry := range peers {
			peerAddrs = append(peerAddrs, entry.Peer.String())
		}
		resources = append(resources, map[string]interface{}{
			"info_hash":    infoHash,
			"announced_at": announcedAt,
			"peer_count":   len(peers),
			"peers":        peerAddrs,
		})
	}

	sort.Slice(resources, func(i, j int) bool {
		ti, _ := resources[i]["announced_at"].(string)
		tj, _ := resources[j]["announced_at"].(string)
		return ti > tj
	})

	result["resources"] = resources
	return result
}

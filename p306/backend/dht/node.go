package dht

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"strconv"
	"sync"
	"time"

	"dht-krpc-simulator/krpc"
)

type QueryLog struct {
	Timestamp     string `json:"timestamp"`
	TransactionID string `json:"transaction_id"`
	QueryType     string `json:"query_type"`
	Target        string `json:"target"`
	Status        string `json:"status"`
	ElapsedMs     int64  `json:"elapsed_ms"`
	ResultSummary string `json:"result_summary"`
}

type DHTNode struct {
	ID        krpc.NodeID
	Routing   *RoutingTable
	Addr      krpc.NodeAddr
	conn      *net.UDPConn
	running   bool
	mu        sync.RWMutex
	Logs      []QueryLog
	logsMu    sync.RWMutex
	startTime time.Time
	pending   map[string]chan krpc.Message
	pendingMu sync.RWMutex
}

func NewDHTNode(port int) (*DHTNode, error) {
	id := krpc.GenerateNodeID()
	addr := krpc.NodeAddr{
		IP:   [4]byte{127, 0, 0, 1},
		Port: port,
	}

	node := &DHTNode{
		ID:        id,
		Routing:   NewRoutingTable(id),
		Addr:      addr,
		Logs:      make([]QueryLog, 0),
		startTime: time.Now(),
		pending:   make(map[string]chan krpc.Message),
	}

	node.Routing.PingFunc = node.pingNoLog

	return node, nil
}

func (n *DHTNode) pingNoLog(targetAddr string) (bool, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return false, fmt.Errorf("node is not running")
	}

	udpAddr, err := net.ResolveUDPAddr("udp", targetAddr)
	if err != nil {
		return false, err
	}

	txID := generateTxID()
	query := krpc.NewPingQuery(txID, n.ID)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return false, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return false, err
	}

	select {
	case resp := <-respCh:
		if resp.Type == krpc.TypeError {
			return false, fmt.Errorf("ping error")
		}
		return true, nil
	case <-time.After(3 * time.Second):
		return false, fmt.Errorf("timeout")
	}
}

func (n *DHTNode) Start() error {
	n.mu.Lock()
	if n.running {
		n.mu.Unlock()
		return nil
	}

	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", n.Addr.Port))
	if err != nil {
		n.mu.Unlock()
		return err
	}

	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		n.mu.Unlock()
		return err
	}

	n.conn = conn
	n.running = true
	n.mu.Unlock()

	go n.listen()
	log.Printf("DHT Node %s started on :%d", n.ID, n.Addr.Port)
	return nil
}

func (n *DHTNode) Stop() {
	n.mu.Lock()
	defer n.mu.Unlock()
	if !n.running {
		return
	}
	n.running = false
	if n.conn != nil {
		n.conn.Close()
	}
}

func (n *DHTNode) IsRunning() bool {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return n.running
}

func (n *DHTNode) Uptime() time.Duration {
	return time.Since(n.startTime)
}

func (n *DHTNode) listen() {
	buf := make([]byte, 4096)
	for {
		n.mu.RLock()
		if !n.running || n.conn == nil {
			n.mu.RUnlock()
			return
		}
		conn := n.conn
		n.mu.RUnlock()

		conn.SetReadDeadline(time.Now().Add(1 * time.Second))
		nRead, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
				continue
			}
			n.mu.RLock()
			if n.running {
				n.mu.RUnlock()
				continue
			}
			n.mu.RUnlock()
			return
		}

		data := make([]byte, nRead)
		copy(data, buf[:nRead])

		go n.handleMessage(data, remoteAddr)
	}
}

func (n *DHTNode) handleMessage(data []byte, remoteAddr *net.UDPAddr) {
	msg, err := krpc.DecodeMessage(data)
	if err != nil {
		log.Printf("Failed to decode message from %s: %v", remoteAddr, err)
		return
	}

	switch msg.Type {
	case krpc.TypeQuery:
		n.handleQuery(msg, remoteAddr)
	case krpc.TypeResponse:
		n.handleResponse(msg)
	case krpc.TypeError:
		n.handleResponse(msg)
	}
}

func (n *DHTNode) handleQuery(msg krpc.Message, remoteAddr *net.UDPAddr) {
	var senderID krpc.NodeID
	if args := msg.Args; args != nil {
		if idBytes, ok := args["id"]; ok {
			switch v := idBytes.(type) {
			case string:
				if len(v) == krpc.NodeIDLength {
					copy(senderID[:], v)
				}
			case []byte:
				if len(v) == krpc.NodeIDLength {
					copy(senderID[:], v)
				}
			}
		}
	}

	senderNode := &Node{
		ID:       senderID,
		Addr:     ipToNodeAddr(remoteAddr),
		LastSeen: time.Now(),
	}
	n.Routing.AddNode(senderNode)

	var resp krpc.Message

	switch msg.QueryType {
	case krpc.QueryPing:
		resp = krpc.NewPingResponse(msg.TransactionID, n.ID)

	case krpc.QueryFindNode:
		var targetID krpc.NodeID
		if args := msg.Args; args != nil {
			if targetBytes, ok := args["target"]; ok {
				switch v := targetBytes.(type) {
				case string:
					if len(v) == krpc.NodeIDLength {
						copy(targetID[:], v)
					}
				case []byte:
					if len(v) == krpc.NodeIDLength {
						copy(targetID[:], v)
					}
				}
			}
		}

		closest := n.Routing.FindClosest(targetID, K)
		var compactNodes []krpc.CompactNodeInfo
		for _, node := range closest {
			compactNodes = append(compactNodes, krpc.CompactNodeInfo{
				ID:   node.ID,
				Addr: node.Addr,
			})
		}
		resp = krpc.NewFindNodeResponse(msg.TransactionID, n.ID, compactNodes)

	case krpc.QueryGetPeers:
		var infoHash krpc.NodeID
		if args := msg.Args; args != nil {
			if ihBytes, ok := args["info_hash"]; ok {
				switch v := ihBytes.(type) {
				case string:
					if len(v) == krpc.NodeIDLength {
						copy(infoHash[:], v)
					}
				case []byte:
					if len(v) == krpc.NodeIDLength {
						copy(infoHash[:], v)
					}
				}
			}
		}

		token, peers := n.Routing.GetPeers(infoHash, remoteAddr.String())
		var nodes []krpc.CompactNodeInfo
		if len(peers) == 0 {
			closest := n.Routing.FindClosest(infoHash, K)
			for _, node := range closest {
				nodes = append(nodes, krpc.CompactNodeInfo{
					ID:   node.ID,
					Addr: node.Addr,
				})
			}
		}
		resp = krpc.NewGetPeersResponse(msg.TransactionID, n.ID, token, peers, nodes)

	case krpc.QueryAnnounce:
		var infoHash krpc.NodeID
		var port int
		var token string

		if args := msg.Args; args != nil {
			if ihBytes, ok := args["info_hash"]; ok {
				switch v := ihBytes.(type) {
				case string:
					if len(v) == krpc.NodeIDLength {
						copy(infoHash[:], v)
					}
				case []byte:
					if len(v) == krpc.NodeIDLength {
						copy(infoHash[:], v)
					}
				}
			}
			if p, ok := args["port"]; ok {
				switch v := p.(type) {
				case int:
					port = v
				case int64:
					port = int(v)
				}
			}
			if t, ok := args["token"]; ok {
				switch v := t.(type) {
				case string:
					token = v
				case []byte:
					token = string(v)
				}
			}
		}

		peer := Peer{
			IP:   [4]byte{byte(remoteAddr.IP[0]), byte(remoteAddr.IP[1]), byte(remoteAddr.IP[2]), byte(remoteAddr.IP[3])},
			Port: port,
		}

		nodeAddrStr := remoteAddr.String()
		ok := n.Routing.AnnouncePeer(infoHash, peer, token, nodeAddrStr)

		if ok {
			resp = krpc.NewAnnounceResponse(msg.TransactionID, n.ID)
		} else {
			resp = krpc.NewErrorResponse(msg.TransactionID, 203, "Protocol error, invalid token")
		}

	default:
		resp = krpc.NewErrorResponse(msg.TransactionID, 204, "Method unknown")
	}

	respData, err := krpc.EncodeMessage(resp)
	if err != nil {
		log.Printf("Failed to encode response: %v", err)
		return
	}

	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn != nil {
		conn.WriteToUDP(respData, remoteAddr)
	}
}

func (n *DHTNode) handleResponse(msg krpc.Message) {
	n.pendingMu.RLock()
	ch, ok := n.pending[msg.TransactionID]
	n.pendingMu.RUnlock()

	if ok {
		ch <- msg
	}
}

type PingResult struct {
	Log    *QueryLog
	NodeID string
}

func (n *DHTNode) PingWithResult(targetAddr string) (*PingResult, error) {
	log, err := n.Ping(targetAddr)
	if err != nil {
		return &PingResult{Log: log}, err
	}
	nodeID := ""
	if log.Status == "success" {
		nodeID = extractHexFromSummary(log.ResultSummary)
	}
	return &PingResult{Log: log, NodeID: nodeID}, nil
}

func extractHexFromSummary(summary string) string {
	if len(summary) > 10 {
		result := summary[10:]
		return result
	}
	return ""
}

func (n *DHTNode) Ping(targetAddr string) (*QueryLog, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("node is not running")
	}

	udpAddr, err := net.ResolveUDPAddr("udp", targetAddr)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %v", err)
	}

	txID := generateTxID()
	query := krpc.NewPingQuery(txID, n.ID)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return nil, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	start := time.Now()
	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return n.createLog(txID, "ping", targetAddr, "error", time.Since(start), err.Error()), err
	}

	select {
	case resp := <-respCh:
		elapsed := time.Since(start)
		if resp.Type == krpc.TypeError {
			errMsg := "unknown error"
			if len(resp.Error) > 1 {
				if s, ok := resp.Error[1].(string); ok {
					errMsg = s
				}
			}
			return n.createLog(txID, "ping", targetAddr, "error", elapsed, errMsg), nil
		}

		var responderID string
		if resp.Response != nil {
			if idVal, ok := resp.Response["id"]; ok {
				switch v := idVal.(type) {
				case string:
					if len(v) == krpc.NodeIDLength {
						var nid krpc.NodeID
						copy(nid[:], v)
						responderID = nid.String()
					}
				case []byte:
					if len(v) == krpc.NodeIDLength {
						var nid krpc.NodeID
						copy(nid[:], v)
						responderID = nid.String()
					}
				}
			}
		}

		summary := fmt.Sprintf("pong from %s", responderID)
		return n.createLog(txID, "ping", targetAddr, "success", elapsed, summary), nil

	case <-time.After(5 * time.Second):
		elapsed := time.Since(start)
		return n.createLog(txID, "ping", targetAddr, "timeout", elapsed, "no response within 5s"), nil
	}
}

func (n *DHTNode) FindNode(targetIDHex string, askAddr string) (*QueryLog, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return nil, fmt.Errorf("node is not running")
	}

	targetID, err := krpc.NodeIDFromHex(targetIDHex)
	if err != nil {
		return nil, fmt.Errorf("invalid target ID: %v", err)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", askAddr)
	if err != nil {
		return nil, fmt.Errorf("invalid address: %v", err)
	}

	txID := generateTxID()
	query := krpc.NewFindNodeQuery(txID, n.ID, targetID)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return nil, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	start := time.Now()
	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return n.createLog(txID, "find_node", askAddr, "error", time.Since(start), err.Error()), err
	}

	select {
	case resp := <-respCh:
		elapsed := time.Since(start)
		if resp.Type == krpc.TypeError {
			errMsg := "unknown error"
			if len(resp.Error) > 1 {
				if s, ok := resp.Error[1].(string); ok {
					errMsg = s
				}
			}
			return n.createLog(txID, "find_node", askAddr, "error", elapsed, errMsg), nil
		}

		var nodes []krpc.CompactNodeInfo
		if resp.Response != nil {
			if nodesVal, ok := resp.Response["nodes"]; ok {
				switch v := nodesVal.(type) {
				case string:
					nodes = krpc.ParseCompactNodes([]byte(v))
				case []byte:
					nodes = krpc.ParseCompactNodes(v)
				}
			}
		}

		for _, cn := range nodes {
			node := &Node{
				ID:       cn.ID,
				Addr:     cn.Addr,
				LastSeen: time.Now(),
			}
			n.Routing.AddNode(node)
		}

		summary := fmt.Sprintf("returned %d nodes", len(nodes))
		return n.createLog(txID, "find_node", askAddr, "success", elapsed, summary), nil

	case <-time.After(5 * time.Second):
		elapsed := time.Since(start)
		return n.createLog(txID, "find_node", askAddr, "timeout", elapsed, "no response within 5s"), nil
	}
}

func (n *DHTNode) FindNodeResult(targetIDHex string, askAddr string) ([]NodeInfo, *QueryLog, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return nil, nil, fmt.Errorf("node is not running")
	}

	targetID, err := krpc.NodeIDFromHex(targetIDHex)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid target ID: %v", err)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", askAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid address: %v", err)
	}

	txID := generateTxID()
	query := krpc.NewFindNodeQuery(txID, n.ID, targetID)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return nil, nil, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	start := time.Now()
	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return nil, n.createLog(txID, "find_node", askAddr, "error", time.Since(start), err.Error()), err
	}

	select {
	case resp := <-respCh:
		elapsed := time.Since(start)
		if resp.Type == krpc.TypeError {
			errMsg := "unknown error"
			if len(resp.Error) > 1 {
				if s, ok := resp.Error[1].(string); ok {
					errMsg = s
				}
			}
			return nil, n.createLog(txID, "find_node", askAddr, "error", elapsed, errMsg), nil
		}

		var compactNodes []krpc.CompactNodeInfo
		if resp.Response != nil {
			if nodesVal, ok := resp.Response["nodes"]; ok {
				switch v := nodesVal.(type) {
				case string:
					compactNodes = krpc.ParseCompactNodes([]byte(v))
				case []byte:
					compactNodes = krpc.ParseCompactNodes(v)
				}
			}
		}

		var result []NodeInfo
		for _, cn := range compactNodes {
			node := &Node{
				ID:       cn.ID,
				Addr:     cn.Addr,
				LastSeen: time.Now(),
			}
			n.Routing.AddNode(node)
			result = append(result, NodeInfo{
				NodeID:   cn.ID.String(),
				IP:       fmt.Sprintf("%d.%d.%d.%d", cn.Addr.IP[0], cn.Addr.IP[1], cn.Addr.IP[2], cn.Addr.IP[3]),
				Port:     cn.Addr.Port,
				LastSeen: time.Now().Format(time.RFC3339),
			})
		}

		summary := fmt.Sprintf("returned %d nodes", len(compactNodes))
		return result, n.createLog(txID, "find_node", askAddr, "success", elapsed, summary), nil

	case <-time.After(5 * time.Second):
		elapsed := time.Since(start)
		return nil, n.createLog(txID, "find_node", askAddr, "timeout", elapsed, "no response within 5s"), nil
	}
}

type GetPeersResult struct {
	Token    string                 `json:"token"`
	Peers    []krpc.CompactPeerInfo `json:"peers"`
	Nodes    []NodeInfo             `json:"nodes"`
	HasPeers bool                   `json:"has_peers"`
}

func (n *DHTNode) GetPeersWithResult(infoHashHex string, askAddr string) (*GetPeersResult, *QueryLog, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return nil, nil, fmt.Errorf("node is not running")
	}

	infoHash, err := krpc.NodeIDFromHex(infoHashHex)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid info hash: %v", err)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", askAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid address: %v", err)
	}

	txID := generateTxID()
	query := krpc.NewGetPeersQuery(txID, n.ID, infoHash)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return nil, nil, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	start := time.Now()
	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return nil, n.createLog(txID, "get_peers", askAddr, "error", time.Since(start), err.Error()), err
	}

	select {
	case resp := <-respCh:
		elapsed := time.Since(start)
		if resp.Type == krpc.TypeError {
			errMsg := "unknown error"
			if len(resp.Error) > 1 {
				if s, ok := resp.Error[1].(string); ok {
					errMsg = s
				}
			}
			return nil, n.createLog(txID, "get_peers", askAddr, "error", elapsed, errMsg), nil
		}

		result := &GetPeersResult{}

		if resp.Response != nil {
			if tokenVal, ok := resp.Response["token"]; ok {
				switch v := tokenVal.(type) {
				case string:
					result.Token = v
				case []byte:
					result.Token = string(v)
				}
			}

			if peersVal, ok := resp.Response["values"]; ok {
				result.HasPeers = true
				switch v := peersVal.(type) {
				case []interface{}:
					for _, item := range v {
						switch itemData := item.(type) {
						case string:
							peers := krpc.ParseCompactPeers([]byte(itemData))
							result.Peers = append(result.Peers, peers...)
						case []byte:
							peers := krpc.ParseCompactPeers(itemData)
							result.Peers = append(result.Peers, peers...)
						}
					}
				}
			}

			if nodesVal, ok := resp.Response["nodes"]; ok {
				var compactNodes []krpc.CompactNodeInfo
				switch v := nodesVal.(type) {
				case string:
					compactNodes = krpc.ParseCompactNodes([]byte(v))
				case []byte:
					compactNodes = krpc.ParseCompactNodes(v)
				}
				for _, cn := range compactNodes {
					node := &Node{
						ID:       cn.ID,
						Addr:     cn.Addr,
						LastSeen: time.Now(),
					}
					n.Routing.AddNode(node)
					result.Nodes = append(result.Nodes, NodeInfo{
						NodeID:   cn.ID.String(),
						IP:       fmt.Sprintf("%d.%d.%d.%d", cn.Addr.IP[0], cn.Addr.IP[1], cn.Addr.IP[2], cn.Addr.IP[3]),
						Port:     cn.Addr.Port,
						LastSeen: time.Now().Format(time.RFC3339),
					})
				}
			}
		}

		var summary string
		if result.HasPeers {
			summary = fmt.Sprintf("returned %d peers", len(result.Peers))
		} else {
			summary = fmt.Sprintf("returned %d nodes (no peers)", len(result.Nodes))
		}
		return result, n.createLog(txID, "get_peers", askAddr, "success", elapsed, summary), nil

	case <-time.After(5 * time.Second):
		elapsed := time.Since(start)
		return nil, n.createLog(txID, "get_peers", askAddr, "timeout", elapsed, "no response within 5s"), nil
	}
}

type AnnouncePeerResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func (n *DHTNode) AnnouncePeerWithResult(infoHashHex string, askAddr string, port int, token string) (*AnnouncePeerResult, *QueryLog, error) {
	n.mu.RLock()
	conn := n.conn
	n.mu.RUnlock()

	if conn == nil {
		return nil, nil, fmt.Errorf("node is not running")
	}

	infoHash, err := krpc.NodeIDFromHex(infoHashHex)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid info hash: %v", err)
	}

	udpAddr, err := net.ResolveUDPAddr("udp", askAddr)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid address: %v", err)
	}

	txID := generateTxID()
	query := krpc.NewAnnounceQuery(txID, n.ID, infoHash, port, token)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return nil, nil, err
	}

	respCh := make(chan krpc.Message, 1)
	n.pendingMu.Lock()
	n.pending[txID] = respCh
	n.pendingMu.Unlock()
	defer func() {
		n.pendingMu.Lock()
		delete(n.pending, txID)
		n.pendingMu.Unlock()
	}()

	start := time.Now()
	_, err = conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return nil, n.createLog(txID, "announce_peer", askAddr, "error", time.Since(start), err.Error()), err
	}

	select {
	case resp := <-respCh:
		elapsed := time.Since(start)
		if resp.Type == krpc.TypeError {
			errMsg := "unknown error"
			if len(resp.Error) > 1 {
				if s, ok := resp.Error[1].(string); ok {
					errMsg = s
				}
			}
			return &AnnouncePeerResult{Success: false, Message: errMsg}, n.createLog(txID, "announce_peer", askAddr, "error", elapsed, errMsg), nil
		}

		result := &AnnouncePeerResult{
			Success: true,
			Message: "announced successfully",
		}
		summary := fmt.Sprintf("announced %s on port %d", infoHashHex[:8], port)
		return result, n.createLog(txID, "announce_peer", askAddr, "success", elapsed, summary), nil

	case <-time.After(5 * time.Second):
		elapsed := time.Since(start)
		return &AnnouncePeerResult{Success: false, Message: "timeout"}, n.createLog(txID, "announce_peer", askAddr, "timeout", elapsed, "no response within 5s"), nil
	}
}

func (n *DHTNode) createLog(txID, queryType, target, status string, elapsed time.Duration, summary string) *QueryLog {
	entry := &QueryLog{
		Timestamp:     time.Now().Format(time.RFC3339),
		TransactionID: txID,
		QueryType:     queryType,
		Target:        target,
		Status:        status,
		ElapsedMs:     elapsed.Milliseconds(),
		ResultSummary: summary,
	}

	n.logsMu.Lock()
	n.Logs = append(n.Logs, *entry)
	if len(n.Logs) > 100 {
		n.Logs = n.Logs[len(n.Logs)-100:]
	}
	n.logsMu.Unlock()

	return entry
}

func (n *DHTNode) GetLogs() []QueryLog {
	n.logsMu.RLock()
	defer n.logsMu.RUnlock()
	result := make([]QueryLog, len(n.Logs))
	copy(result, n.Logs)
	return result
}

func ipToNodeAddr(addr *net.UDPAddr) krpc.NodeAddr {
	var na krpc.NodeAddr
	ip4 := addr.IP.To4()
	if ip4 != nil {
		copy(na.IP[:], ip4)
	}
	na.Port = addr.Port
	return na
}

func generateTxID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func ParsePort(s string) (int, error) {
	return strconv.Atoi(s)
}

package dht

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"dht-krpc-simulator/krpc"
)

type SimulatedNode struct {
	ID      krpc.NodeID
	Addr    krpc.NodeAddr
	conn    *net.UDPConn
	routing *RoutingTable
}

type Simulator struct {
	nodes    []*SimulatedNode
	basePort int
	mu       sync.Mutex
}

func NewSimulator(basePort int) *Simulator {
	return &Simulator{
		nodes:    make([]*SimulatedNode, 0),
		basePort: basePort,
	}
}

func (s *Simulator) SpawnNodes(count int, mainNode *DHTNode) []SimulatedNodeInfo {
	s.mu.Lock()
	defer s.mu.Unlock()

	var added []SimulatedNodeInfo

	for i := 0; i < count; i++ {
		port := s.basePort + len(s.nodes)
		node, err := createSimulatedNode(port)
		if err != nil {
			log.Printf("Failed to create simulated node on port %d: %v", port, err)
			continue
		}

		s.nodes = append(s.nodes, node)

		mainNode.Routing.AddNode(&Node{
			ID:       node.ID,
			Addr:     node.Addr,
			LastSeen: time.Now(),
		})

		node.routing.AddNode(&Node{
			ID:       mainNode.ID,
			Addr:     mainNode.Addr,
			LastSeen: time.Now(),
		})

		for _, existing := range s.nodes {
			if existing.ID == node.ID {
				continue
			}
			node.routing.AddNode(&Node{
				ID:       existing.ID,
				Addr:     existing.Addr,
				LastSeen: time.Now(),
			})
			existing.routing.AddNode(&Node{
				ID:       node.ID,
				Addr:     node.Addr,
				LastSeen: time.Now(),
			})
		}

		added = append(added, SimulatedNodeInfo{
			NodeID:  node.ID.String(),
			Address: node.Addr.String(),
		})
	}

	return added
}

func (s *Simulator) GetAllNodes() []SimulatedNodeInfo {
	s.mu.Lock()
	defer s.mu.Unlock()

	var result []SimulatedNodeInfo
	for _, n := range s.nodes {
		result = append(result, SimulatedNodeInfo{
			NodeID:  n.ID.String(),
			Address: n.Addr.String(),
		})
	}
	return result
}

func (s *Simulator) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, n := range s.nodes {
		if n.conn != nil {
			n.conn.Close()
		}
	}
	s.nodes = nil
}

type SimulatedNodeInfo struct {
	NodeID  string `json:"node_id"`
	Address string `json:"address"`
}

func createSimulatedNode(port int) (*SimulatedNode, error) {
	id := krpc.GenerateNodeID()
	addr := krpc.NodeAddr{
		IP:   [4]byte{127, 0, 0, 1},
		Port: port,
	}

	udpAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", port))
	if err != nil {
		return nil, err
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return nil, err
	}

	node := &SimulatedNode{
		ID:      id,
		Addr:    addr,
		conn:    conn,
		routing: NewRoutingTable(id),
	}

	node.routing.PingFunc = node.pingNode

	go node.listen()

	return node, nil
}

func (sn *SimulatedNode) pingNode(targetAddr string) (bool, error) {
	udpAddr, err := net.ResolveUDPAddr("udp", targetAddr)
	if err != nil {
		return false, err
	}

	txID := generateTxID()
	query := krpc.NewPingQuery(txID, sn.ID)

	queryData, err := krpc.EncodeMessage(query)
	if err != nil {
		return false, err
	}

	_, err = sn.conn.WriteToUDP(queryData, udpAddr)
	if err != nil {
		return false, err
	}

	buf := make([]byte, 1024)
	sn.conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	n, _, err := sn.conn.ReadFromUDP(buf)
	sn.conn.SetReadDeadline(time.Time{})
	if err != nil {
		return false, err
	}

	msg, err := krpc.DecodeMessage(buf[:n])
	if err != nil {
		return false, err
	}

	if msg.Type == krpc.TypeError {
		return false, fmt.Errorf("ping error")
	}

	return true, nil
}

func (sn *SimulatedNode) listen() {
	buf := make([]byte, 4096)
	for {
		sn.conn.SetReadDeadline(time.Time{})
		nRead, remoteAddr, err := sn.conn.ReadFromUDP(buf)
		if err != nil {
			return
		}

		data := make([]byte, nRead)
		copy(data, buf[:nRead])

		go sn.handleMessage(data, remoteAddr)
	}
}

func (sn *SimulatedNode) handleMessage(data []byte, remoteAddr *net.UDPAddr) {
	msg, err := krpc.DecodeMessage(data)
	if err != nil {
		return
	}

	if msg.Type != krpc.TypeQuery {
		return
	}

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
	sn.routing.AddNode(senderNode)

	var resp krpc.Message

	switch msg.QueryType {
	case krpc.QueryPing:
		resp = krpc.NewPingResponse(msg.TransactionID, sn.ID)

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

		closest := sn.routing.FindClosest(targetID, K)
		var compactNodes []krpc.CompactNodeInfo
		for _, node := range closest {
			compactNodes = append(compactNodes, krpc.CompactNodeInfo{
				ID:   node.ID,
				Addr: node.Addr,
			})
		}
		resp = krpc.NewFindNodeResponse(msg.TransactionID, sn.ID, compactNodes)

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

		token, peers := sn.routing.GetPeers(infoHash, remoteAddr.String())
		var nodes []krpc.CompactNodeInfo
		if len(peers) == 0 {
			closest := sn.routing.FindClosest(infoHash, K)
			for _, node := range closest {
				nodes = append(nodes, krpc.CompactNodeInfo{
					ID:   node.ID,
					Addr: node.Addr,
				})
			}
		}
		resp = krpc.NewGetPeersResponse(msg.TransactionID, sn.ID, token, peers, nodes)

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
		ok := sn.routing.AnnouncePeer(infoHash, peer, token, nodeAddrStr)

		if ok {
			resp = krpc.NewAnnounceResponse(msg.TransactionID, sn.ID)
		} else {
			resp = krpc.NewErrorResponse(msg.TransactionID, 203, "Protocol error, invalid token")
		}

	default:
		resp = krpc.NewErrorResponse(msg.TransactionID, 204, "Method unknown")
	}

	respData, err := krpc.EncodeMessage(resp)
	if err != nil {
		return
	}

	sn.conn.WriteToUDP(respData, remoteAddr)
}

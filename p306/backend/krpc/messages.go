package krpc

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

type MessageType string

const (
	TypeQuery    MessageType = "q"
	TypeResponse MessageType = "r"
	TypeError    MessageType = "e"
)

type QueryType string

const (
	QueryPing     QueryType = "ping"
	QueryFindNode QueryType = "find_node"
	QueryGetPeers QueryType = "get_peers"
	QueryAnnounce QueryType = "announce_peer"
)

const NodeIDLength = 20

type NodeID [NodeIDLength]byte

func GenerateNodeID() NodeID {
	var id NodeID
	rand.Read(id[:])
	return id
}

func (id NodeID) String() string {
	return hex.EncodeToString(id[:])
}

func NodeIDFromHex(s string) (NodeID, error) {
	var id NodeID
	b, err := hex.DecodeString(s)
	if err != nil {
		return id, err
	}
	if len(b) != NodeIDLength {
		return id, fmt.Errorf("node ID must be %d bytes, got %d", NodeIDLength, len(b))
	}
	copy(id[:], b)
	return id, nil
}

func (id NodeID) XOR(other NodeID) NodeID {
	var result NodeID
	for i := 0; i < NodeIDLength; i++ {
		result[i] = id[i] ^ other[i]
	}
	return result
}

func (id NodeID) PrefixLen() int {
	for i := 0; i < NodeIDLength; i++ {
		for j := 7; j >= 0; j-- {
			if id[i]&(1<<uint(j)) != 0 {
				return i*8 + (7 - j)
			}
		}
	}
	return NodeIDLength * 8
}

type Message struct {
	TransactionID string
	Type          MessageType
	QueryType     QueryType
	Args          map[string]interface{}
	Response      map[string]interface{}
	Error         []interface{}
}

func NewPingQuery(txID string, senderID NodeID) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeQuery,
		QueryType:     QueryPing,
		Args: map[string]interface{}{
			"id": string(senderID[:]),
		},
	}
}

func NewFindNodeQuery(txID string, senderID NodeID, targetID NodeID) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeQuery,
		QueryType:     QueryFindNode,
		Args: map[string]interface{}{
			"id":     string(senderID[:]),
			"target": string(targetID[:]),
		},
	}
}

func NewPingResponse(txID string, senderID NodeID) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeResponse,
		Response: map[string]interface{}{
			"id": string(senderID[:]),
		},
	}
}

func NewFindNodeResponse(txID string, senderID NodeID, nodes []CompactNodeInfo) Message {
	var nodesBytes []byte
	for _, n := range nodes {
		nodesBytes = append(nodesBytes, n.ID[:]...)
		nodesBytes = append(nodesBytes, n.Addr.IP[:]...)
		nodesBytes = append(nodesBytes, byte(n.Addr.Port>>8))
		nodesBytes = append(nodesBytes, byte(n.Addr.Port&0xff))
	}
	return Message{
		TransactionID: txID,
		Type:          TypeResponse,
		Response: map[string]interface{}{
			"id":    string(senderID[:]),
			"nodes": string(nodesBytes),
		},
	}
}

func NewErrorResponse(txID string, code int, msg string) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeError,
		Error:         []interface{}{code, msg},
	}
}

func NewGetPeersQuery(txID string, senderID NodeID, infoHash NodeID) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeQuery,
		QueryType:     QueryGetPeers,
		Args: map[string]interface{}{
			"id":        string(senderID[:]),
			"info_hash": string(infoHash[:]),
		},
	}
}

func NewAnnounceQuery(txID string, senderID NodeID, infoHash NodeID, port int, token string) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeQuery,
		QueryType:     QueryAnnounce,
		Args: map[string]interface{}{
			"id":           string(senderID[:]),
			"info_hash":    string(infoHash[:]),
			"port":         port,
			"token":        token,
			"implied_port": 0,
		},
	}
}

func NewGetPeersResponse(txID string, senderID NodeID, token string, peers []CompactPeerInfo, nodes []CompactNodeInfo) Message {
	resp := map[string]interface{}{
		"id":    string(senderID[:]),
		"token": token,
	}

	if len(peers) > 0 {
		var peersBytes []byte
		for _, p := range peers {
			peersBytes = append(peersBytes, p.IP[:]...)
			peersBytes = append(peersBytes, byte(p.Port>>8))
			peersBytes = append(peersBytes, byte(p.Port&0xff))
		}
		resp["values"] = []interface{}{string(peersBytes)}
	}

	if len(nodes) > 0 {
		var nodesBytes []byte
		for _, n := range nodes {
			nodesBytes = append(nodesBytes, n.ID[:]...)
			nodesBytes = append(nodesBytes, n.Addr.IP[:]...)
			nodesBytes = append(nodesBytes, byte(n.Addr.Port>>8))
			nodesBytes = append(nodesBytes, byte(n.Addr.Port&0xff))
		}
		resp["nodes"] = string(nodesBytes)
	}

	return Message{
		TransactionID: txID,
		Type:          TypeResponse,
		Response:      resp,
	}
}

func NewAnnounceResponse(txID string, senderID NodeID) Message {
	return Message{
		TransactionID: txID,
		Type:          TypeResponse,
		Response: map[string]interface{}{
			"id": string(senderID[:]),
		},
	}
}

func EncodeMessage(msg Message) ([]byte, error) {
	dict := map[string]interface{}{
		"t": msg.TransactionID,
		"y": string(msg.Type),
	}

	switch msg.Type {
	case TypeQuery:
		dict["q"] = string(msg.QueryType)
		dict["a"] = interface{}(msg.Args)
	case TypeResponse:
		dict["r"] = interface{}(msg.Response)
	case TypeError:
		dict["e"] = interface{}(msg.Error)
	}

	return Encode(dict)
}

func DecodeMessage(data []byte) (Message, error) {
	decoded, err := Decode(data)
	if err != nil {
		return Message{}, err
	}

	dict, ok := decoded.(map[string]interface{})
	if !ok {
		return Message{}, fmt.Errorf("KRPC message must be a dict")
	}

	var msg Message

	if t, ok := dict["t"]; ok {
		switch v := t.(type) {
		case string:
			msg.TransactionID = v
		case []byte:
			msg.TransactionID = string(v)
		}
	}

	if y, ok := dict["y"]; ok {
		switch v := y.(type) {
		case string:
			msg.Type = MessageType(v)
		case []byte:
			msg.Type = MessageType(string(v))
		}
	}

	switch msg.Type {
	case TypeQuery:
		if q, ok := dict["q"]; ok {
			switch v := q.(type) {
			case string:
				msg.QueryType = QueryType(v)
			case []byte:
				msg.QueryType = QueryType(string(v))
			}
		}
		if a, ok := dict["a"]; ok {
			if m, ok := a.(map[string]interface{}); ok {
				msg.Args = m
			}
		}
	case TypeResponse:
		if r, ok := dict["r"]; ok {
			if m, ok := r.(map[string]interface{}); ok {
				msg.Response = m
			}
		}
	case TypeError:
		if e, ok := dict["e"]; ok {
			if arr, ok := e.([]interface{}); ok {
				msg.Error = arr
			}
		}
	}

	return msg, nil
}

type CompactNodeInfo struct {
	ID   NodeID
	Addr NodeAddr
}

type NodeAddr struct {
	IP   [4]byte
	Port int
}

func (a NodeAddr) String() string {
	return fmt.Sprintf("%d.%d.%d.%d:%d", a.IP[0], a.IP[1], a.IP[2], a.IP[3], a.Port)
}

func ParseCompactNodes(data []byte) []CompactNodeInfo {
	nodeSize := 26
	var nodes []CompactNodeInfo
	for i := 0; i+nodeSize <= len(data); i += nodeSize {
		var info CompactNodeInfo
		copy(info.ID[:], data[i:i+20])
		copy(info.Addr.IP[:], data[i+20:i+24])
		info.Addr.Port = int(data[i+24])<<8 | int(data[i+25])
		nodes = append(nodes, info)
	}
	return nodes
}

type CompactPeerInfo struct {
	IP   [4]byte
	Port int
}

func (p CompactPeerInfo) String() string {
	return fmt.Sprintf("%d.%d.%d.%d:%d", p.IP[0], p.IP[1], p.IP[2], p.IP[3], p.Port)
}

func ParseCompactPeers(data []byte) []CompactPeerInfo {
	peerSize := 6
	var peers []CompactPeerInfo
	for i := 0; i+peerSize <= len(data); i += peerSize {
		var info CompactPeerInfo
		copy(info.IP[:], data[i:i+4])
		info.Port = int(data[i+4])<<8 | int(data[i+5])
		peers = append(peers, info)
	}
	return peers
}

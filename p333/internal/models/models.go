package models

import (
	"encoding/json"
	"net"
	"sync"
	"time"
)

type MACAddress [6]byte

func (m MACAddress) String() string {
	return net.HardwareAddr(m[:]).String()
}

func (m MACAddress) MarshalJSON() ([]byte, error) {
	return json.Marshal(m.String())
}

func (m *MACAddress) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	hw, err := ParseMAC(s)
	if err != nil {
		return err
	}
	*m = hw
	return nil
}

func ParseMAC(s string) (MACAddress, error) {
	hw, err := net.ParseMAC(s)
	if err != nil {
		return MACAddress{}, err
	}
	var mac MACAddress
	copy(mac[:], hw)
	return mac, nil
}

type VTEP struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	IP         net.IP     `json:"ip"`
	L2VNI      uint32     `json:"l2_vni"`
	L3VNI      uint32     `json:"l3_vni"`
	LoopbackIP net.IP     `json:"loopback_ip"`
	MAC        MACAddress `json:"mac"`
	Status     string     `json:"status"`
	Connected  bool       `json:"connected"`
}

type MACTableKey struct {
	RD  string
	VNI uint32
}

type MACEntry struct {
	RD       string     `json:"rd"`
	MAC      MACAddress `json:"mac"`
	IP       net.IP     `json:"ip"`
	L2VNI    uint32     `json:"l2_vni"`
	L3VNI    uint32     `json:"l3_vni"`
	Local    bool       `json:"local"`
	NextHop  net.IP     `json:"next_hop"`
	VTEPID   string     `json:"vtep_id"`
	Age      time.Time  `json:"age"`
}

type EVPNRouteType uint8

const (
	EVPNRouteType2 EVPNRouteType = 2
	EVPNRouteType3 EVPNRouteType = 3
)

type PMSITunnelType uint8

const (
	PMSITunnelTypeIngressReplication PMSITunnelType = 6
	PMSITunnelTypePIMSM              PMSITunnelType = 1
	PMSITunnelTypePIMSSM             PMSITunnelType = 2
)

type PMSITunnelAttribute struct {
	TunnelType    PMSITunnelType `json:"tunnel_type"`
	Label         uint32         `json:"label"`
	TunnelID      net.IP         `json:"tunnel_id"`
	IsLeafInfoReq bool           `json:"is_leaf_info_req"`
}

type MulticastGroup struct {
	GroupIP net.IP `json:"group_ip"`
	SourceIP net.IP `json:"source_ip"`
	L2VNI    uint32 `json:"l2_vni"`
}

type EVPNRoute struct {
	RouteType         EVPNRouteType       `json:"route_type"`
	RD                string              `json:"rd"`
	ESI               string              `json:"esi,omitempty"`
	EthTag            uint32              `json:"eth_tag"`
	MACAddress        MACAddress          `json:"mac_address,omitempty"`
	IPAddress         net.IP              `json:"ip_address,omitempty"`
	L2VNI             uint32              `json:"l2_vni"`
	L3VNI             uint32              `json:"l3_vni,omitempty"`
	NextHop           net.IP              `json:"next_hop"`
	OriginVTEP        string              `json:"origin_vtep"`
	Timestamp         time.Time           `json:"timestamp"`
	PMSITunnel        *PMSITunnelAttribute `json:"pmsi_tunnel,omitempty"`
	MulticastGroup    *MulticastGroup     `json:"multicast_group,omitempty"`
}

type MulticastGroupTable struct {
	mu      sync.RWMutex
	groups  map[uint32][]*MulticastGroup
}

func NewMulticastGroupTable() *MulticastGroupTable {
	return &MulticastGroupTable{
		groups: make(map[uint32][]*MulticastGroup),
	}
}

func (t *MulticastGroupTable) Add(vni uint32, group *MulticastGroup) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.groups[vni] = append(t.groups[vni], group)
}

func (t *MulticastGroupTable) GetByVNI(vni uint32) []*MulticastGroup {
	t.mu.RLock()
	defer t.mu.RUnlock()
	groups := make([]*MulticastGroup, len(t.groups[vni]))
	copy(groups, t.groups[vni])
	return groups
}

func (t *MulticastGroupTable) List() map[uint32][]*MulticastGroup {
	t.mu.RLock()
	defer t.mu.RUnlock()
	result := make(map[uint32][]*MulticastGroup)
	for k, v := range t.groups {
		result[k] = make([]*MulticastGroup, len(v))
		copy(result[k], v)
	}
	return result
}

type MACTable struct {
	mu      sync.RWMutex
	entries map[MACTableKey]*MACEntry
}

func NewMACTable() *MACTable {
	return &MACTable{
		entries: make(map[MACTableKey]*MACEntry),
	}
}

func (t *MACTable) Add(entry *MACEntry) {
	t.mu.Lock()
	defer t.mu.Unlock()
	key := MACTableKey{RD: entry.RD, VNI: entry.L2VNI}
	t.entries[key] = entry
}

func (t *MACTable) Get(rd string, vni uint32) (*MACEntry, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	key := MACTableKey{RD: rd, VNI: vni}
	entry, exists := t.entries[key]
	return entry, exists
}

func (t *MACTable) Remove(rd string, vni uint32) {
	t.mu.Lock()
	defer t.mu.Unlock()
	key := MACTableKey{RD: rd, VNI: vni}
	delete(t.entries, key)
}

func (t *MACTable) List() []*MACEntry {
	t.mu.RLock()
	defer t.mu.RUnlock()
	entries := make([]*MACEntry, 0, len(t.entries))
	for _, entry := range t.entries {
		entries = append(entries, entry)
	}
	return entries
}

func (t *MACTable) ListByVNI(vni uint32) []*MACEntry {
	t.mu.RLock()
	defer t.mu.RUnlock()
	var result []*MACEntry
	for key, entry := range t.entries {
		if key.VNI == vni {
			result = append(result, entry)
		}
	}
	return result
}

func (t *MACTable) MarshalJSON() ([]byte, error) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return json.Marshal(t.List())
}

type VXLANTunnel struct {
	ID         string `json:"id"`
	VNI        uint32 `json:"vni"`
	SourceVTEP string `json:"source_vtep"`
	DestVTEP   string `json:"dest_vtep"`
	Status     string `json:"status"`
}

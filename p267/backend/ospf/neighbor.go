package ospf

import (
	"fmt"
	"strconv"
	"strings"
)

type LSAType string

const (
	LSATypeRouter  LSAType = "Router-LSA"
	LSATypeNetwork LSAType = "Network-LSA"
	LSATypeInter   LSAType = "Inter-Area-Prefix-LSA"
	LSATypeIntra   LSAType = "Intra-Area-Prefix-LSA"
)

type InterfaceInfo struct {
	Name    string `json:"name"`
	Address string `json:"address"`
	State   string `json:"state"`
}

type LSARef struct {
	Type      string `json:"type"`
	LSID      string `json:"lsId"`
	AdvRouter string `json:"advRouter"`
	Sequence  int    `json:"sequence"`
	Age       int    `json:"age"`
}

type RouterLSA struct {
	LSARef
	Flags        string `json:"flags"`
	LinkCount    int    `json:"linkCount"`
	Links        []LinkData `json:"links"`
}

type LinkData struct {
	Type       string `json:"type"`
	LinkID     string `json:"linkId"`
	LinkData   string `json:"linkData"`
	Metric     int    `json:"metric"`
}

type NetworkLSA struct {
	LSARef
	AttachedRouters []string `json:"attachedRouters"`
	Options         string   `json:"options"`
}

type IPv6Prefix struct {
	Prefix       string `json:"prefix"`
	PrefixLen    int    `json:"prefixLen"`
	Metric       int    `json:"metric"`
	AdvRouter    string `json:"advRouter"`
	NextHop      string `json:"nextHop"`
	Interface    string `json:"interface"`
	RouteType    string `json:"routeType"`
	Age          int    `json:"age"`
	Sequence     int    `json:"sequence"`
}

type RouteEntry struct {
	Prefix       string `json:"prefix"`
	PrefixLen    int    `json:"prefixLen"`
	NextHop      string `json:"nextHop"`
	Interface    string `json:"interface"`
	Metric       int    `json:"metric"`
	RouteType    string `json:"routeType"`
	AdvRouter    string `json:"advRouter"`
	Age          int    `json:"age"`
	Protocol     string `json:"protocol"`
}

type Router struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	RouterID      string         `json:"routerId"`
	AreaID        string         `json:"areaId"`
	HelloInterval int            `json:"helloInterval"`
	DeadInterval  int            `json:"deadInterval"`
	Interfaces    []InterfaceInfo `json:"interfaces"`
	Neighbors     map[string]*Neighbor `json:"-"`
	LSDB          []LSARef       `json:"lsdb"`
	RouterLSAs    map[string]*RouterLSA  `json:"-"`
	NetworkLSAs   map[string]*NetworkLSA `json:"-"`
	IPv6Prefixes  []IPv6Prefix   `json:"-"`
	RoutingTable  []RouteEntry   `json:"-"`
	X             int            `json:"x"`
	Y             int            `json:"y"`
}

func NewRouter(id, name, routerID, areaID string, x, y int) *Router {
	r := &Router{
		ID:            id,
		Name:          name,
		RouterID:      routerID,
		AreaID:        areaID,
		HelloInterval: 10,
		DeadInterval:  40,
		Interfaces: []InterfaceInfo{
			{Name: "GigabitEthernet0/0", Address: routerID, State: "Up"},
			{Name: "GigabitEthernet0/1", Address: routerID, State: "Up"},
		},
		Neighbors:     make(map[string]*Neighbor),
		LSDB:          []LSARef{},
		RouterLSAs:    make(map[string]*RouterLSA),
		NetworkLSAs:   make(map[string]*NetworkLSA),
		IPv6Prefixes:  []IPv6Prefix{},
		RoutingTable:  []RouteEntry{},
		X:             x,
		Y:             y,
	}

	r.generateSelfRouterLSA()
	r.generateIPv6Prefixes()
	r.rebuildRoutingTable()
	return r
}

func (r *Router) generateSelfRouterLSA() {
	lsa := &RouterLSA{
		LSARef: LSARef{
			Type:      string(LSATypeRouter),
			LSID:      r.RouterID,
			AdvRouter: r.RouterID,
			Sequence:  0x80000001,
			Age:       0,
		},
		Flags:     "0x00 (B,E,V6)",
		LinkCount: 2,
		Links: []LinkData{
			{Type: "Point-to-Point", LinkID: "0.0.0.0", LinkData: r.RouterID, Metric: 1},
			{Type: "Transit", LinkID: r.RouterID, LinkData: r.RouterID, Metric: 1},
		},
	}
	r.RouterLSAs[r.RouterID] = lsa
	r.LSDB = append(r.LSDB, lsa.LSARef)
}

func (r *Router) generateIPv6Prefixes() {
	ridParts := []int{}
	for _, p := range strings.Split(r.RouterID, ".") {
		n, _ := strconv.Atoi(p)
		ridParts = append(ridParts, n)
	}
	hextet := fmt.Sprintf("%02x%02x:%02x%02x", ridParts[0], ridParts[1], ridParts[2], ridParts[3])

	r.IPv6Prefixes = []IPv6Prefix{
		{
			Prefix:    fmt.Sprintf("2001:db8:%s::/64", hextet),
			PrefixLen: 64,
			Metric:    1,
			AdvRouter: r.RouterID,
			NextHop:   "::",
			Interface: r.Interfaces[0].Name,
			RouteType: "Intra-Area",
			Age:       0,
			Sequence:  0x80000001,
		},
		{
			Prefix:    fmt.Sprintf("2001:db8:%s:1::/64", hextet),
			PrefixLen: 64,
			Metric:    10,
			AdvRouter: r.RouterID,
			NextHop:   "::",
			Interface: r.Interfaces[1].Name,
			RouteType: "Intra-Area",
			Age:       0,
			Sequence:  0x80000001,
		},
		{
			Prefix:    fmt.Sprintf("fc00:%s::/48", hextet),
			PrefixLen: 48,
			Metric:    5,
			AdvRouter: r.RouterID,
			NextHop:   "::",
			Interface: "Loopback0",
			RouteType: "Intra-Area",
			Age:       0,
			Sequence:  0x80000001,
		},
	}
}

func (r *Router) rebuildRoutingTable() {
	r.RoutingTable = []RouteEntry{}
	seen := make(map[string]bool)

	for _, prefix := range r.IPv6Prefixes {
		key := fmt.Sprintf("%s/%d", prefix.Prefix, prefix.PrefixLen)
		if seen[key] {
			continue
		}
		seen[key] = true
		r.RoutingTable = append(r.RoutingTable, RouteEntry{
			Prefix:    prefix.Prefix,
			PrefixLen: prefix.PrefixLen,
			NextHop:   prefix.NextHop,
			Interface: prefix.Interface,
			Metric:    prefix.Metric,
			RouteType: prefix.RouteType,
			AdvRouter: prefix.AdvRouter,
			Age:       prefix.Age,
			Protocol:  "OSPFv3",
		})
	}

	for lsaID, lsa := range r.RouterLSAs {
		if lsa.AdvRouter == r.RouterID {
			continue
		}
		ridParts := []int{}
		for _, p := range strings.Split(lsa.AdvRouter, ".") {
			n, _ := strconv.Atoi(p)
			ridParts = append(ridParts, n)
		}
		hextet := fmt.Sprintf("%02x%02x:%02x%02x", ridParts[0], ridParts[1], ridParts[2], ridParts[3])

		prefix := fmt.Sprintf("2001:db8:%s::/64", hextet)
		key := fmt.Sprintf("%s/%d", prefix, 64)
		if seen[key] {
			continue
		}
		seen[key] = true

		r.RoutingTable = append(r.RoutingTable, RouteEntry{
			Prefix:    prefix,
			PrefixLen: 64,
			NextHop:   lsa.AdvRouter,
			Interface: r.Interfaces[0].Name,
			Metric:    10,
			RouteType: "Inter-Area",
			AdvRouter: lsa.AdvRouter,
			Age:       lsa.Age,
			Protocol:  "OSPFv3",
		})
		void(lsaID)
	}

	for lsaID, lsa := range r.NetworkLSAs {
		for _, ar := range lsa.AttachedRouters {
			if ar == r.RouterID {
				continue
			}
			ridParts := []int{}
			for _, p := range strings.Split(ar, ".") {
				n, _ := strconv.Atoi(p)
				ridParts = append(ridParts, n)
			}
			hextet := fmt.Sprintf("%02x%02x:%02x%02x", ridParts[0], ridParts[1], ridParts[2], ridParts[3])

			prefix := fmt.Sprintf("2001:db8:%s:net::/64", hextet)
			key := fmt.Sprintf("%s/%d", prefix, 64)
			if seen[key] {
				continue
			}
			seen[key] = true

			r.RoutingTable = append(r.RoutingTable, RouteEntry{
				Prefix:    prefix,
				PrefixLen: 64,
				NextHop:   ar,
				Interface: r.Interfaces[0].Name,
				Metric:    20,
				RouteType: "Intra-Area",
				AdvRouter: lsa.AdvRouter,
				Age:       lsa.Age,
				Protocol:  "OSPFv3",
			})
		}
		void(lsaID)
	}

	void(seen)
}

func (r *Router) incrementLSASequence(advRouter string) {
	if lsa, ok := r.RouterLSAs[advRouter]; ok {
		lsa.Sequence++
		lsa.Age = 0
		for i := range r.LSDB {
			if r.LSDB[i].Type == string(LSATypeRouter) && r.LSDB[i].AdvRouter == advRouter {
				r.LSDB[i].Sequence = lsa.Sequence
				r.LSDB[i].Age = 0
				break
			}
		}
	}
}

func (r *Router) installLSA(lsa LSARef) bool {
	for i, existing := range r.LSDB {
		if existing.Type == lsa.Type && existing.LSID == lsa.LSID && existing.AdvRouter == lsa.AdvRouter {
			if lsa.Sequence > existing.Sequence {
				r.LSDB[i] = lsa
				if lsa.Type == string(LSATypeRouter) {
					rlsa := &RouterLSA{
						LSARef:  lsa,
						Flags:   "0x00",
						LinkCount: 2,
						Links:   []LinkData{},
					}
					r.RouterLSAs[lsa.AdvRouter] = rlsa
				} else if lsa.Type == string(LSATypeNetwork) {
					nlsa := &NetworkLSA{
						LSARef:          lsa,
						AttachedRouters: []string{},
						Options:         "0x000013",
					}
					r.NetworkLSAs[lsa.LSID] = nlsa
				}
				return true
			}
			return false
		}
	}
	r.LSDB = append(r.LSDB, lsa)
	if lsa.Type == string(LSATypeRouter) {
		rlsa := &RouterLSA{
			LSARef:  lsa,
			Flags:   "0x00",
			LinkCount: 2,
			Links:   []LinkData{},
		}
		r.RouterLSAs[lsa.AdvRouter] = rlsa
	} else if lsa.Type == string(LSATypeNetwork) {
		nlsa := &NetworkLSA{
			LSARef:          lsa,
			AttachedRouters: []string{},
			Options:         "0x000013",
		}
		r.NetworkLSAs[lsa.LSID] = nlsa
	}
	return true
}

func (r *Router) installPrefix(prefix IPv6Prefix) bool {
	for i, existing := range r.IPv6Prefixes {
		if existing.Prefix == prefix.Prefix && existing.PrefixLen == prefix.PrefixLen {
			if prefix.Sequence > existing.Sequence {
				r.IPv6Prefixes[i] = prefix
				return true
			}
			return false
		}
	}
	r.IPv6Prefixes = append(r.IPv6Prefixes, prefix)
	return true
}

func void(v interface{}) {}
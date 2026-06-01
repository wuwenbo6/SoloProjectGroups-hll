package ripng

import (
	"fmt"
	"net/netip"
	"sync"
)

type SplitHorizonMode int

const (
	SplitHorizonNone          SplitHorizonMode = 0
	SplitHorizonSimple        SplitHorizonMode = 1
	SplitHorizonPoisonReverse SplitHorizonMode = 2
)

type Interface struct {
	Name          string       `json:"name"`
	LinkName      string       `json:"link_name"`
	Prefix        netip.Prefix `json:"prefix"`
	Address       netip.Addr   `json:"address"`
	LinkLocalAddr netip.Addr   `json:"link_local_addr"`
	IsUp          bool         `json:"is_up"`
}

type Router struct {
	mu             sync.RWMutex
	ID             string                                    `json:"id"`
	Table          *RoutingTable                             `json:"-"`
	Interfaces     map[string]*Interface                     `json:"interfaces"`
	SplitHorizon   SplitHorizonMode                          `json:"split_horizon"`
	UpdateInterval int                                       `json:"update_interval"`
	TimerCounter   int                                       `json:"timer_counter"`
	PacketHandler  func(msg RIPngMessage, fromRouter string) `json:"-"`
}

func NewRouter(id string, splitHorizon SplitHorizonMode) *Router {
	return &Router{
		ID:             id,
		Table:          NewRoutingTable(id),
		Interfaces:     make(map[string]*Interface),
		SplitHorizon:   splitHorizon,
		UpdateInterval: DefaultUpdateInterval,
	}
}

func generateLinkLocalAddr(routerID, ifName string) netip.Addr {
	hash := 0
	for i := 0; i < len(routerID); i++ {
		hash = (hash*31 + int(routerID[i])) % 0xffff
	}
	for i := 0; i < len(ifName); i++ {
		hash = (hash*31 + int(ifName[i])) % 0xffff
	}
	hash2 := (hash * 17) % 0xffff
	addrStr := fmt.Sprintf("fe80::%04x:%04x:%04x:%04x",
		hash,
		(hash*7)&0xffff,
		(hash*13)&0xffff,
		hash2)
	addr, _ := netip.ParseAddr(addrStr)
	return addr
}

func (r *Router) AddInterface(name, linkName string, addr netip.Addr, prefix netip.Prefix) {
	r.mu.Lock()
	defer r.mu.Unlock()

	llAddr := generateLinkLocalAddr(r.ID, name)
	iface := &Interface{
		Name:          name,
		LinkName:      linkName,
		Prefix:        prefix,
		Address:       addr,
		LinkLocalAddr: llAddr,
		IsUp:          true,
	}
	r.Interfaces[name] = iface
	r.Table.AddLocalRoute(prefix, name)
}

func (r *Router) AddAggregateRoute(prefix netip.Prefix, aggregated []string, metric uint8) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Table.AddAggregateRoute(prefix, aggregated, metric, "aggregate")
}

func (r *Router) RemoveAggregateRoute(prefix netip.Prefix) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.Table.RemoveAggregateRoute(prefix)
}

func (r *Router) AutoAggregate(minPrefixLen int) []netip.Prefix {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Table.AutoAggregate(minPrefixLen)
}

func (r *Router) GetInterfacesForLink(linkName string) []*Interface {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*Interface
	for _, iface := range r.Interfaces {
		if iface.LinkName == linkName && iface.IsUp {
			result = append(result, iface)
		}
	}
	return result
}

func (r *Router) ProcessMessage(msg RIPngMessage) []RoutingEvent {
	before := len(r.Table.GetEvents())

	switch msg.Command {
	case CommandRequest:
		r.handleRequest(msg)
	case CommandResponse:
		r.handleResponse(msg)
	}

	after := len(r.Table.GetEvents())
	if after > before {
		return r.Table.GetEvents()[before:after]
	}
	return nil
}

func (r *Router) handleRequest(msg RIPngMessage) {
	response := RIPngMessage{
		Command:  CommandResponse,
		SenderID: r.ID,
		FromIF:   msg.FromIF,
	}

	allRoutes := r.Table.GetAll()
	if len(allRoutes) == 0 {
		entry := RouteEntry{
			Prefix: netip.MustParsePrefix("::/0"),
			Metric: InfiniteMetric,
		}
		response.Entries = []RouteEntry{entry}
	} else {
		response.Entries = r.filterRoutesForInterface(allRoutes, msg.FromIF)
	}

	if r.PacketHandler != nil {
		r.PacketHandler(response, msg.SenderID)
	}
}

func (r *Router) handleResponse(msg RIPngMessage) {
	if msg.SenderID == r.ID {
		return
	}

	iface := r.getInterfaceByName(msg.FromIF)
	if iface == nil {
		return
	}

	for _, entry := range msg.Entries {
		newMetric := entry.Metric + 1
		if newMetric > InfiniteMetric {
			newMetric = InfiniteMetric
		}

		newEntry := &RouteEntry{
			Prefix:        entry.Prefix,
			RouteTag:      entry.RouteTag,
			Metric:        newMetric,
			NextHop:       iface.LinkLocalAddr,
			LearnedFrom:   msg.SenderID,
			InterfaceName: msg.FromIF,
			IsLocal:       false,
			Timer:         0,
			IsGarbage:     newMetric >= InfiniteMetric,
			Changed:       true,
		}

		r.Table.Update(newEntry)
	}
}

func (r *Router) filterRoutesForInterface(routes []RouteEntry, outIF string) []RouteEntry {
	var filtered []RouteEntry

	for _, route := range routes {
		switch r.SplitHorizon {
		case SplitHorizonNone:
			filtered = append(filtered, route)

		case SplitHorizonSimple:
			if route.LearnedFrom != "" && isSameLink(r, route.InterfaceName, outIF) {
				continue
			}
			filtered = append(filtered, route)

		case SplitHorizonPoisonReverse:
			if route.LearnedFrom != "" && isSameLink(r, route.InterfaceName, outIF) {
				poisoned := route
				poisoned.Metric = InfiniteMetric
				filtered = append(filtered, poisoned)
			} else {
				filtered = append(filtered, route)
			}
		}
	}

	return filtered
}

func isSameLink(r *Router, ifName1, ifName2 string) bool {
	if1, ok1 := r.Interfaces[ifName1]
	if2, ok2 := r.Interfaces[ifName2]
	if !ok1 || !ok2 {
		return ifName1 == ifName2
	}
	return if1.LinkName == if2.LinkName
}

func (r *Router) getInterfaceByName(name string) *Interface {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Interfaces[name]
}

func (r *Router) GenerateUpdate(ifName string) RIPngMessage {
	r.mu.RLock()
	defer r.mu.RUnlock()

	allRoutes := r.Table.GetAll()
	filtered := r.filterRoutesForInterface(allRoutes, ifName)

	if len(filtered) > MaxEntriesPerMessage {
		filtered = filtered[:MaxEntriesPerMessage]
	}

	return RIPngMessage{
		Command:  CommandResponse,
		Entries:  filtered,
		SenderID: r.ID,
		FromIF:   ifName,
	}
}

func (r *Router) GenerateFullUpdate() []RIPngMessage {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var messages []RIPngMessage
	for ifName, iface := range r.Interfaces {
		if !iface.IsUp {
			continue
		}
		msg := r.GenerateUpdate(ifName)
		messages = append(messages, msg)
	}
	return messages
}

func (r *Router) Tick() []RoutingEvent {
	before := len(r.Table.GetEvents())

	r.Table.TickTimers()

	after := len(r.Table.GetEvents())
	if after > before {
		return r.Table.GetEvents()[before:after]
	}
	return nil
}

func (r *Router) GetSnapshot() RouterSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return RouterSnapshot{
		ID:           r.ID,
		Interfaces:   r.Interfaces,
		SplitHorizon: int(r.SplitHorizon),
		Routes:       r.Table.GetAll(),
		Events:       r.Table.GetEvents(),
	}
}

type RouterSnapshot struct {
	ID           string                `json:"id"`
	Interfaces   map[string]*Interface `json:"interfaces"`
	SplitHorizon int                   `json:"split_horizon"`
	Routes       []RouteEntry          `json:"routes"`
	Events       []RoutingEvent        `json:"events"`
}

func (r *Router) RemoveLinkRoutes(linkName string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	table := r.Table.GetCopy()
	for key, entry := range table {
		if !entry.IsLocal {
			iface, ok := r.Interfaces[entry.InterfaceName]
			if ok && iface.LinkName == linkName {
				r.Table.Invalidate(entry.Prefix)
				_ = key
			}
		}
	}
}

func SplitHorizonModeName(mode SplitHorizonMode) string {
	switch mode {
	case SplitHorizonNone:
		return "None"
	case SplitHorizonSimple:
		return "Split Horizon"
	case SplitHorizonPoisonReverse:
		return "Poison Reverse"
	default:
		return fmt.Sprintf("Unknown(%d)", mode)
	}
}

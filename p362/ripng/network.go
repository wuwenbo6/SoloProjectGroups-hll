package ripng

import (
	"encoding/json"
	"fmt"
	"net/netip"
	"sync"
	"time"
)

type Link struct {
	Name    string   `json:"name"`
	Routers []string `json:"routers"`
	IsUp    bool     `json:"is_up"`
	Cost    int      `json:"cost"`
}

type SimEventType string

const (
	EventRouteUpdate     SimEventType = "route_update"
	EventTimerTick       SimEventType = "timer_tick"
	EventPeriodicUpdate  SimEventType = "periodic_update"
	EventLinkChange      SimEventType = "link_change"
	EventTriggeredUpdate SimEventType = "triggered_update"
	EventRequest         SimEventType = "request"
	EventConverge        SimEventType = "converge"
)

type SimEvent struct {
	Timestamp time.Time    `json:"timestamp"`
	Type      SimEventType `json:"type"`
	RouterID  string       `json:"router_id"`
	Detail    string       `json:"detail"`
	Data      interface{}  `json:"data,omitempty"`
}

type Network struct {
	mu          sync.RWMutex
	Routers     map[string]*Router `json:"routers"`
	Links       map[string]*Link   `json:"links"`
	Events      []SimEvent         `json:"events"`
	StepCount   int                `json:"step_count"`
	Running     bool               `json:"running"`
	Speed       int                `json:"speed"`
	subscribers []chan []byte
	Capture     *PacketCapture `json:"capture"`
}

func NewNetwork() *Network {
	return &Network{
		Routers: make(map[string]*Router),
		Links:   make(map[string]*Link),
		Events:  make([]SimEvent, 0),
		Speed:   1,
		Capture: NewPacketCapture(10000),
	}
}

func (n *Network) Subscribe() chan []byte {
	n.mu.Lock()
	defer n.mu.Unlock()

	ch := make(chan []byte, 100)
	n.subscribers = append(n.subscribers, ch)
	return ch
}

func (n *Network) Unsubscribe(ch chan []byte) {
	n.mu.Lock()
	defer n.mu.Unlock()

	for i, sub := range n.subscribers {
		if sub == ch {
			n.subscribers = append(n.subscribers[:i], n.subscribers[i+1:]...)
			close(ch)
			return
		}
	}
}

func (n *Network) broadcast(eventType string, data interface{}) {
	msg := map[string]interface{}{
		"type": eventType,
		"data": data,
		"time": time.Now().Format(time.RFC3339),
		"step": n.StepCount,
	}
	payload, _ := json.Marshal(msg)

	subs := make([]chan []byte, len(n.subscribers))
	copy(subs, n.subscribers)

	for _, ch := range subs {
		select {
		case ch <- payload:
		default:
		}
	}
}

func (n *Network) addEvent(eventType SimEventType, routerID, detail string, data interface{}) {
	evt := SimEvent{
		Timestamp: time.Now(),
		Type:      eventType,
		RouterID:  routerID,
		Detail:    detail,
		Data:      data,
	}
	n.Events = append(n.Events, evt)
}

func (n *Network) makePacketHandler() func(RIPngMessage, string) {
	return func(msg RIPngMessage, targetRouter string) {
		go func() {
			n.mu.Lock()
			defer n.mu.Unlock()
			if target, ok := n.Routers[targetRouter]; ok {
				var linkName string
				for _, iface := range target.Interfaces {
					if iface.Name == msg.FromIF {
						linkName = iface.LinkName
						break
					}
				}
				n.Capture.Capture(PacketDirSend, msg.SenderID, targetRouter, linkName, msg)
				events := target.ProcessMessage(msg)
				if len(events) > 0 {
					for _, e := range events {
						n.addEvent(EventRouteUpdate, target.ID, e.Detail, e)
					}
					n.broadcast("route_update", target.GetSnapshot())
				}
			}
		}()
	}
}

func (n *Network) AddRouter(id string, splitHorizon SplitHorizonMode) *Router {
	n.mu.Lock()
	defer n.mu.Unlock()

	return n.addRouterLocked(id, splitHorizon)
}

func (n *Network) addRouterLocked(id string, splitHorizon SplitHorizonMode) *Router {
	router := NewRouter(id, splitHorizon)
	router.PacketHandler = n.makePacketHandler()

	n.Routers[id] = router
	n.addEvent(EventLinkChange, id, fmt.Sprintf("Router %s added (split horizon: %s)", id, SplitHorizonModeName(splitHorizon)), nil)
	n.broadcast("router_added", router.GetSnapshot())
	return router
}

func (n *Network) AddLink(name string, routerIDs []string, cost int) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	return n.addLinkLocked(name, routerIDs, cost)
}

func (n *Network) addLinkLocked(name string, routerIDs []string, cost int) error {
	for _, rid := range routerIDs {
		if _, ok := n.Routers[rid]; !ok {
			return fmt.Errorf("router %s not found", rid)
		}
	}

	link := &Link{
		Name:    name,
		Routers: routerIDs,
		IsUp:    true,
		Cost:    cost,
	}
	n.Links[name] = link

	linkIdx := 0
	for _, rid := range routerIDs {
		router := n.Routers[rid]
		ifCount := len(router.Interfaces)
		ifName := fmt.Sprintf("eth%d", ifCount)
		prefix := generateLinkPrefix(name, linkIdx)
		addr := generateLinkAddress(name, linkIdx)
		router.AddInterface(ifName, name, addr, prefix)
		linkIdx++
	}

	n.addEvent(EventLinkChange, "", fmt.Sprintf("Link %s added connecting %v", name, routerIDs), nil)
	n.broadcast("link_added", link)
	return nil
}

func generateLinkPrefix(linkName string, idx int) netip.Prefix {
	b1 := byte(len(linkName)*7 + idx)
	b2 := byte(idx*16 + 1)
	prefixStr := fmt.Sprintf("2001:db8:%02x%02x::/64", b1, b2)
	prefix, _ := netip.ParsePrefix(prefixStr)
	return prefix
}

func generateLinkAddress(linkName string, idx int) netip.Addr {
	b1 := byte(len(linkName)*7 + idx)
	b2 := byte(idx*16 + 1)
	addrStr := fmt.Sprintf("2001:db8:%02x%02x::%d", b1, b2, idx+1)
	addr, _ := netip.ParseAddr(addrStr)
	return addr
}

func (n *Network) SendRequest(fromRouter string, linkName string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	router, ok := n.Routers[fromRouter]
	if !ok {
		return
	}

	link, ok := n.Links[linkName]
	if !ok || !link.IsUp {
		return
	}

	var senderIF string
	for ifName, iface := range router.Interfaces {
		if iface.LinkName == linkName {
			senderIF = ifName
			break
		}
	}
	if senderIF == "" {
		return
	}

	req := RIPngMessage{
		Command:  CommandRequest,
		Entries:  []RouteEntry{},
		SenderID: fromRouter,
		FromIF:   senderIF,
	}

	n.addEvent(EventRequest, fromRouter, fmt.Sprintf("Router %s sends request on %s", fromRouter, linkName), req)
	n.Capture.Capture(PacketDirSend, fromRouter, "", linkName, req)

	for _, neighborID := range link.Routers {
		if neighborID == fromRouter {
			continue
		}
		if neighbor, ok := n.Routers[neighborID]; ok {
			var recvIF string
			for ifName, iface := range neighbor.Interfaces {
				if iface.LinkName == linkName {
					recvIF = ifName
					break
				}
			}
			if recvIF == "" {
				continue
			}
			recvMsg := req
			recvMsg.FromIF = recvIF
			n.Capture.Capture(PacketDirRecv, fromRouter, neighborID, linkName, recvMsg)
			events := neighbor.ProcessMessage(recvMsg)
			if len(events) > 0 {
				for _, e := range events {
					n.addEvent(EventRouteUpdate, neighborID, e.Detail, e)
				}
				n.broadcast("route_update", neighbor.GetSnapshot())
			}
		}
	}
}

func (n *Network) Step() {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.StepCount++

	for _, router := range n.Routers {
		events := router.Tick()
		if len(events) > 0 {
			for _, e := range events {
				n.addEvent(EventTimerTick, router.ID, e.Detail, e)
			}
			n.broadcast("route_update", router.GetSnapshot())
		}
	}

	if n.StepCount%DefaultUpdateInterval == 0 {
		n.sendPeriodicUpdates()
	}

	n.broadcast("step", map[string]interface{}{
		"step": n.StepCount,
	})
}

func (n *Network) sendPeriodicUpdates() {
	for _, link := range n.Links {
		if !link.IsUp {
			continue
		}

		for _, routerID := range link.Routers {
			router, ok := n.Routers[routerID]
			if !ok {
				continue
			}

			var senderIF string
			for ifName, iface := range router.Interfaces {
				if iface.LinkName == link.Name {
					senderIF = ifName
					break
				}
			}
			if senderIF == "" {
				continue
			}

			msg := router.GenerateUpdate(senderIF)
			n.addEvent(EventPeriodicUpdate, routerID, fmt.Sprintf("Router %s sends periodic update on %s (%d entries)", routerID, link.Name, len(msg.Entries)), msg)
			n.Capture.Capture(PacketDirSend, routerID, "", link.Name, msg)

			for _, neighborID := range link.Routers {
				if neighborID == routerID {
					continue
				}
				if neighbor, ok := n.Routers[neighborID]; ok {
					var recvIF string
					for ifName, iface := range neighbor.Interfaces {
						if iface.LinkName == link.Name {
							recvIF = ifName
							break
						}
					}
					if recvIF == "" {
						continue
					}
					recvMsg := msg
					recvMsg.FromIF = recvIF
					n.Capture.Capture(PacketDirRecv, routerID, neighborID, link.Name, recvMsg)
					events := neighbor.ProcessMessage(recvMsg)
					if len(events) > 0 {
						for _, e := range events {
							n.addEvent(EventRouteUpdate, neighborID, e.Detail, e)
						}
						n.broadcast("route_update", neighbor.GetSnapshot())
					}
				}
			}
		}
	}
}

func (n *Network) ToggleLink(linkName string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	link, ok := n.Links[linkName]
	if !ok {
		return
	}

	link.IsUp = !link.IsUp

	if !link.IsUp {
		for _, routerID := range link.Routers {
			router := n.Routers[routerID]
			for _, iface := range router.Interfaces {
				if iface.LinkName == linkName {
					iface.IsUp = false
				}
			}
			router.RemoveLinkRoutes(linkName)
		}
		n.addEvent(EventLinkChange, "", fmt.Sprintf("Link %s went DOWN", linkName), nil)
		n.broadcast("link_down", link)
	} else {
		for _, routerID := range link.Routers {
			router := n.Routers[routerID]
			for _, iface := range router.Interfaces {
				if iface.LinkName == linkName {
					iface.IsUp = true
				}
			}
		}
		n.addEvent(EventLinkChange, "", fmt.Sprintf("Link %s came UP", linkName), nil)
		n.broadcast("link_up", link)
	}

	for _, routerID := range link.Routers {
		n.broadcast("route_update", n.Routers[routerID].GetSnapshot())
	}
}

func (n *Network) AddStaticRoute(routerID string, prefix netip.Prefix) {
	n.mu.Lock()
	defer n.mu.Unlock()

	router, ok := n.Routers[routerID]
	if !ok {
		return
	}

	router.Table.AddLocalRoute(prefix, "static")
	n.addEvent(EventRouteUpdate, routerID, fmt.Sprintf("Added static route %s to %s", prefix.String(), routerID), nil)
	n.broadcast("route_update", router.GetSnapshot())
}

func (n *Network) AddAggregateRoute(routerID string, prefix netip.Prefix, aggregated []string, metric uint8) {
	n.mu.Lock()
	defer n.mu.Unlock()

	router, ok := n.Routers[routerID]
	if !ok {
		return
	}

	router.AddAggregateRoute(prefix, aggregated, metric)
	n.addEvent(EventRouteUpdate, routerID, fmt.Sprintf("Added aggregate route %s to %s (covers %d routes)", prefix.String(), routerID, len(aggregated)), nil)
	n.broadcast("route_update", router.GetSnapshot())
}

func (n *Network) RemoveAggregateRoute(routerID string, prefix netip.Prefix) bool {
	n.mu.Lock()
	defer n.mu.Unlock()

	router, ok := n.Routers[routerID]
	if !ok {
		return false
	}

	success := router.RemoveAggregateRoute(prefix)
	if success {
		n.addEvent(EventRouteUpdate, routerID, fmt.Sprintf("Removed aggregate route %s from %s", prefix.String(), routerID), nil)
		n.broadcast("route_update", router.GetSnapshot())
	}
	return success
}

func (n *Network) AutoAggregate(routerID string, minPrefixLen int) []netip.Prefix {
	n.mu.RLock()
	defer n.mu.RUnlock()

	router, ok := n.Routers[routerID]
	if !ok {
		return nil
	}

	return router.AutoAggregate(minPrefixLen)
}

func (n *Network) GetCapturePackets() []CapturedPacket {
	return n.Capture.GetPackets()
}

func (n *Network) ClearCapture() {
	n.Capture.Clear()
}

func (n *Network) SetCaptureEnabled(enabled bool) {
	n.Capture.SetEnabled(enabled)
}

func (n *Network) ExportCaptureJSON() ([]byte, error) {
	return n.Capture.ExportJSON()
}

func (n *Network) ExportCapturePCAP() ([]byte, error) {
	return n.Capture.ExportPCAP()
}

func (n *Network) GetSnapshot() map[string]interface{} {
	n.mu.RLock()
	defer n.mu.RUnlock()

	routers := make(map[string]RouterSnapshot)
	for id, r := range n.Routers {
		routers[id] = r.GetSnapshot()
	}

	links := make(map[string]*Link)
	for name, l := range n.Links {
		linkCopy := *l
		links[name] = &linkCopy
	}

	return map[string]interface{}{
		"routers": routers,
		"links":   links,
		"step":    n.StepCount,
		"running": n.Running,
		"events":  n.Events,
		"capture": map[string]interface{}{
			"enabled":      n.Capture.Enabled,
			"packet_count": len(n.Capture.Packets),
			"max_packets":  n.Capture.MaxPackets,
		},
	}
}

func (n *Network) RunStep() {
	n.Step()
}

func (n *Network) RunMultipleSteps(count int) {
	for i := 0; i < count; i++ {
		n.Step()
	}
}

func (n *Network) Reset() {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.resetLocked()
}

func (n *Network) resetLocked() {
	n.Routers = make(map[string]*Router)
	n.Links = make(map[string]*Link)
	n.Events = make([]SimEvent, 0)
	n.StepCount = 0
	n.Running = false
	n.Capture.Clear()

	n.broadcast("reset", nil)
}

func (n *Network) LoadPreset(name string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.resetLocked()

	switch name {
	case "linear":
		n.loadLinearPreset()
	case "triangle":
		n.loadTrianglePreset()
	case "complex":
		n.loadComplexPreset()
	}
}

func (n *Network) loadLinearPreset() {
	n.addRouterLocked("R1", SplitHorizonPoisonReverse)
	n.addRouterLocked("R2", SplitHorizonPoisonReverse)
	n.addRouterLocked("R3", SplitHorizonPoisonReverse)

	p1, _ := netip.ParsePrefix("2001:db8:1::/48")
	p2, _ := netip.ParsePrefix("2001:db8:2::/48")
	p3, _ := netip.ParsePrefix("2001:db8:3::/48")

	n.Routers["R1"].Table.AddLocalRoute(p1, "local")
	n.Routers["R2"].Table.AddLocalRoute(p2, "local")
	n.Routers["R3"].Table.AddLocalRoute(p3, "local")

	n.addLinkLocked("L1", []string{"R1", "R2"}, 1)
	n.addLinkLocked("L2", []string{"R2", "R3"}, 1)
}

func (n *Network) loadTrianglePreset() {
	routers := []string{"R1", "R2", "R3"}
	for _, id := range routers {
		n.addRouterLocked(id, SplitHorizonPoisonReverse)
	}

	prefixes := []string{"2001:db8:1::/48", "2001:db8:2::/48", "2001:db8:3::/48"}
	for i, id := range routers {
		p, _ := netip.ParsePrefix(prefixes[i])
		n.Routers[id].Table.AddLocalRoute(p, "local")
	}

	n.addLinkLocked("L1", []string{"R1", "R2"}, 1)
	n.addLinkLocked("L2", []string{"R2", "R3"}, 1)
	n.addLinkLocked("L3", []string{"R1", "R3"}, 2)
}

func (n *Network) loadComplexPreset() {
	routers := []string{"R1", "R2", "R3", "R4", "R5"}
	for _, id := range routers {
		n.addRouterLocked(id, SplitHorizonPoisonReverse)
	}

	prefixes := []string{"2001:db8:1::/48", "2001:db8:2::/48", "2001:db8:3::/48", "2001:db8:4::/48", "2001:db8:5::/48"}
	for i, id := range routers {
		p, _ := netip.ParsePrefix(prefixes[i])
		n.Routers[id].Table.AddLocalRoute(p, "local")
	}

	n.addLinkLocked("L1", []string{"R1", "R2"}, 1)
	n.addLinkLocked("L2", []string{"R2", "R3"}, 1)
	n.addLinkLocked("L3", []string{"R3", "R4"}, 1)
	n.addLinkLocked("L4", []string{"R4", "R5"}, 1)
	n.addLinkLocked("L5", []string{"R1", "R5"}, 3)
	n.addLinkLocked("L6", []string{"R2", "R4"}, 2)
}

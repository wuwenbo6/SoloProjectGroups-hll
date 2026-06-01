package ospf

import (
	"fmt"
	"time"
)

type LinkInfo struct {
	From         string    `json:"from"`
	To           string    `json:"to"`
	State        OspfState `json:"state"`
	InterfaceIP  string    `json:"interfaceIp"`
}

type Engine struct {
	Routers map[string]*Router
	Links   []LinkInfo
	Events  []EngineEvent
}

type EngineEvent struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type NeighborInfoJSON struct {
	RouterID      string    `json:"routerId"`
	State         OspfState `json:"state"`
	Priority      int       `json:"priority"`
	DR            string    `json:"dr"`
	BDR           string    `json:"bdr"`
	IsMaster      bool      `json:"isMaster"`
	DDSequenceNum uint32    `json:"ddSequenceNumber"`
}

type RouterDetail struct {
	ID            string            `json:"id"`
	RouterID      string            `json:"routerId"`
	AreaID        string            `json:"areaId"`
	HelloInterval int               `json:"helloInterval"`
	DeadInterval  int               `json:"deadInterval"`
	Interfaces    []InterfaceInfo   `json:"interfaces"`
	LSDB          []LSARef          `json:"lsdb"`
	Neighbors     []NeighborInfoJSON `json:"neighbors"`
	IPv6Prefixes  []IPv6Prefix      `json:"ipv6Prefixes"`
	RoutingTable  []RouteEntry      `json:"routingTable"`
}

func NewEngine() *Engine {
	e := &Engine{
		Routers: make(map[string]*Router),
		Links:   []LinkInfo{},
		Events:  []EngineEvent{},
	}

	e.Routers["r1"] = NewRouter("r1", "R1", "1.1.1.1", "0.0.0.0", 250, 200)
	e.Routers["r2"] = NewRouter("r2", "R2", "2.2.2.2", "0.0.0.0", 550, 200)
	e.Routers["r3"] = NewRouter("r3", "R3", "3.3.3.3", "0.0.0.0", 400, 420)

	pairs := [][2]string{{"r1", "r2"}, {"r2", "r3"}, {"r1", "r3"}}
	for _, p := range pairs {
		a, b := e.Routers[p[0]], e.Routers[p[1]]
		a.Neighbors[b.RouterID] = NewNeighbor(b.RouterID)
		b.Neighbors[a.RouterID] = NewNeighbor(a.RouterID)
		e.Links = append(e.Links, LinkInfo{
			From:        p[0],
			To:          p[1],
			State:       StateDown,
			InterfaceIP: a.RouterID,
		})
	}

	return e
}

func (e *Engine) GetTopology() ([]map[string]interface{}, []LinkInfo) {
	routers := []map[string]interface{}{}
	for _, r := range e.Routers {
		routers = append(routers, map[string]interface{}{
			"id":       r.ID,
			"name":     r.Name,
			"routerId": r.RouterID,
			"areaId":   r.AreaID,
			"x":        r.X,
			"y":        r.Y,
		})
	}
	return routers, e.Links
}

func (e *Engine) GetRouterDetail(routerID string) *RouterDetail {
	r, ok := e.Routers[routerID]
	if !ok {
		return nil
	}
	neighbors := []NeighborInfoJSON{}
	for _, n := range r.Neighbors {
		neighbors = append(neighbors, NeighborInfoJSON{
			RouterID:      n.RouterID,
			State:         n.State,
			Priority:      n.Priority,
			DR:            n.DR,
			BDR:           n.BDR,
			IsMaster:      n.IsMaster,
			DDSequenceNum: n.DDSequenceNum,
		})
	}
	return &RouterDetail{
		ID:            r.ID,
		RouterID:      r.RouterID,
		AreaID:        r.AreaID,
		HelloInterval: r.HelloInterval,
		DeadInterval:  r.DeadInterval,
		Interfaces:    r.Interfaces,
		LSDB:          r.LSDB,
		Neighbors:     neighbors,
		IPv6Prefixes:  r.IPv6Prefixes,
		RoutingTable:  r.RoutingTable,
	}
}

func (e *Engine) updateLinkState(from, to string) {
	for i := range e.Links {
		l := &e.Links[i]
		if (l.From == from && l.To == to) || (l.From == to && l.To == from) {
			r := e.Routers[from]
			if n, ok := r.Neighbors[e.Routers[to].RouterID]; ok {
				l.State = n.State
			}
			break
		}
	}
}

func (e *Engine) addEvent(typ string, payload interface{}) {
	e.Events = append(e.Events, EngineEvent{Type: typ, Payload: payload})
}

func (e *Engine) DrainEvents() []EngineEvent {
	events := e.Events
	e.Events = []EngineEvent{}
	return events
}

func (e *Engine) TriggerEvent(event OspfEvent, routerKey string, targetKey string) []EngineEvent {
	r, ok := e.Routers[routerKey]
	if !ok {
		return nil
	}

	switch event {
	case EventSendHello:
		e.processSendHello(r, targetKey)
	case EventSendDBD:
		e.processSendDBD(r, targetKey)
	case EventSendLSR:
		e.processSendLSR(r, targetKey)
	case EventSendLSU:
		e.processSendLSU(r, targetKey)
	case EventResetNeighbor:
		e.processResetNeighbor(r, targetKey)
	}

	return e.DrainEvents()
}

func (e *Engine) processSendHello(r *Router, targetKey string) {
	targets := []string{}
	if targetKey != "" {
		targets = []string{targetKey}
	} else {
		for k := range r.Neighbors {
			for rk, rv := range e.Routers {
				if rv.RouterID == k {
					targets = append(targets, rk)
				}
			}
		}
	}

	seen := []string{}
	for _, n := range r.Neighbors {
		if n.State != StateDown {
			seen = append(seen, n.RouterID)
		}
	}

	for _, tk := range targets {
		t, ok := e.Routers[tk]
		if !ok {
			continue
		}

		pkt := GenerateHello(r.RouterID, t.RouterID, r.HelloInterval, r.DeadInterval, r.RouterID, "0.0.0.0", seen)
		e.addEvent("packet_sent", pkt)

		n, ok := t.Neighbors[r.RouterID]
		if !ok {
			continue
		}

		oldState := n.State
		switch n.State {
		case StateDown:
			n.State = StateInit
			n.LastHelloTime = currentTimeMillis()
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   tk,
				"neighborId": r.RouterID,
				"oldState":   oldState,
				"newState":   StateInit,
			})
			pktRx := GenerateHello(r.RouterID, t.RouterID, r.HelloInterval, r.DeadInterval, r.RouterID, "0.0.0.0", seen)
			e.addEvent("packet_received", pktRx)

		case StateInit:
			selfInSeen := false
			for _, s := range seen {
				if s == t.RouterID {
					selfInSeen = true
					break
				}
			}
			if selfInSeen {
				n.State = State2Way
				e.addEvent("state_change", map[string]interface{}{
					"routerId":   tk,
					"neighborId": r.RouterID,
					"oldState":   oldState,
					"newState":   State2Way,
				})
			}
			pktRx := GenerateHello(r.RouterID, t.RouterID, r.HelloInterval, r.DeadInterval, r.RouterID, "0.0.0.0", seen)
			e.addEvent("packet_received", pktRx)

		default:
			n.LastHelloTime = currentTimeMillis()
			pktRx := GenerateHello(r.RouterID, t.RouterID, r.HelloInterval, r.DeadInterval, r.RouterID, "0.0.0.0", seen)
			e.addEvent("packet_received", pktRx)
		}

		e.updateLinkState(r.ID, tk)
	}

	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})
}

func (e *Engine) processSendDBD(r *Router, targetKey string) {
	if targetKey == "" {
		return
	}
	t, ok := e.Routers[targetKey]
	if !ok {
		return
	}

	n, ok := r.Neighbors[t.RouterID]
	if !ok {
		return
	}

	tn, _ := t.Neighbors[r.RouterID]

	switch n.State {
	case State2Way:
		oldState := n.State
		n.IsMaster = ElectMaster(r.RouterID, t.RouterID)
		if n.IsMaster {
			n.DDSequenceNum = GenerateRandomDDSeq()
		}
		n.State = StateExStart

		masterID := t.RouterID
		if n.IsMaster {
			masterID = r.RouterID
		}

		e.addEvent("state_change", map[string]interface{}{
			"routerId":   r.ID,
			"neighborId": t.RouterID,
			"oldState":   oldState,
			"newState":   StateExStart,
		})

		e.addEvent("log", map[string]interface{}{
			"message":   fmt.Sprintf("[%s] Master election: %s (Master) > %s (Slave)", r.Name, masterID, ternary(n.IsMaster, t.RouterID, r.RouterID).(string)),
			"level":     "info",
			"timestamp": currentTimeMillis(),
		})

		pkt := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, n.DDSequenceNum, "I|M|MS", 1500)
		pkt.Fields["masterRouter"] = masterID
		pkt.Fields["isMaster"] = n.IsMaster
		e.addEvent("packet_sent", pkt)

		pktRx := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, n.DDSequenceNum, "I|M|MS", 1500)
		pktRx.Fields["masterRouter"] = masterID
		pktRx.Fields["isMaster"] = !n.IsMaster
		e.addEvent("packet_received", pktRx)

		if tn != nil {
			tn.IsMaster = !n.IsMaster
			tn.DDSequenceNum = n.DDSequenceNum
			oldState2 := tn.State
			if oldState2 != StateExStart {
				tn.State = StateExStart
				e.addEvent("state_change", map[string]interface{}{
					"routerId":   targetKey,
					"neighborId": r.RouterID,
					"oldState":   oldState2,
					"newState":   StateExStart,
				})
			}
		}

	case StateExStart:
		oldState := n.State
		n.State = StateExchange

		var usedSeq uint32
		var flags string
		if n.IsMaster {
			n.DDSequenceNum++
			usedSeq = n.DDSequenceNum
			flags = "M"
		} else {
			usedSeq = n.DDSequenceNum
			flags = ""
		}

		e.addEvent("state_change", map[string]interface{}{
			"routerId":   r.ID,
			"neighborId": t.RouterID,
			"oldState":   oldState,
			"newState":   StateExchange,
		})

		roleStr := ternary(n.IsMaster, "Master", "Slave").(string)
		e.addEvent("log", map[string]interface{}{
			"message":   fmt.Sprintf("[%s] %s sending DBD seq=0x%08X", r.Name, roleStr, usedSeq),
			"level":     "info",
			"timestamp": currentTimeMillis(),
		})

		pkt := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, usedSeq, flags, 1500)
		pkt.Fields["role"] = roleStr
		e.addEvent("packet_sent", pkt)

		pktRx := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, usedSeq, flags, 1500)
		pktRx.Fields["role"] = ternary(n.IsMaster, "Slave", "Master").(string)
		e.addEvent("packet_received", pktRx)

		if tn != nil && tn.State != StateExchange {
			oldState2 := tn.State
			tn.State = StateExchange
			if !n.IsMaster {
				tn.DDSequenceNum = usedSeq
			}
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   targetKey,
				"neighborId": r.RouterID,
				"oldState":   oldState2,
				"newState":   StateExchange,
			})
		}

	case StateExchange:
		oldState := n.State
		n.State = StateLoading

		var usedSeq uint32
		if n.IsMaster {
			n.DDSequenceNum++
			usedSeq = n.DDSequenceNum
		} else {
			usedSeq = n.DDSequenceNum
		}

		e.addEvent("state_change", map[string]interface{}{
			"routerId":   r.ID,
			"neighborId": t.RouterID,
			"oldState":   oldState,
			"newState":   StateLoading,
		})

		roleStr := ternary(n.IsMaster, "Master", "Slave").(string)
		e.addEvent("log", map[string]interface{}{
			"message":   fmt.Sprintf("[%s] %s sending final DBD seq=0x%08X (exchange complete)", r.Name, roleStr, usedSeq),
			"level":     "info",
			"timestamp": currentTimeMillis(),
		})

		pkt := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, usedSeq, "", 1500)
		pkt.Fields["role"] = roleStr
		e.addEvent("packet_sent", pkt)

		pktRx := GenerateDBD(r.RouterID, t.RouterID, n.IsMaster, usedSeq, "", 1500)
		pktRx.Fields["role"] = ternary(n.IsMaster, "Slave", "Master").(string)
		e.addEvent("packet_received", pktRx)

		if tn != nil && tn.State != StateLoading {
			oldState2 := tn.State
			tn.State = StateLoading
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   targetKey,
				"neighborId": r.RouterID,
				"oldState":   oldState2,
				"newState":   StateLoading,
			})
		}
	}

	e.updateLinkState(r.ID, targetKey)
	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})
}

func (e *Engine) processSendLSR(r *Router, targetKey string) {
	if targetKey == "" {
		return
	}
	t, ok := e.Routers[targetKey]
	if !ok {
		return
	}

	n, ok := r.Neighbors[t.RouterID]
	if !ok {
		return
	}

	if n.State == StateLoading {
		pkt := GenerateLSR(r.RouterID, t.RouterID, n.LSRequestList)
		e.addEvent("packet_sent", pkt)
		pktRx := GenerateLSR(r.RouterID, t.RouterID, n.LSRequestList)
		e.addEvent("packet_received", pktRx)
	}

	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})
}

func (e *Engine) processSendLSU(r *Router, targetKey string) {
	if targetKey == "" {
		return
	}
	t, ok := e.Routers[targetKey]
	if !ok {
		return
	}

	n, ok := r.Neighbors[t.RouterID]
	if !ok {
		return
	}

	if n.State == StateLoading {
		oldState := n.State
		n.State = StateFull
		e.addEvent("state_change", map[string]interface{}{
			"routerId":   r.ID,
			"neighborId": t.RouterID,
			"oldState":   oldState,
			"newState":   StateFull,
		})

		pkt := GenerateLSU(r.RouterID, t.RouterID, n.LSUpdateList, nil)
		e.addEvent("packet_sent", pkt)
		pktRx := GenerateLSU(r.RouterID, t.RouterID, n.LSUpdateList, nil)
		e.addEvent("packet_received", pktRx)

		ack := GenerateLSAck(r.RouterID, t.RouterID)
		e.addEvent("packet_sent", ack)

		tn, ok := t.Neighbors[r.RouterID]
		if ok && tn.State != StateFull {
			oldState2 := tn.State
			tn.State = StateFull
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   targetKey,
				"neighborId": r.RouterID,
				"oldState":   oldState2,
				"newState":   StateFull,
			})
		}

		e.floodLSAs(r, t)
	}

	e.updateLinkState(r.ID, targetKey)
	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})
}

func (e *Engine) floodLSAs(source, target *Router) {
	source.incrementLSASequence(source.RouterID)

	selfLSA := source.RouterLSAs[source.RouterID].LSARef
	selfPrefixes := source.IPv6Prefixes

	if target.installLSA(selfLSA) {
		e.addEvent("lsa_flooded", map[string]interface{}{
			"fromRouter": source.ID,
			"toRouter":   target.ID,
			"lsa":        selfLSA,
			"lsaType":    selfLSA.Type,
		})
		e.addEvent("log", map[string]interface{}{
			"message": fmt.Sprintf("[%s] LSA flooded to %s: %s (Seq: 0x%08X)",
				source.RouterID, target.RouterID, selfLSA.Type, selfLSA.Sequence),
			"level": "info",
			"type":  "lsa_flood",
		})

		floodPkt := GenerateLSU(source.RouterID, target.RouterID, []LSARef{selfLSA}, selfPrefixes)
		e.addEvent("packet_sent", floodPkt)

		for _, prefix := range selfPrefixes {
			if target.installPrefix(prefix) {
				e.addEvent("prefix_installed", map[string]interface{}{
					"toRouter":    target.ID,
					"prefix":      prefix.Prefix,
					"prefixLen":   prefix.PrefixLen,
					"advRouter":   prefix.AdvRouter,
					"routeType":   prefix.RouteType,
				})
			}
		}

		target.rebuildRoutingTable()
		e.addEvent("routing_table_update", map[string]interface{}{
			"routerId":    target.ID,
			"routingTable": target.RoutingTable,
		})
	}

	for neighborKey, neighbor := range e.Routers {
		if neighborKey == target.ID || neighborKey == source.ID {
			continue
		}

		nt, ok := neighbor.Neighbors[source.RouterID]
		if !ok || nt.State != StateFull {
			continue
		}

		if neighbor.installLSA(selfLSA) {
			e.addEvent("lsa_flooded", map[string]interface{}{
				"fromRouter": source.ID,
				"toRouter":   neighbor.ID,
				"lsa":        selfLSA,
				"lsaType":    selfLSA.Type,
			})
			e.addEvent("log", map[string]interface{}{
				"message": fmt.Sprintf("[%s] LSA flooded to %s: %s (Seq: 0x%08X)",
					source.RouterID, neighbor.RouterID, selfLSA.Type, selfLSA.Sequence),
				"level": "info",
				"type":  "lsa_flood",
			})

			floodPkt := GenerateLSU(source.RouterID, neighbor.RouterID, []LSARef{selfLSA}, selfPrefixes)
			e.addEvent("packet_sent", floodPkt)

			for _, prefix := range selfPrefixes {
				if neighbor.installPrefix(prefix) {
					e.addEvent("prefix_installed", map[string]interface{}{
						"toRouter":    neighbor.ID,
						"prefix":      prefix.Prefix,
						"prefixLen":   prefix.PrefixLen,
						"advRouter":   prefix.AdvRouter,
						"routeType":   prefix.RouteType,
					})
				}
			}

			neighbor.rebuildRoutingTable()
			e.addEvent("routing_table_update", map[string]interface{}{
				"routerId":     neighbor.ID,
				"routingTable": neighbor.RoutingTable,
			})
		}
	}
}

func (e *Engine) processResetNeighbor(r *Router, targetKey string) {
	targets := []string{}
	if targetKey != "" {
		targets = []string{targetKey}
	} else {
		for k := range r.Neighbors {
			for rk, rv := range e.Routers {
				if rv.RouterID == k {
					targets = append(targets, rk)
				}
			}
		}
	}

	for _, tk := range targets {
		t, ok := e.Routers[tk]
		if !ok {
			continue
		}
		n, ok := r.Neighbors[t.RouterID]
		if !ok {
			continue
		}
		oldState := n.State
		if oldState != StateDown {
			n.State = StateDown
			n.IsMaster = false
			n.DDSequenceNum = 0x80000001
			n.LSRequestList = []LSARef{}
			n.LSUpdateList = []LSARef{}
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   r.ID,
				"neighborId": t.RouterID,
				"oldState":   oldState,
				"newState":   StateDown,
			})
		}

		tn, ok := t.Neighbors[r.RouterID]
		if ok && tn.State != StateDown {
			oldState2 := tn.State
			tn.State = StateDown
			tn.IsMaster = false
			tn.DDSequenceNum = 0x80000001
			tn.LSRequestList = []LSARef{}
			tn.LSUpdateList = []LSARef{}
			e.addEvent("state_change", map[string]interface{}{
				"routerId":   tk,
				"neighborId": r.RouterID,
				"oldState":   oldState2,
				"newState":   StateDown,
			})
		}

		e.updateLinkState(r.ID, tk)
	}

	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})
}

func (e *Engine) ResetAll() []EngineEvent {
	for _, r := range e.Routers {
		for _, n := range r.Neighbors {
			if n.State != StateDown {
				e.addEvent("state_change", map[string]interface{}{
					"routerId":   r.ID,
					"neighborId": n.RouterID,
					"oldState":   n.State,
					"newState":   StateDown,
				})
				n.State = StateDown
				n.IsMaster = false
				n.DDSequenceNum = 0x80000001
				n.LSRequestList = []LSARef{}
				n.LSUpdateList = []LSARef{}
			}
		}
	}

	for i := range e.Links {
		e.Links[i].State = StateDown
	}

	e.addEvent("topology_update", map[string]interface{}{
		"routers": func() []map[string]interface{} {
			rs, _ := e.GetTopology()
			return rs
		}(),
		"links": e.Links,
	})

	return e.DrainEvents()
}

func (e *Engine) AutoDemo(routerKey string, targetKey string) [][]EngineEvent {
	allEvents := [][]EngineEvent{}

	steps := []struct {
		event OspfEvent
		desc  string
	}{
		{EventSendHello, "Step 1: R1 sends Hello → R2 goes Down→Init"},
		{EventSendHello, "Step 2: R2 sends Hello (with R1 seen) → R1 goes Init→2-Way"},
		{EventSendDBD, "Step 3: R1 sends DBD (ExStart) → 2-Way→ExStart"},
		{EventSendDBD, "Step 4: DBD negotiation → ExStart→Exchange"},
		{EventSendDBD, "Step 5: DBD exchange complete → Exchange→Loading"},
		{EventSendLSR, "Step 6: R1 sends LSR (request missing LSAs)"},
		{EventSendLSU, "Step 7: R2 sends LSU → Loading→Full"},
	}

	for _, step := range steps {
		events := e.TriggerEvent(step.event, routerKey, targetKey)
		e.addEvent("log", map[string]interface{}{
			"message":   step.desc,
			"level":     "info",
			"timestamp": currentTimeMillis(),
		})
		allEvents = append(allEvents, events)
	}

	finalLog := e.DrainEvents()
	if len(finalLog) > 0 {
		allEvents = append(allEvents, finalLog)
	}

	return allEvents
}

func currentTimeMillis() int64 {
	return time.Now().UnixMilli()
}

func ternary(cond bool, a, b interface{}) interface{} {
	if cond {
		return a
	}
	return b
}

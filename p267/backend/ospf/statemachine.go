package ospf

type StateTransition struct {
	From      OspfState
	To        OspfState
	Event     string
	PacketIn  OspfPacketType
}

var ValidTransitions = []StateTransition{
	{StateDown, StateInit, "recvHello", PacketHello},
	{StateInit, State2Way, "recvHelloWithSelf", PacketHello},
	{State2Way, StateExStart, "startAdjacency", PacketDBD},
	{StateExStart, StateExchange, "negotiationDone", PacketDBD},
	{StateExchange, StateLoading, "dbdComplete", PacketDBD},
	{StateExchange, StateFull, "noLSANeeded", PacketDBD},
	{StateLoading, StateFull, "lsaSyncComplete", PacketLSU},
	{StateDown, StateDown, "neighborTimeout", PacketHello},
	{StateInit, StateDown, "neighborTimeout", PacketHello},
	{State2Way, StateDown, "neighborTimeout", PacketHello},
	{StateExStart, StateDown, "neighborTimeout", PacketHello},
	{StateExchange, StateDown, "neighborTimeout", PacketHello},
	{StateLoading, StateDown, "neighborTimeout", PacketHello},
	{StateFull, StateDown, "neighborTimeout", PacketHello},
}

func CanTransition(current OspfState, target OspfState) bool {
	for _, t := range ValidTransitions {
		if t.From == current && t.To == target {
			return true
		}
	}
	return target == StateDown
}

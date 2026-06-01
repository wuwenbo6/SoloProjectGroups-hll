package ospf

import (
	"math/rand"
	"strconv"
	"strings"
	"time"
)

type OspfState string

const (
	StateDown     OspfState = "Down"
	StateInit     OspfState = "Init"
	State2Way     OspfState = "2-Way"
	StateExStart  OspfState = "ExStart"
	StateExchange OspfState = "Exchange"
	StateLoading  OspfState = "Loading"
	StateFull     OspfState = "Full"
)

var StateOrder = []OspfState{
	StateDown,
	StateInit,
	State2Way,
	StateExStart,
	StateExchange,
	StateLoading,
	StateFull,
}

func StateIndex(s OspfState) int {
	for i, st := range StateOrder {
		if st == s {
			return i
		}
	}
	return -1
}

type OspfPacketType string

const (
	PacketHello OspfPacketType = "Hello"
	PacketDBD   OspfPacketType = "DBD"
	PacketLSR   OspfPacketType = "LSR"
	PacketLSU   OspfPacketType = "LSU"
	PacketLSAck OspfPacketType = "LSAck"
)

type OspfEvent string

const (
	EventSendHello      OspfEvent = "send_hello"
	EventSendDBD        OspfEvent = "send_dbd"
	EventSendLSR        OspfEvent = "send_lsr"
	EventSendLSU        OspfEvent = "send_lsu"
	EventResetNeighbor  OspfEvent = "reset_neighbor"
	EventStartAuto      OspfEvent = "start_auto"
)

type Neighbor struct {
	RouterID        string    `json:"routerId"`
	State           OspfState `json:"state"`
	Priority        int       `json:"priority"`
	DR              string    `json:"dr"`
	BDR             string    `json:"bdr"`
	IsMaster        bool      `json:"isMaster"`
	DDSequenceNum   uint32    `json:"ddSequenceNumber"`
	DBDSummaryList  []string  `json:"dbdSummaryList"`
	LSRequestList   []LSARef  `json:"lsRequestList"`
	LSUpdateList    []LSARef  `json:"lsUpdateList"`
	LastHelloTime   int64     `json:"lastHelloTime"`
}

func NewNeighbor(routerID string) *Neighbor {
	return &Neighbor{
		RouterID:       routerID,
		State:          StateDown,
		Priority:       1,
		DDSequenceNum:  0x80000001,
		DBDSummaryList: []string{},
		LSRequestList:  []LSARef{},
		LSUpdateList:   []LSARef{},
	}
}

func CompareRouterID(a, b string) int {
	aParts := strings.Split(a, ".")
	bParts := strings.Split(b, ".")
	for i := 0; i < 4; i++ {
		ai, _ := strconv.Atoi(aParts[i])
		bi, _ := strconv.Atoi(bParts[i])
		if ai > bi {
			return 1
		}
		if ai < bi {
			return -1
		}
	}
	return 0
}

func ElectMaster(localID, remoteID string) (localIsMaster bool) {
	return CompareRouterID(localID, remoteID) > 0
}

func GenerateRandomDDSeq() uint32 {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return 0x80000000 + uint32(r.Intn(0x7FFFFFFF))
}

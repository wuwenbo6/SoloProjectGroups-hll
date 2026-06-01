package main

import "time"

type GateState string
type SRPStatus string
type TalkerStatus string
type ListenerStatus string

const (
	GateOpen  GateState = "OPEN"
	GateClose GateState = "CLOSE"
)

const (
	SRPStatusPending   SRPStatus = "PENDING"
	SRPStatusReserved  SRPStatus = "RESERVED"
	SRPStatusFailed    SRPStatus = "FAILED"
)

const (
	TalkerStatusReady    TalkerStatus = "READY"
	TalkerStatusFailed   TalkerStatus = "FAILED"
)

const (
	ListenerStatusReady    ListenerStatus = "READY"
	ListenerStatusFailed   ListenerStatus = "FAILED"
)

type SRPTalker struct {
	StreamID          string  `json:"streamId"`
	DestMAC           string  `json:"destMac"`
	VLANID            int     `json:"vlanId"`
	MaxFrameSize      int     `json:"maxFrameSize"`
	MaxIntervalFrames int     `json:"maxIntervalFrames"`
	DataFramePriority int     `json:"dataFramePriority"`
	Rank              string  `json:"rank"`
	EndStationMAC     string  `json:"endStationMac"`
	Status            TalkerStatus `json:"status"`
}

type SRPListener struct {
	StreamID          string         `json:"streamId"`
	EndStationMAC     string         `json:"endStationMac"`
	Status            ListenerStatus `json:"status"`
}

type SRPStream struct {
	StreamID          string    `json:"streamId"`
	StreamName        string    `json:"streamName"`
	Talker            SRPTalker `json:"talker"`
	Listeners         []SRPListener `json:"listeners"`
	RequiredBandwidth float64   `json:"requiredBandwidth"`
	ReservedBandwidth float64   `json:"reservedBandwidth"`
	Priority          int       `json:"priority"`
	Status            SRPStatus `json:"status"`
	FailureReason     string    `json:"failureReason,omitempty"`
}

type SRPReservationRequest struct {
	Streams []SRPStream `json:"streams"`
}

type SRPReservationResult struct {
	Streams           []SRPStream `json:"streams"`
	TotalRequested    float64     `json:"totalRequested"`
	TotalReserved     float64     `json:"totalReserved"`
	RemainingBandwidth float64    `json:"remainingBandwidth"`
	SuccessCount      int         `json:"successCount"`
	FailureCount      int         `json:"failureCount"`
}

type GateControlEntry struct {
	Operation   GateState `json:"operation"`
	TimeInterval int64    `json:"timeInterval"`
}

type QueueConfig struct {
	QueueID         int                 `json:"queueId"`
	Priority        int                 `json:"priority"`
	GateControlList []GateControlEntry  `json:"gateControlList"`
	Bandwidth       float64             `json:"bandwidth"`
	GuardBand       int64               `json:"guardBand"`
}

type TrafficFlow struct {
	FlowID        string    `json:"flowId"`
	FlowType      string    `json:"flowType"`
	SourceIP      string    `json:"sourceIp"`
	DestIP        string    `json:"destIp"`
	FrameSize     int       `json:"frameSize"`
	Interval      int64     `json:"interval"`
	Priority      int       `json:"priority"`
	StartTime     int64     `json:"startTime"`
}

type Frame struct {
	FrameID     string    `json:"frameId"`
	FlowID      string    `json:"flowId"`
	FlowType    string    `json:"flowType"`
	Size        int       `json:"size"`
	EnqueueTime int64     `json:"enqueueTime"`
	DequeueTime int64     `json:"dequeueTime"`
	QueueID     int       `json:"queueId"`
	Priority    int       `json:"priority"`
	Delay       int64     `json:"delay"`
}

type SimulationConfig struct {
	Duration      int64         `json:"duration"`
	TimeSlot      int64         `json:"timeSlot"`
	PortBandwidth float64       `json:"portBandwidth"`
	Queues        []QueueConfig `json:"queues"`
	Flows         []TrafficFlow `json:"flows"`
}

type SimulationResult struct {
	TotalFrames     int       `json:"totalFrames"`
	Transmitted     int       `json:"transmitted"`
	Dropped         int       `json:"dropped"`
	AvgDelay        float64   `json:"avgDelay"`
	MaxDelay        int64     `json:"maxDelay"`
	Frames          []Frame   `json:"frames"`
	GateEvents      []GateEvent `json:"gateEvents"`
	QueueStats      []QueueStat `json:"queueStats"`
}

type GateEvent struct {
	Time     int64  `json:"time"`
	QueueID  int    `json:"queueId"`
	State    string `json:"state"`
}

type QueueStat struct {
	QueueID       int   `json:"queueId"`
	Enqueued      int   `json:"enqueued"`
	Dequeued      int   `json:"dequeued"`
	Dropped       int   `json:"dropped"`
	AvgQueueDepth float64 `json:"avgQueueDepth"`
	MaxQueueDepth int   `json:"maxQueueDepth"`
}

type SimTime struct {
	Current int64
}

func (st *SimTime) Tick(delta int64) {
	st.Current += delta
}

func NanoToMicro(nano int64) int64 {
	return nano / int64(time.Microsecond)
}

func MicroToNano(micro int64) int64 {
	return micro * int64(time.Microsecond)
}

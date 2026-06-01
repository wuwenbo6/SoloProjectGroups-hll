package mtp2

type MTP2State string

const (
	StateIdle      MTP2State = "IDLE"
	StateEstablish MTP2State = "ESTABLISH"
	StateTraffic   MTP2State = "TRAFFIC"
	StateRestore   MTP2State = "RESTORE"
)

type MessageType string

const (
	FISU MessageType = "FISU"
	LSSU MessageType = "LSSU"
	MSU  MessageType = "MSU"
)

type LSSUStatus string

const (
	LSSUOutOfService LSSUStatus = "OUT_OF_SERVICE"
	LSSUInService    LSSUStatus = "IN_SERVICE"
	LSSUNormal       LSSUStatus = "NORMAL"
	LSSUEmergency    LSSUStatus = "EMERGENCY"
	LSSUBusy         LSSUStatus = "BUSY"
)

type SyncStatus string

const (
	SyncInSync  SyncStatus = "IN_SYNC"
	SyncOutSync SyncStatus = "OUT_OF_SYNC"
)

type TimerType string

const (
	TimerT1 TimerType = "T1"
	TimerT3 TimerType = "T3"
)

type SignalUnit struct {
	Type      MessageType `json:"type"`
	Sequence  int         `json:"sequence"`
	Timestamp int64       `json:"timestamp"`
	FSN       int         `json:"fsn"`
	BSN       int         `json:"bsn"`
	FIB       bool        `json:"fib"`
	BIB       bool        `json:"bib"`
	Length    int         `json:"length"`
	Status    string      `json:"status,omitempty"`
	SIO       byte        `json:"sio,omitempty"`
	SI        string      `json:"si,omitempty"`
	Payload   string      `json:"payload,omitempty"`
	Hex       string      `json:"hex"`
}

type StateTransition struct {
	From      MTP2State `json:"from"`
	To        MTP2State `json:"to"`
	Timestamp int64     `json:"timestamp"`
	Reason    string    `json:"reason"`
}

type TimerEvent struct {
	Timer     TimerType `json:"timer"`
	Action    string    `json:"action"`
	Retries   int       `json:"retries,omitempty"`
	MaxRetries int      `json:"max_retries,omitempty"`
	Timestamp int64     `json:"timestamp"`
}

type FSNValidationResult struct {
	Valid       bool   `json:"valid"`
	ExpectedFSN int    `json:"expected_fsn"`
	ReceivedFSN int    `json:"received_fsn"`
	Reason      string `json:"reason"`
}

type LinkStats struct {
	TotalSent         int     `json:"total_sent"`
	LostFrames        int     `json:"lost_frames"`
	Retransmitted     int     `json:"retransmitted"`
	FrameLossRate     float64 `json:"frame_loss_rate"`
	RetransmitRate    float64 `json:"retransmit_rate"`
	T1Retransmissions int     `json:"t1_retransmissions"`
	T3Retransmissions int     `json:"t3_retransmissions"`
}

type SimulatorEvent struct {
	Event       string            `json:"event"`
	State       MTP2State         `json:"state,omitempty"`
	Message     *SignalUnit       `json:"message,omitempty"`
	Transition  *StateTransition  `json:"transition,omitempty"`
	Timer       *TimerEvent       `json:"timer,omitempty"`
	FSNResult   *FSNValidationResult `json:"fsn_result,omitempty"`
	SyncStatus  SyncStatus        `json:"sync_status,omitempty"`
	LinkStats   *LinkStats        `json:"link_stats,omitempty"`
	Timestamp   int64             `json:"timestamp"`
}

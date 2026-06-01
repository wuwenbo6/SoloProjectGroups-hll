package model

import (
	"sync"
	"time"
)

type NodeType string

const (
	NodeTypeHCA     NodeType = "HCA"
	NodeTypeSwitch  NodeType = "Switch"
	NodeTypeRouter  NodeType = "Router"
)

type PortState string

const (
	PortStateDown     PortState = "Down"
	PortStateInit     PortState = "Init"
	PortStateArmed    PortState = "Armed"
	PortStateActive   PortState = "Active"
)

type LID uint16
type GID [16]byte

type GUID uint64

type Node struct {
	sync.RWMutex
	GUID        GUID                 `json:"guid"`
	NodeType    NodeType             `json:"node_type"`
	Name        string               `json:"name"`
	LID         LID                  `json:"lid"`
	NumPorts    int                  `json:"num_ports"`
	Ports       map[int]*Port        `json:"ports"`
	SystemImageGUID GUID             `json:"system_image_guid"`
	VendorID    uint16               `json:"vendor_id"`
	DeviceID    uint16               `json:"device_id"`
	Revision    uint8                `json:"revision"`
}

type LinkTrainingState string

const (
	LTStateIdle          LinkTrainingState = "Idle"
	LTStatePolling       LinkTrainingState = "Polling"
	LTStateConfiguration LinkTrainingState = "Configuration"
	LTStateTraining      LinkTrainingState = "Training"
	LTStateBringUp       LinkTrainingState = "BringUp"
	LTStateOperational   LinkTrainingState = "Operational"
)

type Port struct {
	sync.RWMutex
	PortNum         int               `json:"port_num"`
	State           PortState         `json:"state"`
	PhysicalState   string            `json:"physical_state"`
	LinkWidth       string            `json:"link_width"`
	LinkSpeed       string            `json:"link_speed"`
	NeighborGUID    GUID              `json:"neighbor_guid"`
	NeighborPort    int               `json:"neighbor_port"`
	Rate            uint64            `json:"rate"`
	Errors          PortErrors        `json:"errors"`
	Counters        PortCounters      `json:"counters"`
	Congestion      CongestionStats   `json:"congestion"`
	LastChange      time.Time         `json:"last_change"`
	TrainingState   LinkTrainingState `json:"training_state"`
	TrainingProgress int              `json:"training_progress"`
	LFTConfigured   bool              `json:"lft_configured"`
	LFTConfigBlock  int               `json:"lft_config_block"`
	LFTConfigTotal  int               `json:"lft_config_total"`
}

type PortErrors struct {
	SymbolErrors        uint64 `json:"symbol_errors"`
	LinkErrorRecovery   uint64 `json:"link_error_recovery"`
	LinkDowned          uint64 `json:"link_downed"`
	RcvErrors           uint64 `json:"rcv_errors"`
	RcvRemotePhysicalErrors uint64 `json:"rcv_remote_physical_errors"`
	RcvSwitchRelayErrors uint64 `json:"rcv_switch_relay_errors"`
	XmtDiscards         uint64 `json:"xmt_discards"`
	LocalLinkIntegrityErrors uint64 `json:"local_link_integrity_errors"`
	ExcessiveBufferOverruns uint64 `json:"excessive_buffer_overruns"`
}

type PortCounters struct {
	XmtData       uint64    `json:"xmt_data"`
	RcvData       uint64    `json:"rcv_data"`
	XmtPkts       uint64    `json:"xmt_pkts"`
	RcvPkts       uint64    `json:"rcv_pkts"`
	XmtWait       uint64    `json:"xmt_wait"`
	LastUpdate    time.Time `json:"last_update"`
}

type CongestionStats struct {
	XmitWaitDepth   uint64    `json:"xmit_wait_depth"`
	RcvWaitDepth    uint64    `json:"rcv_wait_depth"`
	MarkedPkts      uint64    `json:"marked_pkts"`
	DroppedPkts     uint64    `json:"dropped_pkts"`
	CongestionLevel float64   `json:"congestion_level"`
	Utilization     float64   `json:"utilization"`
	LastUpdate      time.Time `json:"last_update"`
}

type RoutingMode string

const (
	RoutingModeMinHop    RoutingMode = "min_hop"
	RoutingModeAdaptive  RoutingMode = "adaptive"
	RoutingModeUpDown    RoutingMode = "up_down"
	RoutingModeFatTree   RoutingMode = "fat_tree"
)

type AdaptiveRoutingConfig struct {
	Enabled              bool    `json:"enabled"`
	CongestionThreshold  float64 `json:"congestion_threshold"`
	MinPathDifference    int     `json:"min_path_difference"`
	RebalanceInterval    int     `json:"rebalance_interval"`
	MaxPathChanges       int     `json:"max_path_changes"`
	UseFCN               bool    `json:"use_fcn"`
	UseVL15              bool    `json:"use_vl15"`
}

type OpenSMConfig struct {
	SmGUID              GUID      `json:"sm_guid"`
	Priority            int       `json:"priority"`
	RoutingEngine       string    `json:"routing_engine"`
	AdaptiveRouting     AdaptiveRoutingConfig `json:"adaptive_routing"`
	LMC                 int       `json:"lmc"`
	MTU                 int       `json:"mtu"`
	VLCount             int       `json:"vl_count"`
	SL2VLMap            []int     `json:"sl2vl_map"`
	QOSLevels           []QOSLevel `json:"qos_levels"`
	PartitionKeys       []uint16  `json:"partition_keys"`
	SAEnabled           bool      `json:"sa_enabled"`
	PerfMgrEnabled      bool      `json:"perf_mgr_enabled"`
	EventPlugin         string    `json:"event_plugin"`
	LogLevel            string    `json:"log_level"`
}

type QOSLevel struct {
	SL       uint8  `json:"sl"`
	Priority uint8  `json:"priority"`
	FlowControl bool `json:"flow_control"`
	VL       uint8  `json:"vl"`
}

type Link struct {
	FromGUID  GUID `json:"from_guid"`
	FromPort  int  `json:"from_port"`
	ToGUID    GUID `json:"to_guid"`
	ToPort    int  `json:"to_port"`
	Active    bool `json:"active"`
	Bandwidth uint64 `json:"bandwidth"`
}

type DLIDMapping struct {
	DLID        LID   `json:"dlid"`
	OutPort     int   `json:"out_port"`
	Path        []LID `json:"path"`
	HopCount    int   `json:"hop_count"`
}

type RouteTable struct {
	SwitchGUID GUID                   `json:"switch_guid"`
	Entries    map[LID]*DLIDMapping   `json:"entries"`
}

type NodeInfo struct {
	GUID             GUID     `json:"guid"`
	NodeType         NodeType `json:"node_type"`
	Name             string   `json:"name"`
	LID              LID      `json:"lid"`
	NumPorts         int      `json:"num_ports"`
	SystemImageGUID  GUID     `json:"system_image_guid"`
	VendorID         uint16   `json:"vendor_id"`
	DeviceID         uint16   `json:"device_id"`
	Revision         uint8    `json:"revision"`
	LocalPortNum     uint8    `json:"local_port_num"`
	VendorOUI        [3]byte  `json:"vendor_oui"`
}

type PortInfo struct {
	PortNum         int       `json:"port_num"`
	State           PortState `json:"state"`
	PhysicalState   string    `json:"physical_state"`
	LinkWidth       string    `json:"link_width"`
	LinkSpeed       string    `json:"link_speed"`
	MKey            uint64    `json:"m_key"`
	MKeyLeasePeriod uint32    `json:"m_key_lease_period"`
	LID             LID       `json:"lid"`
	MasterSM_LID    LID       `json:"master_sm_lid"`
	CapabilityMask  uint32    `json:"capability_mask"`
}

type SMPMessage struct {
	Version     uint8
	MsgType     uint8
	Status      uint16
	ClassVersion uint8
	Method      uint8
	Status2     uint8
	HOpbits     uint8
	AttributeID uint16
	Reserved    uint16
	AttributeModifier uint32
}

const (
	SubnGetNodeInfo   uint16 = 0x0011
	SubnGetPortInfo   uint16 = 0x0015
	SubnGetLFT        uint16 = 0x0037
	SubnGetPKeyTable  uint16 = 0x0039
	SubnAdmSetLFT     uint16 = 0x0036
	SubnGetReply      uint16 = 0x0081
	SubnAdmSet        uint8  = 0x02
	SubnGet           uint8  = 0x01
)

type SMPMethod uint8

const (
	MethodGet SMPMethod = 0x01
	MethodSet SMPMethod = 0x02
)

type SMPEvent struct {
	Timestamp time.Time `json:"timestamp"`
	Type      string    `json:"type"`
	Message   string    `json:"message"`
	NodeGUID  GUID      `json:"node_guid"`
	PortNum   int       `json:"port_num,omitempty"`
}

type Topology struct {
	Nodes     map[GUID]*Node    `json:"nodes"`
}

type SubnetTopology struct {
	Nodes     map[GUID]*Node    `json:"nodes"`
	Links     []*Link           `json:"links"`
	Timestamp time.Time         `json:"timestamp"`
}

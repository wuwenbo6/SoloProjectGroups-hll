package fip

import "time"

const (
	FCOE_ETHERTYPE        = 0x8906
	FIP_ETHERTYPE         = 0x8914
	FIP_VLAN_DISCOVERY    = 1
	FIP_VLAN_NOTIFICATION = 2
	FIP_FKA_ADV           = 3
	FIP_DISC_SOL          = 4
	FIP_DISC_REQ          = 5
	FIP_DISC_RSP          = 6
	FIP_LOGO              = 7
	FIP_CLS               = 8

	VN2VN_MODE = "VN2VN"

	DEFAULT_VFID_TTL = 30

	FPMA_OUI = "0E:FC"
)

type VFIDEntry struct {
	ID        string
	VFID      int
	PortID    string
	PortName  string
	CreatedAt time.Time
	TTL       int
	ExpiresAt time.Time
	Alive     bool
}

type VNPort struct {
	ID            string
	Name          string
	MAC           string
	FPMA          string
	WWPN          string
	WWNN          string
	VLANs         []int
	State         string
	PeerPorts     map[string]*VirtualLink
	Negotiation   *NegotiationParams
	Priority      int
	IsPrimary     bool
	PrimaryPortID string
}

type SessionEntry struct {
	ID            string
	SourceID      string
	SourceName    string
	SourceMAC     string
	SourceFPMA    string
	SourceWWPN    string
	DestID        string
	DestName      string
	DestMAC       string
	DestFPMA      string
	DestWWPN      string
	VLANID        int
	State         string
	CreatedAt     time.Time
	ExpiresAt     time.Time
	Params        *NegotiationParams
	TrafficStats  TrafficStats
}

type TrafficStats struct {
	TXFrames  uint64
	RXFrames  uint64
	TXBytes   uint64
	RXBytes   uint64
}

type NegotiationParams struct {
	FC4Types    []string
	MaxRXSize   int
	MaxTXSize   int
	ED_TOV      time.Duration
	RA_TOV      time.Duration
	FSPFEnabled bool
	BB_Credit   int
}

type VirtualLink struct {
	ID        string
	SourceID  string
	DestID    string
	VLANID    int
	State     string
	CreatedAt time.Time
	Params    *NegotiationParams
}

type FIPMessage struct {
	Opcode    int
	SrcMAC    string
	DstMAC    string
	VLANID    int
	WWPN      string
	WWNN      string
	Params    *NegotiationParams
	Timestamp time.Time
}

type ElectionResult struct {
	PrimaryID   string
	PrimaryName string
	Priority    int
	Timestamp   time.Time
	PortVotes   map[string]int
}

type Event struct {
	Type      string
	Message   string
	PortID    string
	PeerID    string
	VLANID    int
	Timestamp time.Time
	Details   interface{}
}

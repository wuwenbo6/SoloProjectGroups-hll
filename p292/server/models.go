package main

import "time"

type AccessTechType string

const (
	AccessTechEthernet AccessTechType = "ethernet"
	AccessTechWiFi     AccessTechType = "wifi"
	AccessTechLTE      AccessTechType = "lte"
	AccessTech5G       AccessTechType = "5g"
)

func (t AccessTechType) Priority() int {
	switch t {
	case AccessTech5G:
		return 4
	case AccessTechLTE:
		return 3
	case AccessTechWiFi:
		return 2
	case AccessTechEthernet:
		return 1
	default:
		return 0
	}
}

func (t AccessTechType) IsValid() bool {
	switch t {
	case AccessTechEthernet, AccessTechWiFi, AccessTechLTE, AccessTech5G:
		return true
	default:
		return false
	}
}

type BindingUpdateRecord struct {
	ID            string         `json:"id"`
	Timestamp     time.Time      `json:"timestamp"`
	MNID          string         `json:"mn_id"`
	MNPrefix      string         `json:"mn_prefix"`
	OldMAGAddress string         `json:"old_mag_address,omitempty"`
	NewMAGAddress string         `json:"new_mag_address"`
	OldAccessTech AccessTechType `json:"old_access_tech,omitempty"`
	NewAccessTech AccessTechType `json:"new_access_tech"`
	Lifetime      int            `json:"lifetime"`
	Operation     string         `json:"operation"` // register, update, handover, deregister
	QoSProfile    *QoSProfile    `json:"qos_profile,omitempty"`
	Status        string         `json:"status"` // success, rejected
	Message       string         `json:"message"`
}

type PBURequest struct {
	MNID       string            `json:"mn_id"`
	MNPrefix   string            `json:"mn_prefix"`
	MAGAddress string            `json:"mag_address"`
	Lifetime   int               `json:"lifetime"`
	AccessTech AccessTechType    `json:"access_tech_type"`
	QoSClasses []QoSTrafficClass `json:"qos_classes,omitempty"`
}

type PBAResponse struct {
	Status         int         `json:"status"`
	Message        string      `json:"message"`
	MNID           string      `json:"mn_id,omitempty"`
	MNPrefix       string      `json:"mn_prefix,omitempty"`
	MAGAddress     string      `json:"mag_address,omitempty"`
	Lifetime       int         `json:"lifetime,omitempty"`
	TunnelPriority int         `json:"tunnel_priority,omitempty"`
	Handover       bool        `json:"handover,omitempty"`
	OldMAG         string      `json:"old_mag,omitempty"`
	QoSProfile     *QoSProfile `json:"qos_profile,omitempty"`
}

type BCEEntry struct {
	MNID           string         `json:"mn_id"`
	MNPrefix       string         `json:"mn_prefix"`
	MAGAddress     string         `json:"mag_address"`
	AccessTech     AccessTechType `json:"access_tech_type"`
	TunnelPriority int            `json:"tunnel_priority"`
	Lifetime       int            `json:"lifetime"`
	RegisteredAt   time.Time      `json:"registered_at"`
	ExpiresAt      time.Time      `json:"expires_at"`
	QoSProfile     *QoSProfile    `json:"qos_profile,omitempty"`
}

type TunnelState struct {
	MNID         string    `json:"mn_id"`
	OldMAG       string    `json:"old_mag"`
	NewMAG       string    `json:"new_mag"`
	OldTech      string    `json:"old_tech"`
	NewTech      string    `json:"new_tech"`
	Status       string    `json:"status"`
	BufferedPkts int       `json:"buffered_packets"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type EventLog struct {
	Timestamp  time.Time `json:"timestamp"`
	EventType  string    `json:"event_type"`
	MNID       string    `json:"mn_id"`
	MAGAddress string    `json:"mag_address"`
	Detail     string    `json:"detail"`
}

type ExportResponse struct {
	Format      string                `json:"format"`
	GeneratedAt time.Time             `json:"generated_at"`
	Total       int                   `json:"total_records"`
	Records     []BindingUpdateRecord `json:"records"`
}

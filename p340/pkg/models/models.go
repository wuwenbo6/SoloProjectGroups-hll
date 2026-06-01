package models

import "time"

type HBA struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	WWN        string    `json:"wwn"`
	NodeName   string    `json:"node_name"`
	PortName   string    `json:"port_name"`
	Vendor     string    `json:"vendor"`
	Model      string    `json:"model"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

type StorageTarget struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	WWN        string    `json:"wwn"`
	Type       string    `json:"type"`
	CapacityGB int64     `json:"capacity_gb"`
	Vendor     string    `json:"vendor"`
	Model      string    `json:"model"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
}

const (
	ZoneTypeNormal    = "normal"
	ZoneTypeDefault   = "default"
	ZoneTypeBroadcast = "broadcast"
)

type Zone struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	ZoneType         string         `json:"zone_type"`
	Description      string         `json:"description"`
	HBAIDs           []string       `json:"hba_ids"`
	StorageTargetIDs []string       `json:"storage_target_ids"`
	Active           bool           `json:"active"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
}

type ZoneMemberView struct {
	Zone           Zone            `json:"zone"`
	HBAs           []HBA           `json:"hbas"`
	StorageTargets []StorageTarget `json:"storage_targets"`
}

type AccessCheckResult struct {
	Allowed    bool   `json:"allowed"`
	Message    string `json:"message"`
	ZoneName   string `json:"zone_name,omitempty"`
}

type ACLEntry struct {
	ID           string `json:"id"`
	ZoneID       string `json:"zone_id"`
	ZoneName     string `json:"zone_name"`
	HBAID        string `json:"hba_id"`
	HBAWWN       string `json:"hba_wwn"`
	TargetID     string `json:"target_id"`
	TargetWWN    string `json:"target_wwn"`
	Permission   string `json:"permission"`
	Priority     int    `json:"priority"`
}

type ACLConfig struct {
	Version     string      `json:"version"`
	GeneratedAt time.Time   `json:"generated_at"`
	Entries     []ACLEntry  `json:"entries"`
	ZoneCount   int         `json:"zone_count"`
	EntryCount  int         `json:"entry_count"`
}

type ConfigVersion struct {
	Version     string    `json:"version"`
	Previous    string    `json:"previous"`
	CreatedAt   time.Time `json:"created_at"`
	ChangeType  string    `json:"change_type"`
	Description string    `json:"description"`
	Checksum    string    `json:"checksum"`
}

type BroadcastMessage struct {
	ID          string      `json:"id"`
	Timestamp   time.Time   `json:"timestamp"`
	Type        string      `json:"type"`
	Version     string      `json:"version"`
	Source      string      `json:"source"`
	Payload     interface{} `json:"payload"`
}

type SyncStatus struct {
	CurrentVersion string            `json:"current_version"`
	LastSyncAt     time.Time         `json:"last_sync_at"`
	NodeStatus     map[string]string `json:"node_status"`
	SyncInProgress bool              `json:"sync_in_progress"`
}

type SwitchNode struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	ACLVersion string `json:"acl_version"`
}

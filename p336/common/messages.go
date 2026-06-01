package common

import "time"

type Message struct {
	Type      string    `json:"type"`
	Timestamp time.Time `json:"timestamp"`
	Payload   any       `json:"payload"`
}

type ConnectionInfo struct {
	ConnectionID    string     `json:"connectionId"`
	OriginalAddress string     `json:"originalAddress"`
	CurrentAddress  string     `json:"currentAddress"`
	ResetToken      string     `json:"resetToken,omitempty"`
	ActivePaths     []PathInfo `json:"activePaths,omitempty"`
}

type PathInfo struct {
	PathID      string `json:"pathId"`
	LocalAddr   string `json:"localAddr"`
	RemoteAddr  string `json:"remoteAddr"`
	State       string `json:"state"`
	RTTMs       int64  `json:"rttMs"`
	PacketsSent int64  `json:"packetsSent"`
	PacketsRecv int64  `json:"packetsRecv"`
	IsPrimary   bool   `json:"isPrimary"`
}

type PathChangeEvent struct {
	ConnectionID   string    `json:"connectionId"`
	OldAddress     string    `json:"oldAddress"`
	NewAddress     string    `json:"newAddress"`
	Timestamp      time.Time `json:"timestamp"`
	MigrationType  string    `json:"migrationType"`
	PathVerified   bool      `json:"pathVerified"`
	ChallengeRound int       `json:"challengeRound"`
}

type MessageEvent struct {
	ConnectionID string    `json:"connectionId"`
	Content      string    `json:"content"`
	FromClient   bool      `json:"fromClient"`
	Path         string    `json:"path"`
	Timestamp    time.Time `json:"timestamp"`
}

type PathChallenge struct {
	ChallengeID   string `json:"challengeId"`
	ChallengeData string `json:"challengeData"`
	Sequence      int    `json:"sequence"`
	FromAddress   string `json:"fromAddress"`
	PathID        string `json:"pathId,omitempty"`
}

type PathResponse struct {
	ChallengeID   string `json:"challengeId"`
	ResponseData  string `json:"responseData"`
	Sequence      int    `json:"sequence"`
	ServerAddress string `json:"serverAddress"`
	ResetToken    string `json:"resetToken"`
	Verified      bool   `json:"verified"`
	PathID        string `json:"pathId,omitempty"`
}

type MigrationStatus struct {
	ConnectionID string `json:"connectionId"`
	OldAddress   string `json:"oldAddress"`
	NewAddress   string `json:"newAddress"`
	Status       string `json:"status"`
	ChallengeSeq int    `json:"challengeSeq"`
	Verified     bool   `json:"verified"`
	ResetToken   string `json:"resetToken,omitempty"`
	PathID       string `json:"pathId,omitempty"`
}

type MultiPathEvent struct {
	ConnectionID string     `json:"connectionId"`
	Action       string     `json:"action"`
	Path         PathInfo   `json:"path"`
	AllPaths     []PathInfo `json:"allPaths"`
	Timestamp    time.Time  `json:"timestamp"`
}

type MigrationLatency struct {
	ConnectionID    string `json:"connectionId"`
	MigrationSeq    int    `json:"migrationSeq"`
	OldAddress      string `json:"oldAddress"`
	NewAddress      string `json:"newAddress"`
	PathID          string `json:"pathId"`
	SocketSwitchUs  int64  `json:"socketSwitchUs"`
	ChallengeSentMs int64  `json:"challengeSentMs"`
	ResponseRecvMs  int64  `json:"responseRecvMs"`
	TotalLatencyMs  int64  `json:"totalLatencyMs"`
	Verified        bool   `json:"verified"`
	Timestamp       string `json:"timestamp"`
}

type StatsExport struct {
	TotalMigrations  int                `json:"totalMigrations"`
	TotalVerified    int                `json:"totalVerified"`
	AvgLatencyMs     float64            `json:"avgLatencyMs"`
	MinLatencyMs     int64              `json:"minLatencyMs"`
	MaxLatencyMs     int64              `json:"maxLatencyMs"`
	P50LatencyMs     int64              `json:"p50LatencyMs"`
	P95LatencyMs     int64              `json:"p95LatencyMs"`
	P99LatencyMs     int64              `json:"p99LatencyMs"`
	AvgSocketSwitch  float64            `json:"avgSocketSwitchUs"`
	AvgChallengeSent float64            `json:"avgChallengeSentMs"`
	AvgResponseRecv  float64            `json:"avgResponseRecvMs"`
	ActivePaths      int                `json:"activePaths"`
	Records          []MigrationLatency `json:"records"`
}

const (
	MsgTypeConnectionInfo   = "connection_info"
	MsgTypePathChange       = "path_change"
	MsgTypeMessage          = "message"
	MsgTypeSwitchRequest    = "switch_request"
	MsgTypeSwitchConfirm    = "switch_confirm"
	MsgTypePing             = "ping"
	MsgTypePathChallenge    = "path_challenge"
	MsgTypePathResponse     = "path_response"
	MsgTypeMigrationStatus  = "migration_status"
	MsgTypeResetToken       = "reset_token"
	MsgTypeMultiPath        = "multi_path"
	MsgTypeMigrationLatency = "migration_latency"
	MsgTypeStatsExport      = "stats_export"

	MigrationStatusInit        = "init"
	MigrationStatusMigrating   = "migrating"
	MigrationStatusChallenging = "challenging"
	MigrationStatusVerified    = "verified"
	MigrationStatusFailed      = "failed"

	MultiPathActionAdd      = "add"
	MultiPathActionRemove   = "remove"
	MultiPathActionSchedule = "schedule"
	MultiPathActionPrimary  = "primary"

	PathStateActive     = "active"
	PathStateStandby    = "standby"
	PathStateValidating = "validating"
	PathStateFailed     = "failed"
)

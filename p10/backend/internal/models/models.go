package models

import (
	"time"
)

type Device struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DeviceID    string    `gorm:"uniqueIndex;size:100" json:"device_id"`
	Name        string    `gorm:"size:100" json:"name"`
	Type        string    `gorm:"size:50" json:"type"`
	Room        string    `gorm:"size:50" json:"room"`
	Status      string    `gorm:"size:20" json:"status"`
	Online      bool      `json:"online"`
	LastSeen    time.Time `json:"last_seen"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type SensorData struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  string    `gorm:"index;size:100" json:"device_id"`
	Type      string    `gorm:"size:50" json:"type"`
	Value     float64   `json:"value"`
	Unit      string    `gorm:"size:20" json:"unit"`
	Timestamp time.Time `gorm:"index" json:"timestamp"`
}

type DeviceState struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  string    `gorm:"uniqueIndex;size:100" json:"device_id"`
	State     string    `gorm:"type:text" json:"state"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Rule struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:100" json:"name"`
	Description string `gorm:"size:255" json:"description"`
	Enabled     bool   `json:"enabled"`
	Condition   string `gorm:"type:text" json:"condition"`
	Action      string `gorm:"type:text" json:"action"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Scene struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	Name        string `gorm:"size:100" json:"name"`
	Description string `gorm:"size:255" json:"description"`
	Enabled     bool   `json:"enabled"`
	TriggerType string `gorm:"size:20" json:"trigger_type"`
	Trigger     string `gorm:"type:text" json:"trigger"`
	Actions     string `gorm:"type:text" json:"actions"`
	CronExpr    string `gorm:"size:100" json:"cron_expr"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CommandLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  string    `gorm:"size:100" json:"device_id"`
	Command   string    `gorm:"type:text" json:"command"`
	Status    string    `gorm:"size:20" json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

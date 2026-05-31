package models

import (
	"time"

	"gorm.io/gorm"
)

type Device struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	DeviceEUI   string         `gorm:"uniqueIndex;size:64" json:"device_eui"`
	Name        string         `gorm:"size:128" json:"name"`
	Type        string         `gorm:"size:32" json:"type"`
	Latitude    float64        `json:"latitude"`
	Longitude   float64        `json:"longitude"`
	Status      string         `gorm:"size:32;default:offline" json:"status"`
	LastSeen    *time.Time     `json:"last_seen"`
	SensorTypes string         `gorm:"size:128" json:"sensor_types"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type SensorData struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DeviceID    uint      `gorm:"index" json:"device_id"`
	DeviceEUI   string    `gorm:"index;size:64" json:"device_eui"`
	SensorType  string    `gorm:"size:32;index" json:"sensor_type"`
	Timestamp   time.Time `gorm:"index" json:"timestamp"`
	RawData     string    `gorm:"type:text" json:"raw_data"`
	InclineX    *float64  `json:"incline_x,omitempty"`
	InclineY    *float64  `json:"incline_y,omitempty"`
	VibrationX  *float64  `json:"vibration_x,omitempty"`
	VibrationY  *float64  `json:"vibration_y,omitempty"`
	VibrationZ  *float64  `json:"vibration_z,omitempty"`
	VibrationMax *float64 `json:"vibration_max,omitempty"`
	Rainfall    *float64  `json:"rainfall,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	Humidity    *float64  `json:"humidity,omitempty"`
	Battery     *float64  `json:"battery,omitempty"`
	RSSI        *int      `json:"rssi,omitempty"`
	SNR         *float64  `json:"snr,omitempty"`
}

type Alert struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DeviceID    uint      `gorm:"index" json:"device_id"`
	DeviceEUI   string    `gorm:"index;size:64" json:"device_eui"`
	AlertType   string    `gorm:"size:32;index" json:"alert_type"`
	Severity    string    `gorm:"size:32" json:"severity"`
	Message     string    `gorm:"type:text" json:"message"`
	Value       float64   `json:"value"`
	Threshold   float64   `json:"threshold"`
	Timestamp   time.Time `gorm:"index" json:"timestamp"`
	Acknowledged bool      `gorm:"default:false" json:"acknowledged"`
	DataID      *uint     `json:"data_id,omitempty"`
}

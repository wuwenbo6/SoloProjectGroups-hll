package models

import "time"

type SensorData struct {
	ID           int64      `db:"id" json:"id"`
	SensorID     string     `db:"sensor_id" json:"sensor_id"`
	Timestamp    time.Time  `db:"timestamp" json:"timestamp"`
	PeakCurrent  float64    `db:"peak_current" json:"peak_current"`
	PulseCount   int        `db:"pulse_count" json:"pulse_count"`
	WaveformData []float64  `db:"waveform_data" json:"waveform_data"`
	PollutionLevel int       `db:"pollution_level" json:"pollution_level"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

type PollutionLevel int

const (
	LevelNormal PollutionLevel = iota
	LevelSlight
	LevelModerate
	LevelSevere
	LevelCritical
)

type Sensor struct {
	ID          string    `db:"id" json:"id"`
	Name        string    `db:"name" json:"name"`
	Location    string    `db:"location" json:"location"`
	Description string    `db:"description" json:"description"`
	IsActive    bool      `db:"is_active" json:"is_active"`
	CreatedAt   time.Time `db:"created_at" json:"created_at"`
}

type Alert struct {
	ID           int64      `db:"id" json:"id"`
	SensorID     string     `db:"sensor_id" json:"sensor_id"`
	Timestamp    time.Time  `db:"timestamp" json:"timestamp"`
	Level        int        `db:"level" json:"level"`
	Message      string     `db:"message" json:"message"`
	Acknowledged bool       `db:"acknowledged" json:"acknowledged"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

type ReportData struct {
	Period          string    `json:"period"`
	StartDate       time.Time `json:"start_date"`
	EndDate         time.Time `json:"end_date"`
	SensorID        string    `json:"sensor_id"`
	AvgCurrent      float64   `json:"avg_current"`
	MaxCurrent      float64   `json:"max_current"`
	TotalPulses     int64     `json:"total_pulses"`
	PollutionLevels map[int]int64 `json:"pollution_levels"`
	AlertCount      int64     `json:"alert_count"`
}

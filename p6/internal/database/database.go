package database

import (
	"fmt"
	"leakage-monitor/internal/config"
	"leakage-monitor/internal/models"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var DB *sqlx.DB

func Init() error {
	dsn := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		config.App.Database.Host,
		config.App.Database.Port,
		config.App.Database.User,
		config.App.Database.Password,
		config.App.Database.DBName,
		config.App.Database.SSLMode,
	)

	var err error
	DB, err = sqlx.Connect("postgres", dsn)
	if err != nil {
		return err
	}

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)

	return nil
}

func Close() {
	if DB != nil {
		DB.Close()
	}
}

func InsertSensorData(data *models.SensorData) error {
	query := `
		INSERT INTO sensor_data (sensor_id, timestamp, peak_current, pulse_count, waveform_data, pollution_level)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`
	return DB.QueryRow(query,
		data.SensorID,
		data.Timestamp,
		data.PeakCurrent,
		data.PulseCount,
		data.WaveformData,
		data.PollutionLevel,
	).Scan(&data.ID, &data.CreatedAt)
}

func GetSensorData(sensorID string, limit int) ([]models.SensorData, error) {
	var data []models.SensorData
	query := `
		SELECT id, sensor_id, timestamp, peak_current, pulse_count, waveform_data, pollution_level, created_at
		FROM sensor_data
		WHERE sensor_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`
	err := DB.Select(&data, query, sensorID, limit)
	return data, err
}

func GetSensorDataTimeRange(sensorID string, start, end time.Time) ([]models.SensorData, error) {
	var data []models.SensorData
	query := `
		SELECT id, sensor_id, timestamp, peak_current, pulse_count, waveform_data, pollution_level, created_at
		FROM sensor_data
		WHERE sensor_id = $1 AND timestamp >= $2 AND timestamp <= $3
		ORDER BY timestamp DESC
	`
	err := DB.Select(&data, query, sensorID, start, end)
	return data, err
}

func InsertAlert(alert *models.Alert) error {
	query := `
		INSERT INTO alerts (sensor_id, timestamp, level, message)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	return DB.QueryRow(query,
		alert.SensorID,
		alert.Timestamp,
		alert.Level,
		alert.Message,
	).Scan(&alert.ID, &alert.CreatedAt)
}

func GetAlerts(sensorID string, limit int) ([]models.Alert, error) {
	var alerts []models.Alert
	query := `
		SELECT id, sensor_id, timestamp, level, message, acknowledged, created_at
		FROM alerts
		WHERE sensor_id = $1
		ORDER BY timestamp DESC
		LIMIT $2
	`
	err := DB.Select(&alerts, query, sensorID, limit)
	return alerts, err
}

func GetAllSensors() ([]models.Sensor, error) {
	var sensors []models.Sensor
	query := `
		SELECT id, name, location, description, is_active, created_at
		FROM sensors
		WHERE is_active = true
	`
	err := DB.Select(&sensors, query)
	return sensors, err
}

func GetPulseCountInWindow(sensorID string, window time.Duration) (int64, error) {
	var count int64
	query := `
		SELECT COALESCE(SUM(pulse_count), 0)
		FROM sensor_data
		WHERE sensor_id = $1 AND timestamp >= $2
	`
	err := DB.Get(&count, query, sensorID, time.Now().Add(-window))
	return count, err
}

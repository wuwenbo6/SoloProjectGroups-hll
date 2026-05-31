package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pv-monitor/internal/config"
	"pv-monitor/internal/models"
)

type Database struct {
	pool *pgxpool.Pool
}

func New(cfg *config.DatabaseConfig) (*Database, error) {
	connStr := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.DBName, cfg.SSLMode,
	)

	pool, err := pgxpool.New(context.Background(), connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	db := &Database{pool: pool}
	if err := db.InitSchema(); err != nil {
		return nil, fmt.Errorf("failed to init schema: %w", err)
	}

	return db, nil
}

func (db *Database) InitSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS inverter_data (
		timestamp TIMESTAMPTZ NOT NULL,
		inverter_id TEXT NOT NULL,
		voltage DOUBLE PRECISION,
		current DOUBLE PRECISION,
		power DOUBLE PRECISION,
		energy DOUBLE PRECISION,
		temperature DOUBLE PRECISION,
		efficiency DOUBLE PRECISION,
		PRIMARY KEY (timestamp, inverter_id)
	);

	SELECT create_hypertable('inverter_data', 'timestamp', if_not_exists => TRUE);

	CREATE INDEX IF NOT EXISTS idx_inverter_data_id ON inverter_data(inverter_id, timestamp DESC);

	CREATE TABLE IF NOT EXISTS plant_data (
		timestamp TIMESTAMPTZ NOT NULL,
		total_power DOUBLE PRECISION,
		total_energy DOUBLE PRECISION,
		pr_value DOUBLE PRECISION,
		avg_efficiency DOUBLE PRECISION,
		inverter_count INTEGER,
		PRIMARY KEY (timestamp)
	);

	SELECT create_hypertable('plant_data', 'timestamp', if_not_exists => TRUE);

	CREATE TABLE IF NOT EXISTS alarms (
		id TEXT PRIMARY KEY,
		inverter_id TEXT,
		type TEXT,
		message TEXT,
		severity TEXT,
		value DOUBLE PRECISION,
		threshold DOUBLE PRECISION,
		timestamp TIMESTAMPTZ,
		acknowledged BOOLEAN DEFAULT FALSE
	);

	CREATE INDEX IF NOT EXISTS idx_alarms_timestamp ON alarms(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_alarms_acknowledged ON alarms(acknowledged);

	CREATE TABLE IF NOT EXISTS ir_radiance (
		timestamp TIMESTAMPTZ NOT NULL,
		value DOUBLE PRECISION,
		PRIMARY KEY (timestamp)
	);

	SELECT create_hypertable('ir_radiance', 'timestamp', if_not_exists => TRUE);

	CREATE TABLE IF NOT EXISTS drone_inspections (
		id TEXT PRIMARY KEY,
		timestamp TIMESTAMPTZ NOT NULL,
		inverter_id TEXT,
		panel_id TEXT,
		hot_spot_temp DOUBLE PRECISION,
		ambient_temp DOUBLE PRECISION,
		temp_diff DOUBLE PRECISION,
		soiling_rate DOUBLE PRECISION,
		image_url TEXT,
		severity TEXT,
		needs_cleaning BOOLEAN DEFAULT FALSE,
		processed BOOLEAN DEFAULT FALSE
	);

	CREATE INDEX IF NOT EXISTS idx_drone_inspections_ts ON drone_inspections(timestamp DESC);
	CREATE INDEX IF NOT EXISTS idx_drone_inspections_inv ON drone_inspections(inverter_id);

	CREATE TABLE IF NOT EXISTS cleaning_records (
		id TEXT PRIMARY KEY,
		inverter_id TEXT,
		scheduled_time TIMESTAMPTZ,
		completed_time TIMESTAMPTZ,
		method TEXT,
		cost DOUBLE PRECISION,
		status TEXT,
		pr_before DOUBLE PRECISION,
		pr_after DOUBLE PRECISION,
		water_used DOUBLE PRECISION,
		operator TEXT,
		notes TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_cleaning_records_inv ON cleaning_records(inverter_id);
	CREATE INDEX IF NOT EXISTS idx_cleaning_records_time ON cleaning_records(scheduled_time DESC);

	CREATE TABLE IF NOT EXISTS cleaning_strategies (
		id TEXT PRIMARY KEY,
		name TEXT,
		inverter_id TEXT,
		type TEXT,
		threshold_pr DOUBLE PRECISION,
		threshold_soiling DOUBLE PRECISION,
		interval_days INTEGER,
		last_cleaning TIMESTAMPTZ,
		next_scheduled TIMESTAMPTZ,
		enabled BOOLEAN DEFAULT TRUE
	);

	CREATE TABLE IF NOT EXISTS weather_data (
		timestamp TIMESTAMPTZ NOT NULL,
		temperature DOUBLE PRECISION,
		humidity DOUBLE PRECISION,
		wind_speed DOUBLE PRECISION,
		cloud_cover DOUBLE PRECISION,
		visibility DOUBLE PRECISION,
		uv_index DOUBLE PRECISION,
		precipitation DOUBLE PRECISION,
		condition TEXT,
		PRIMARY KEY (timestamp)
	);

	SELECT create_hypertable('weather_data', 'timestamp', if_not_exists => TRUE);

	CREATE TABLE IF NOT EXISTS generation_forecasts (
		timestamp TIMESTAMPTZ NOT NULL,
		forecast_time TIMESTAMPTZ NOT NULL,
		horizon_hours INTEGER,
		predicted_power DOUBLE PRECISION,
		predicted_energy DOUBLE PRECISION,
		confidence_lower DOUBLE PRECISION,
		confidence_upper DOUBLE PRECISION,
		model_version TEXT,
		weather_source TEXT,
		PRIMARY KEY (timestamp, forecast_time)
	);

	CREATE TABLE IF NOT EXISTS pr_reports (
		id TEXT PRIMARY KEY,
		report_type TEXT,
		start_date TIMESTAMPTZ,
		end_date TIMESTAMPTZ,
		generated_at TIMESTAMPTZ,
		avg_pr DOUBLE PRECISION,
		min_pr DOUBLE PRECISION,
		max_pr DOUBLE PRECISION,
		total_energy DOUBLE PRECISION,
		theoretical_energy DOUBLE PRECISION,
		avg_temperature DOUBLE PRECISION,
		avg_irradiance DOUBLE PRECISION,
		peak_hours DOUBLE PRECISION,
		cleaning_events INTEGER,
		alarm_count INTEGER,
		status TEXT,
		download_url TEXT
	);

	CREATE INDEX IF NOT EXISTS idx_pr_reports_date ON pr_reports(start_date DESC);
	`

	_, err := db.pool.Exec(context.Background(), schema)
	return err
}

func (db *Database) InsertInverterData(ctx context.Context, data *models.InverterData) error {
	query := `
	INSERT INTO inverter_data (timestamp, inverter_id, voltage, current, power, energy, temperature, efficiency)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	ON CONFLICT (timestamp, inverter_id) DO UPDATE SET
		voltage = EXCLUDED.voltage,
		current = EXCLUDED.current,
		power = EXCLUDED.power,
		energy = EXCLUDED.energy,
		temperature = EXCLUDED.temperature,
		efficiency = EXCLUDED.efficiency
	`

	_, err := db.pool.Exec(ctx, query,
		data.Timestamp, data.InverterID, data.Voltage, data.Current,
		data.Power, data.Energy, data.Temperature, data.Efficiency,
	)
	return err
}

func (db *Database) InsertPlantData(ctx context.Context, data *models.PlantData) error {
	query := `
	INSERT INTO plant_data (timestamp, total_power, total_energy, pr_value, avg_efficiency, inverter_count)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (timestamp) DO UPDATE SET
		total_power = EXCLUDED.total_power,
		total_energy = EXCLUDED.total_energy,
		pr_value = EXCLUDED.pr_value,
		avg_efficiency = EXCLUDED.avg_efficiency,
		inverter_count = EXCLUDED.inverter_count
	`

	_, err := db.pool.Exec(ctx, query,
		data.Timestamp, data.TotalPower, data.TotalEnergy,
		data.PRValue, data.AvgEfficiency, data.InverterCount,
	)
	return err
}

func (db *Database) InsertAlarm(ctx context.Context, alarm *models.Alarm) error {
	query := `
	INSERT INTO alarms (id, inverter_id, type, message, severity, value, threshold, timestamp, acknowledged)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (id) DO NOTHING
	`

	_, err := db.pool.Exec(ctx, query,
		alarm.ID, alarm.InverterID, alarm.Type, alarm.Message,
		alarm.Severity, alarm.Value, alarm.Threshold, alarm.Timestamp, alarm.Acknowledged,
	)
	return err
}

func (db *Database) GetLatestInverterData(ctx context.Context, inverterID string) (*models.InverterData, error) {
	query := `
	SELECT timestamp, inverter_id, voltage, current, power, energy, temperature, efficiency
	FROM inverter_data
	WHERE inverter_id = $1
	ORDER BY timestamp DESC
	LIMIT 1
	`

	var data models.InverterData
	err := db.pool.QueryRow(ctx, query, inverterID).Scan(
		&data.Timestamp, &data.InverterID, &data.Voltage, &data.Current,
		&data.Power, &data.Energy, &data.Temperature, &data.Efficiency,
	)
	if err != nil {
		return nil, err
	}
	return &data, nil
}

func (db *Database) GetAllLatestInverterData(ctx context.Context) ([]*models.InverterData, error) {
	query := `
	SELECT DISTINCT ON (inverter_id) timestamp, inverter_id, voltage, current, power, energy, temperature, efficiency
	FROM inverter_data
	ORDER BY inverter_id, timestamp DESC
	`

	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.InverterData
	for rows.Next() {
		var data models.InverterData
		if err := rows.Scan(
			&data.Timestamp, &data.InverterID, &data.Voltage, &data.Current,
			&data.Power, &data.Energy, &data.Temperature, &data.Efficiency,
		); err != nil {
			return nil, err
		}
		results = append(results, &data)
	}
	return results, nil
}

func (db *Database) GetLatestPlantData(ctx context.Context) (*models.PlantData, error) {
	query := `
	SELECT timestamp, total_power, total_energy, pr_value, avg_efficiency, inverter_count
	FROM plant_data
	ORDER BY timestamp DESC
	LIMIT 1
	`

	var data models.PlantData
	err := db.pool.QueryRow(ctx, query).Scan(
		&data.Timestamp, &data.TotalPower, &data.TotalEnergy,
		&data.PRValue, &data.AvgEfficiency, &data.InverterCount,
	)
	if err != nil {
		return nil, err
	}
	return &data, nil
}

func (db *Database) GetDailyReport(ctx context.Context, date string) (*models.DailyReport, error) {
	query := `
	SELECT
		$1 as date,
		MAX(total_energy) - MIN(total_energy) as total_energy,
		MAX(total_power) as max_power,
		AVG(pr_value) as avg_pr,
		COUNT(*) * 5 / 60.0 as peak_hours
	FROM plant_data
	WHERE timestamp >= $1::date AND timestamp < $1::date + INTERVAL '1 day'
	`

	var report models.DailyReport
	err := db.pool.QueryRow(ctx, query, date).Scan(
		&report.Date, &report.TotalEnergy, &report.MaxPower, &report.AvgPR, &report.PeakHours,
	)
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (db *Database) GetMonthlyReport(ctx context.Context, year, month int) (*models.MonthlyReport, error) {
	query := `
	SELECT
		TO_CHAR($1::date, 'YYYY-MM') as month,
		MAX(total_energy) - MIN(total_energy) as total_energy,
		MAX(total_power) as max_power,
		AVG(pr_value) as avg_pr,
		COUNT(DISTINCT DATE(timestamp)) as days
	FROM plant_data
	WHERE timestamp >= DATE_TRUNC('month', MAKE_DATE($1, $2, 1))
	AND timestamp < DATE_TRUNC('month', MAKE_DATE($1, $2, 1)) + INTERVAL '1 month'
	`

	var report models.MonthlyReport
	err := db.pool.QueryRow(ctx, query, year, month).Scan(
		&report.Month, &report.TotalEnergy, &report.MaxPower, &report.AvgPR, &report.Days,
	)
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (db *Database) GetYearlyReport(ctx context.Context, year int) (*models.YearlyReport, error) {
	query := `
	SELECT
		$1::text as year,
		MAX(total_energy) - MIN(total_energy) as total_energy,
		MAX(total_power) as max_power,
		AVG(pr_value) as avg_pr
	FROM plant_data
	WHERE timestamp >= MAKE_DATE($1, 1, 1)
	AND timestamp < MAKE_DATE($1 + 1, 1, 1)
	`

	var report models.YearlyReport
	err := db.pool.QueryRow(ctx, query, year).Scan(
		&report.Year, &report.TotalEnergy, &report.MaxPower, &report.AvgPR,
	)
	if err != nil {
		return nil, err
	}
	return &report, nil
}

func (db *Database) GetActiveAlarms(ctx context.Context) ([]*models.Alarm, error) {
	query := `
	SELECT id, inverter_id, type, message, severity, value, threshold, timestamp, acknowledged
	FROM alarms
	WHERE acknowledged = FALSE
	ORDER BY timestamp DESC
	`

	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.Alarm
	for rows.Next() {
		var alarm models.Alarm
		if err := rows.Scan(
			&alarm.ID, &alarm.InverterID, &alarm.Type, &alarm.Message,
			&alarm.Severity, &alarm.Value, &alarm.Threshold,
			&alarm.Timestamp, &alarm.Acknowledged,
		); err != nil {
			return nil, err
		}
		results = append(results, &alarm)
	}
	return results, nil
}

func (db *Database) AcknowledgeAlarm(ctx context.Context, alarmID string) error {
	query := `
	UPDATE alarms SET acknowledged = TRUE WHERE id = $1
	`
	_, err := db.pool.Exec(ctx, query, alarmID)
	return err
}

func (db *Database) GetHistoricalData(ctx context.Context, start, end time.Time) ([]*models.PlantData, error) {
	query := `
	SELECT timestamp, total_power, total_energy, pr_value, avg_efficiency, inverter_count
	FROM plant_data
	WHERE timestamp >= $1 AND timestamp <= $2
	ORDER BY timestamp ASC
	`

	rows, err := db.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.PlantData
	for rows.Next() {
		var data models.PlantData
		if err := rows.Scan(
			&data.Timestamp, &data.TotalPower, &data.TotalEnergy,
			&data.PRValue, &data.AvgEfficiency, &data.InverterCount,
		); err != nil {
			return nil, err
		}
		results = append(results, &data)
	}
	return results, nil
}

func (db *Database) InsertIRRadiance(ctx context.Context, radiance *models.IRRadiance) error {
	query := `
	INSERT INTO ir_radiance (timestamp, value)
	VALUES ($1, $2)
	ON CONFLICT (timestamp) DO UPDATE SET value = EXCLUDED.value
	`
	_, err := db.pool.Exec(ctx, query, radiance.Timestamp, radiance.Value)
	return err
}

func (db *Database) GetIRRadiance(ctx context.Context, start, end time.Time) ([]*models.IRRadiance, error) {
	query := `
	SELECT timestamp, value
	FROM ir_radiance
	WHERE timestamp >= $1 AND timestamp <= $2
	ORDER BY timestamp ASC
	`

	rows, err := db.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.IRRadiance
	for rows.Next() {
		var r models.IRRadiance
		if err := rows.Scan(&r.Timestamp, &r.Value); err != nil {
			return nil, err
		}
		results = append(results, &r)
	}
	return results, nil
}

func (db *Database) GetAveragePower(ctx context.Context, inverterID string, duration time.Duration) (float64, error) {
	query := `
	SELECT AVG(power)
	FROM inverter_data
	WHERE inverter_id = $1 AND timestamp >= $2
	`

	var avg float64
	err := db.pool.QueryRow(ctx, query, inverterID, time.Now().Add(-duration)).Scan(&avg)
	if err == pgx.ErrNoRows {
		return 0, nil
	}
	return avg, err
}

func (db *Database) InsertDroneInspection(ctx context.Context, inspection *models.DroneInspection) error {
	query := `
	INSERT INTO drone_inspections (id, timestamp, inverter_id, panel_id, hot_spot_temp, ambient_temp, temp_diff, soiling_rate, image_url, severity, needs_cleaning, processed)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (id) DO UPDATE SET
		processed = EXCLUDED.processed,
		needs_cleaning = EXCLUDED.needs_cleaning
	`
	_, err := db.pool.Exec(ctx, query,
		inspection.ID, inspection.Timestamp, inspection.InverterID, inspection.PanelID,
		inspection.HotSpotTemp, inspection.AmbientTemp, inspection.TempDiff,
		inspection.SoilingRate, inspection.ImageURL, inspection.Severity,
		inspection.NeedsCleaning, inspection.Processed,
	)
	return err
}

func (db *Database) GetUnprocessedInspections(ctx context.Context) ([]*models.DroneInspection, error) {
	query := `
	SELECT id, timestamp, inverter_id, panel_id, hot_spot_temp, ambient_temp, temp_diff, soiling_rate, image_url, severity, needs_cleaning, processed
	FROM drone_inspections
	WHERE processed = FALSE
	ORDER BY timestamp DESC
	`
	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.DroneInspection
	for rows.Next() {
		var insp models.DroneInspection
		if err := rows.Scan(
			&insp.ID, &insp.Timestamp, &insp.InverterID, &insp.PanelID,
			&insp.HotSpotTemp, &insp.AmbientTemp, &insp.TempDiff,
			&insp.SoilingRate, &insp.ImageURL, &insp.Severity,
			&insp.NeedsCleaning, &insp.Processed,
		); err != nil {
			return nil, err
		}
		results = append(results, &insp)
	}
	return results, nil
}

func (db *Database) InsertCleaningRecord(ctx context.Context, record *models.CleaningRecord) error {
	query := `
	INSERT INTO cleaning_records (id, inverter_id, scheduled_time, completed_time, method, cost, status, pr_before, pr_after, water_used, operator, notes)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	ON CONFLICT (id) DO UPDATE SET
		status = EXCLUDED.status,
		completed_time = EXCLUDED.completed_time,
		pr_after = EXCLUDED.pr_after
	`
	_, err := db.pool.Exec(ctx, query,
		record.ID, record.InverterID, record.ScheduledTime, record.CompletedTime,
		record.Method, record.Cost, record.Status, record.PRBefore,
		record.PRAfter, record.WaterUsed, record.Operator, record.Notes,
	)
	return err
}

func (db *Database) GetCleaningRecords(ctx context.Context, inverterID string, limit int) ([]*models.CleaningRecord, error) {
	query := `
	SELECT id, inverter_id, scheduled_time, completed_time, method, cost, status, pr_before, pr_after, water_used, operator, notes
	FROM cleaning_records
	WHERE ($1 = '' OR inverter_id = $1)
	ORDER BY scheduled_time DESC
	LIMIT $2
	`
	rows, err := db.pool.Query(ctx, query, inverterID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.CleaningRecord
	for rows.Next() {
		var r models.CleaningRecord
		if err := rows.Scan(
			&r.ID, &r.InverterID, &r.ScheduledTime, &r.CompletedTime,
			&r.Method, &r.Cost, &r.Status, &r.PRBefore,
			&r.PRAfter, &r.WaterUsed, &r.Operator, &r.Notes,
		); err != nil {
			return nil, err
		}
		results = append(results, &r)
	}
	return results, nil
}

func (db *Database) UpsertCleaningStrategy(ctx context.Context, strategy *models.CleaningStrategy) error {
	query := `
	INSERT INTO cleaning_strategies (id, name, inverter_id, type, threshold_pr, threshold_soiling, interval_days, last_cleaning, next_scheduled, enabled)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	ON CONFLICT (id) DO UPDATE SET
		name = EXCLUDED.name,
		threshold_pr = EXCLUDED.threshold_pr,
		threshold_soiling = EXCLUDED.threshold_soiling,
		interval_days = EXCLUDED.interval_days,
		next_scheduled = EXCLUDED.next_scheduled,
		enabled = EXCLUDED.enabled
	`
	_, err := db.pool.Exec(ctx, query,
		strategy.ID, strategy.Name, strategy.InverterID, strategy.Type,
		strategy.ThresholdPR, strategy.ThresholdSoiling, strategy.IntervalDays,
		strategy.LastCleaning, strategy.NextScheduled, strategy.Enabled,
	)
	return err
}

func (db *Database) GetCleaningStrategies(ctx context.Context) ([]*models.CleaningStrategy, error) {
	query := `
	SELECT id, name, inverter_id, type, threshold_pr, threshold_soiling, interval_days, last_cleaning, next_scheduled, enabled
	FROM cleaning_strategies
	ORDER BY name
	`
	rows, err := db.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.CleaningStrategy
	for rows.Next() {
		var s models.CleaningStrategy
		if err := rows.Scan(
			&s.ID, &s.Name, &s.InverterID, &s.Type,
			&s.ThresholdPR, &s.ThresholdSoiling, &s.IntervalDays,
			&s.LastCleaning, &s.NextScheduled, &s.Enabled,
		); err != nil {
			return nil, err
		}
		results = append(results, &s)
	}
	return results, nil
}

func (db *Database) InsertWeatherData(ctx context.Context, data *models.WeatherData) error {
	query := `
	INSERT INTO weather_data (timestamp, temperature, humidity, wind_speed, cloud_cover, visibility, uv_index, precipitation, condition)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (timestamp) DO UPDATE SET
		temperature = EXCLUDED.temperature,
		humidity = EXCLUDED.humidity,
		cloud_cover = EXCLUDED.cloud_cover
	`
	_, err := db.pool.Exec(ctx, query,
		data.Timestamp, data.Temperature, data.Humidity, data.WindSpeed,
		data.CloudCover, data.Visibility, data.UVIndex,
		data.Precipitation, data.Condition,
	)
	return err
}

func (db *Database) GetWeatherData(ctx context.Context, start, end time.Time) ([]*models.WeatherData, error) {
	query := `
	SELECT timestamp, temperature, humidity, wind_speed, cloud_cover, visibility, uv_index, precipitation, condition
	FROM weather_data
	WHERE timestamp >= $1 AND timestamp <= $2
	ORDER BY timestamp ASC
	`
	rows, err := db.pool.Query(ctx, query, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.WeatherData
	for rows.Next() {
		var d models.WeatherData
		if err := rows.Scan(
			&d.Timestamp, &d.Temperature, &d.Humidity, &d.WindSpeed,
			&d.CloudCover, &d.Visibility, &d.UVIndex,
			&d.Precipitation, &d.Condition,
		); err != nil {
			return nil, err
		}
		results = append(results, &d)
	}
	return results, nil
}

func (db *Database) InsertForecast(ctx context.Context, forecast *models.GenerationForecast) error {
	query := `
	INSERT INTO generation_forecasts (timestamp, forecast_time, horizon_hours, predicted_power, predicted_energy, confidence_lower, confidence_upper, model_version, weather_source)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (timestamp, forecast_time) DO UPDATE SET
		predicted_power = EXCLUDED.predicted_power,
		predicted_energy = EXCLUDED.predicted_energy
	`
	_, err := db.pool.Exec(ctx, query,
		forecast.Timestamp, forecast.ForecastTime, forecast.HorizonHours,
		forecast.PredictedPower, forecast.PredictedEnergy,
		forecast.ConfidenceLower, forecast.ConfidenceUpper,
		forecast.ModelVersion, forecast.WeatherSource,
	)
	return err
}

func (db *Database) GetForecasts(ctx context.Context, start time.Time) ([]*models.GenerationForecast, error) {
	query := `
	SELECT timestamp, forecast_time, horizon_hours, predicted_power, predicted_energy, confidence_lower, confidence_upper, model_version, weather_source
	FROM generation_forecasts
	WHERE forecast_time >= $1
	ORDER BY forecast_time ASC
	`
	rows, err := db.pool.Query(ctx, query, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.GenerationForecast
	for rows.Next() {
		var f models.GenerationForecast
		if err := rows.Scan(
			&f.Timestamp, &f.ForecastTime, &f.HorizonHours,
			&f.PredictedPower, &f.PredictedEnergy,
			&f.ConfidenceLower, &f.ConfidenceUpper,
			&f.ModelVersion, &f.WeatherSource,
		); err != nil {
			return nil, err
		}
		results = append(results, &f)
	}
	return results, nil
}

func (db *Database) InsertPRReport(ctx context.Context, report *models.PRReport) error {
	query := `
	INSERT INTO pr_reports (id, report_type, start_date, end_date, generated_at, avg_pr, min_pr, max_pr, total_energy, theoretical_energy, avg_temperature, avg_irradiance, peak_hours, cleaning_events, alarm_count, status, download_url)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	ON CONFLICT (id) DO UPDATE SET
		status = EXCLUDED.status,
		download_url = EXCLUDED.download_url
	`
	_, err := db.pool.Exec(ctx, query,
		report.ID, report.ReportType, report.StartDate, report.EndDate,
		report.GeneratedAt, report.AvgPR, report.MinPR, report.MaxPR,
		report.TotalEnergy, report.TheoreticalEnergy, report.AvgTemperature,
		report.AvgIrradiance, report.PeakHours, report.CleaningEvents,
		report.AlarmCount, report.Status, report.DownloadURL,
	)
	return err
}

func (db *Database) GetPRReports(ctx context.Context, limit int) ([]*models.PRReport, error) {
	query := `
	SELECT id, report_type, start_date, end_date, generated_at, avg_pr, min_pr, max_pr, total_energy, theoretical_energy, avg_temperature, avg_irradiance, peak_hours, cleaning_events, alarm_count, status, download_url
	FROM pr_reports
	ORDER BY start_date DESC
	LIMIT $1
	`
	rows, err := db.pool.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []*models.PRReport
	for rows.Next() {
		var r models.PRReport
		if err := rows.Scan(
			&r.ID, &r.ReportType, &r.StartDate, &r.EndDate,
			&r.GeneratedAt, &r.AvgPR, &r.MinPR, &r.MaxPR,
			&r.TotalEnergy, &r.TheoreticalEnergy, &r.AvgTemperature,
			&r.AvgIrradiance, &r.PeakHours, &r.CleaningEvents,
			&r.AlarmCount, &r.Status, &r.DownloadURL,
		); err != nil {
			return nil, err
		}
		results = append(results, &r)
	}
	return results, nil
}

func (db *Database) GetPRStats(ctx context.Context, start, end time.Time) (avgPR, minPR, maxPR, avgTemp, avgIrradiance float64, err error) {
	query := `
	SELECT AVG(pr_value), MIN(pr_value), MAX(pr_value),
	       AVG((SELECT temperature FROM inverter_data i WHERE i.timestamp = p.timestamp LIMIT 1)) as temp,
	       AVG((SELECT value FROM ir_radiance ir WHERE ir.timestamp <= p.timestamp ORDER BY ir.timestamp DESC LIMIT 1)) as irr
	FROM plant_data p
	WHERE timestamp >= $1 AND timestamp <= $2
	`
	err = db.pool.QueryRow(ctx, query, start, end).Scan(&avgPR, &minPR, &maxPR, &avgTemp, &avgIrradiance)
	return
}

func (db *Database) Close() {
	db.pool.Close()
}

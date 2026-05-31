package models

import "time"

type InverterData struct {
	InverterID   string    `json:"inverter_id"`
	Timestamp    time.Time `json:"timestamp"`
	Voltage      float64   `json:"voltage"`
	Current      float64   `json:"current"`
	Power        float64   `json:"power"`
	Energy       float64   `json:"energy"`
	Temperature  float64   `json:"temperature,omitempty"`
	Efficiency   float64   `json:"efficiency,omitempty"`
}

type PlantData struct {
	Timestamp   time.Time `json:"timestamp"`
	TotalPower  float64   `json:"total_power"`
	TotalEnergy float64   `json:"total_energy"`
	PRValue     float64   `json:"pr_value"`
	AvgEfficiency float64 `json:"avg_efficiency"`
	InverterCount int      `json:"inverter_count"`
}

type Alarm struct {
	ID          string    `json:"id"`
	InverterID  string    `json:"inverter_id"`
	Type        string    `json:"type"`
	Message     string    `json:"message"`
	Severity    string    `json:"severity"`
	Value       float64   `json:"value"`
	Threshold   float64   `json:"threshold"`
	Timestamp   time.Time `json:"timestamp"`
	Acknowledged bool     `json:"acknowledged"`
}

type DailyReport struct {
	Date        string  `json:"date"`
	TotalEnergy float64 `json:"total_energy"`
	MaxPower    float64 `json:"max_power"`
	AvgPR       float64 `json:"avg_pr"`
	PeakHours   float64 `json:"peak_hours"`
}

type MonthlyReport struct {
	Month       string  `json:"month"`
	TotalEnergy float64 `json:"total_energy"`
	MaxPower    float64 `json:"max_power"`
	AvgPR       float64 `json:"avg_pr"`
	Days        int     `json:"days"`
}

type YearlyReport struct {
	Year        string  `json:"year"`
	TotalEnergy float64 `json:"total_energy"`
	MaxPower    float64 `json:"max_power"`
	AvgPR       float64 `json:"avg_pr"`
}

type IRRadiance struct {
	Timestamp time.Time `json:"timestamp"`
	Value     float64   `json:"value"`
}

type DroneInspection struct {
	ID            string    `json:"id"`
	Timestamp     time.Time `json:"timestamp"`
	InverterID    string    `json:"inverter_id"`
	PanelID       string    `json:"panel_id"`
	HotSpotTemp   float64   `json:"hot_spot_temp"`
	AmbientTemp   float64   `json:"ambient_temp"`
	TempDiff      float64   `json:"temp_diff"`
	SoilingRate   float64   `json:"soiling_rate"`
	ImageURL      string    `json:"image_url"`
	Severity      string    `json:"severity"`
	NeedsCleaning bool      `json:"needs_cleaning"`
	Processed     bool      `json:"processed"`
}

type CleaningRecord struct {
	ID              string    `json:"id"`
	InverterID      string    `json:"inverter_id"`
	ScheduledTime   time.Time `json:"scheduled_time"`
	CompletedTime   time.Time `json:"completed_time,omitempty"`
	Method          string    `json:"method"`
	Cost            float64   `json:"cost"`
	Status          string    `json:"status"`
	PRBefore        float64   `json:"pr_before"`
	PRAfter         float64   `json:"pr_after,omitempty"`
	WaterUsed       float64   `json:"water_used"`
	Operator        string    `json:"operator"`
	Notes           string    `json:"notes"`
}

type CleaningStrategy struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	InverterID      string    `json:"inverter_id"`
	Type            string    `json:"type"`
	ThresholdPR     float64   `json:"threshold_pr"`
	ThresholdSoiling float64  `json:"threshold_soiling"`
	IntervalDays    int       `json:"interval_days"`
	LastCleaning    time.Time `json:"last_cleaning,omitempty"`
	NextScheduled   time.Time `json:"next_scheduled,omitempty"`
	Enabled         bool      `json:"enabled"`
}

type WeatherData struct {
	Timestamp     time.Time `json:"timestamp"`
	Temperature   float64   `json:"temperature"`
	Humidity      float64   `json:"humidity"`
	WindSpeed     float64   `json:"wind_speed"`
	CloudCover    float64   `json:"cloud_cover"`
	Visibility    float64   `json:"visibility"`
	UVIndex       float64   `json:"uv_index"`
	Precipitation float64   `json:"precipitation"`
	Condition     string    `json:"condition"`
}

type GenerationForecast struct {
	Timestamp         time.Time `json:"timestamp"`
	ForecastTime      time.Time `json:"forecast_time"`
	HorizonHours      int       `json:"horizon_hours"`
	PredictedPower    float64   `json:"predicted_power"`
	PredictedEnergy   float64   `json:"predicted_energy"`
	ConfidenceLower   float64   `json:"confidence_lower"`
	ConfidenceUpper   float64   `json:"confidence_upper"`
	ModelVersion      string    `json:"model_version"`
	WeatherSource     string    `json:"weather_source"`
}

type PRReport struct {
	ID              string    `json:"id"`
	ReportType      string    `json:"report_type"`
	StartDate       time.Time `json:"start_date"`
	EndDate         time.Time `json:"end_date"`
	GeneratedAt     time.Time `json:"generated_at"`
	AvgPR           float64   `json:"avg_pr"`
	MinPR           float64   `json:"min_pr"`
	MaxPR           float64   `json:"max_pr"`
	TotalEnergy     float64   `json:"total_energy"`
	TheoreticalEnergy float64 `json:"theoretical_energy"`
	AvgTemperature  float64   `json:"avg_temperature"`
	AvgIrradiance   float64   `json:"avg_irradiance"`
	PeakHours       float64   `json:"peak_hours"`
	CleaningEvents  int       `json:"cleaning_events"`
	AlarmCount      int       `json:"alarm_count"`
	Status          string    `json:"status"`
	DownloadURL     string    `json:"download_url"`
}

type SoilingTrend struct {
	InverterID    string    `json:"inverter_id"`
	Date          time.Time `json:"date"`
	SoilingRate   float64   `json:"soiling_rate"`
	PRValue       float64   `json:"pr_value"`
	DaysSinceClean int      `json:"days_since_clean"`
}

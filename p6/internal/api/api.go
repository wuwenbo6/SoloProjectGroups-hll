package api

import (
	"leakage-monitor/internal/database"
	"leakage-monitor/internal/models"
	"leakage-monitor/internal/pollution"
	"leakage-monitor/internal/report"
	"leakage-monitor/internal/websocket"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

func SetupRoutes() *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.Static("/static", "./web/static")
	r.LoadHTMLFiles("web/index.html")
	r.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	api := r.Group("/api")
	{
		api.POST("/data", receiveSensorData)
		api.GET("/data/:sensorId", getSensorData)
		api.GET("/sensors", getSensors)
		api.GET("/alerts/:sensorId", getAlerts)
		api.GET("/report/:sensorId/weekly", getWeeklyReport)
		api.GET("/report/:sensorId/monthly", getMonthlyReport)
		api.GET("/thresholds/:sensorId", getAdaptiveThresholds)
	}

	r.GET("/ws", websocket.HandleConnection)

	return r
}

type SensorDataRequest struct {
	SensorID     string    `json:"sensor_id" binding:"required"`
	Timestamp    time.Time `json:"timestamp"`
	PeakCurrent  float64   `json:"peak_current" binding:"required"`
	PulseCount   int       `json:"pulse_count" binding:"required"`
	WaveformData []float64 `json:"waveform_data"`
}

func receiveSensorData(c *gin.Context) {
	var req SensorDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Timestamp.IsZero() {
		req.Timestamp = time.Now()
	}

	data := &models.SensorData{
		SensorID:     req.SensorID,
		Timestamp:    req.Timestamp,
		PeakCurrent:  req.PeakCurrent,
		PulseCount:   req.PulseCount,
		WaveformData: req.WaveformData,
	}

	calc := pollution.NewCalculator()
	result, err := calc.ProcessSensorDataWithCorrection(data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to calculate pollution level"})
		return
	}

	if err := database.InsertSensorData(data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert data"})
		return
	}

	level := result.PollutionLevel
	if calc.ShouldAlert(level) {
		alert := &models.Alert{
			SensorID:  req.SensorID,
			Timestamp: req.Timestamp,
			Level:     int(level),
			Message:   calc.GetAlertMessage(level, req.SensorID),
		}
		database.InsertAlert(alert)
		websocket.BroadcastAlert(alert)
	}

	websocket.BroadcastData(data)

	c.JSON(http.StatusOK, gin.H{
		"id":                      data.ID,
		"pollution_level":         data.PollutionLevel,
		"original_peak_current":   result.OriginalPeakCurrent,
		"corrected_peak_current":  result.CorrectedPeakCurrent,
		"original_pulse_count":    result.OriginalPulseCount,
		"validated_pulse_count":   result.ValidatedPulseCount,
		"is_raining":              result.IsRaining,
		"estimated_humidity":      result.EstimatedHumidity,
		"rain_factor":             result.RainFactor,
		"seasonal_factor":         result.SeasonalFactor,
		"adaptive_thresholds":     result.AdaptiveThresholds,
	})
}

func getSensorData(c *gin.Context) {
	sensorID := c.Param("sensorId")
	limitStr := c.DefaultQuery("limit", "100")
	limit, _ := strconv.Atoi(limitStr)

	data, err := database.GetSensorData(sensorID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get data"})
		return
	}

	c.JSON(http.StatusOK, data)
}

func getSensors(c *gin.Context) {
	sensors, err := database.GetAllSensors()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get sensors"})
		return
	}

	c.JSON(http.StatusOK, sensors)
}

func getAlerts(c *gin.Context) {
	sensorID := c.Param("sensorId")
	limitStr := c.DefaultQuery("limit", "50")
	limit, _ := strconv.Atoi(limitStr)

	alerts, err := database.GetAlerts(sensorID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get alerts"})
		return
	}

	c.JSON(http.StatusOK, alerts)
}

func getWeeklyReport(c *gin.Context) {
	sensorID := c.Param("sensorId")

	reportData, err := report.GenerateWeeklyReport(sensorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate weekly report"})
		return
	}

	c.JSON(http.StatusOK, reportData)
}

func getMonthlyReport(c *gin.Context) {
	sensorID := c.Param("sensorId")

	reportData, err := report.GenerateMonthlyReport(sensorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate monthly report"})
		return
	}

	c.JSON(http.StatusOK, reportData)
}

func getAdaptiveThresholds(c *gin.Context) {
	sensorID := c.Param("sensorId")

	calc := pollution.NewCalculator()
	thresholds := calc.GetAdaptiveThresholds(sensorID)

	c.JSON(http.StatusOK, gin.H{
		"sensor_id":          sensorID,
		"adaptive_thresholds": thresholds,
		"base_thresholds": []float64{
			1.0, 3.0, 5.0, 8.0,
		},
	})
}

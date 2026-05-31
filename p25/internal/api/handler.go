package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"pv-monitor/internal/config"
	"pv-monitor/internal/database"
	"pv-monitor/internal/models"
	"pv-monitor/internal/service"
)

type Handler struct {
	plantService     *service.PlantService
	alarmService     *service.AlarmService
	cleaningService  *service.CleaningService
	forecastService  *service.ForecastService
	reportService    *service.ReportService
	db               *database.Database
	config           *config.Config
}

func NewHandler(
	plantService *service.PlantService,
	alarmService *service.AlarmService,
	cleaningService *service.CleaningService,
	forecastService *service.ForecastService,
	reportService *service.ReportService,
	db *database.Database,
	cfg *config.Config,
) *Handler {
	return &Handler{
		plantService:     plantService,
		alarmService:     alarmService,
		cleaningService:  cleaningService,
		forecastService:  forecastService,
		reportService:    reportService,
		db:               db,
		config:           cfg,
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
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

	api := r.Group("/api")
	{
		api.GET("/health", h.Health)

		api.GET("/plant/summary", h.GetPlantSummary)
		api.GET("/plant/history", h.GetPlantHistory)
		api.GET("/plant/inverters", h.GetInverterSummary)

		api.GET("/reports/daily", h.GetDailyReport)
		api.GET("/reports/monthly", h.GetMonthlyReport)
		api.GET("/reports/yearly", h.GetYearlyReport)
		api.POST("/reports/pr/generate", h.GeneratePRReport)
		api.GET("/reports/pr/history", h.GetPRReportHistory)
		api.GET("/reports/:id/download", h.DownloadReport)

		api.GET("/alarms", h.GetActiveAlarms)
		api.PUT("/alarms/:id/acknowledge", h.AcknowledgeAlarm)

		api.GET("/weather/current", h.GetCurrentWeather)
		api.GET("/forecast", h.GetGenerationForecast)

		api.GET("/cleaning/records", h.GetCleaningRecords)
		api.POST("/cleaning/schedule", h.ScheduleCleaning)
		api.GET("/cleaning/strategies", h.GetCleaningStrategies)
		api.POST("/drone/inspection", h.SubmitDroneInspection)
		api.GET("/drone/soiling-trend", h.GetSoilingTrend)

		api.GET("/config", h.GetConfig)
	}

	r.StaticFile("/", "./web/index.html")
	r.Static("/static", "./web/static")
}

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now(),
	})
}

func (h *Handler) GetPlantSummary(c *gin.Context) {
	data, err := h.plantService.GetPlantSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) GetPlantHistory(c *gin.Context) {
	hours := 24
	if h := c.Query("hours"); h != "" {
		if val, err := strconv.Atoi(h); err == nil {
			hours = val
		}
	}

	end := time.Now()
	start := end.Add(-time.Duration(hours) * time.Hour)

	data, err := h.plantService.GetHistoricalData(start, end)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) GetInverterSummary(c *gin.Context) {
	data, err := h.plantService.GetInverterSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) GetDailyReport(c *gin.Context) {
	date := c.Query("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	report, err := h.plantService.GetDailyReport(date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handler) GetMonthlyReport(c *gin.Context) {
	year := time.Now().Year()
	month := int(time.Now().Month())

	if y := c.Query("year"); y != "" {
		if val, err := strconv.Atoi(y); err == nil {
			year = val
		}
	}
	if m := c.Query("month"); m != "" {
		if val, err := strconv.Atoi(m); err == nil {
			month = val
		}
	}

	report, err := h.plantService.GetMonthlyReport(year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handler) GetYearlyReport(c *gin.Context) {
	year := time.Now().Year()
	if y := c.Query("year"); y != "" {
		if val, err := strconv.Atoi(y); err == nil {
			year = val
		}
	}

	report, err := h.plantService.GetYearlyReport(year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handler) GetActiveAlarms(c *gin.Context) {
	alarms, err := h.alarmService.GetActiveAlarms()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, alarms)
}

func (h *Handler) AcknowledgeAlarm(c *gin.Context) {
	alarmID := c.Param("id")
	if err := h.alarmService.AcknowledgeAlarm(alarmID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "acknowledged"})
}

func (h *Handler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"inverters":  h.config.Inverters,
		"alarm":      h.config.Alarm,
		"serverPort": h.config.Server.Port,
	})
}

func (h *Handler) GetCurrentWeather(c *gin.Context) {
	ctx := c.Request.Context()
	weather, err := h.forecastService.GetCurrentWeather(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, weather)
}

func (h *Handler) GetGenerationForecast(c *gin.Context) {
	ctx := c.Request.Context()
	forecast, err := h.forecastService.GetForecastSummary(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, forecast)
}

func (h *Handler) GetCleaningRecords(c *gin.Context) {
	ctx := c.Request.Context()
	inverterID := c.Query("inverter_id")
	limit := 50
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil {
			limit = val
		}
	}

	records, err := h.db.GetCleaningRecords(ctx, inverterID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, records)
}

func (h *Handler) ScheduleCleaning(c *gin.Context) {
	var req struct {
		InverterID    string    `json:"inverter_id"`
		ScheduledTime time.Time `json:"scheduled_time"`
		Method        string    `json:"method"`
		Operator      string    `json:"operator"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	record := &models.CleaningRecord{
		ID:            "CLN-" + time.Now().Format("200601021504"),
		InverterID:    req.InverterID,
		ScheduledTime: req.ScheduledTime,
		Method:        req.Method,
		Status:        "scheduled",
		Operator:      req.Operator,
	}

	if err := h.db.InsertCleaningRecord(ctx, record); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, record)
}

func (h *Handler) GetCleaningStrategies(c *gin.Context) {
	ctx := c.Request.Context()
	strategies, err := h.db.GetCleaningStrategies(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, strategies)
}

func (h *Handler) SubmitDroneInspection(c *gin.Context) {
	var inspection models.DroneInspection
	if err := c.ShouldBindJSON(&inspection); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	inspection.Processed = false
	if err := h.db.InsertDroneInspection(ctx, &inspection); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, inspection)
}

func (h *Handler) GetSoilingTrend(c *gin.Context) {
	ctx := c.Request.Context()
	inverterID := c.Query("inverter_id")
	days := 30
	if d := c.Query("days"); d != "" {
		if val, err := strconv.Atoi(d); err == nil {
			days = val
		}
	}

	trends, err := h.cleaningService.GetSoilingTrend(ctx, inverterID, days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, trends)
}

func (h *Handler) GeneratePRReport(c *gin.Context) {
	var req struct {
		ReportType string    `json:"report_type"`
		StartDate  time.Time `json:"start_date"`
		EndDate    time.Time `json:"end_date"`
		Format     string    `json:"format"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx := c.Request.Context()
	report, err := h.reportService.GeneratePRReport(ctx, req.ReportType, req.StartDate, req.EndDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.Format == "csv" {
		csvData, err := h.reportService.ExportCSV(ctx, report)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", "attachment; filename=pr_report_"+report.ID+".csv")
		c.String(http.StatusOK, string(csvData))
		return
	}

	if req.Format == "json" {
		jsonData, err := h.reportService.ExportJSON(ctx, report)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", "attachment; filename=pr_report_"+report.ID+".json")
		c.String(http.StatusOK, string(jsonData))
		return
	}

	c.JSON(http.StatusOK, report)
}

func (h *Handler) GetPRReportHistory(c *gin.Context) {
	ctx := c.Request.Context()
	limit := 20
	if l := c.Query("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil {
			limit = val
		}
	}

	reports, err := h.reportService.GetReportHistory(ctx, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, reports)
}

func (h *Handler) DownloadReport(c *gin.Context) {
	reportID := c.Param("id")
	format := c.DefaultQuery("format", "json")

	ctx := c.Request.Context()
	reports, _ := h.reportService.GetReportHistory(ctx, 100)

	var targetReport *models.PRReport
	for _, r := range reports {
		if r.ID == reportID {
			targetReport = r
			break
		}
	}

	if targetReport == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Report not found"})
		return
	}

	if format == "csv" {
		csvData, _ := h.reportService.ExportCSV(ctx, targetReport)
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", "attachment; filename=pr_report_"+reportID+".csv")
		c.String(http.StatusOK, string(csvData))
		return
	}

	jsonData, _ := h.reportService.ExportJSON(ctx, targetReport)
	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=pr_report_"+reportID+".json")
	c.String(http.StatusOK, string(jsonData))
}

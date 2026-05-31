package api

import (
	"iot-system/internal/engine"
	"iot-system/internal/models"
	"iot-system/pkg/database"
	"iot-system/pkg/mqttclient"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	ruleEngine *engine.RuleEngine
}

func NewHandler(re *engine.RuleEngine) *Handler {
	return &Handler{ruleEngine: re}
}

func (h *Handler) GetDevices(c *gin.Context) {
	devices, err := database.GetAllDevices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, devices)
}

func (h *Handler) GetDevice(c *gin.Context) {
	deviceID := c.Param("id")
	device, err := database.GetDeviceByID(deviceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
		return
	}
	c.JSON(http.StatusOK, device)
}

func (h *Handler) UpdateDevice(c *gin.Context) {
	deviceID := c.Param("id")
	var device models.Device
	if err := c.ShouldBindJSON(&device); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	device.DeviceID = deviceID
	device.UpdatedAt = time.Now()

	if err := database.CreateOrUpdateDevice(&device); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, device)
}

func (h *Handler) GetSensorHistory(c *gin.Context) {
	deviceID := c.Param("id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	data, err := database.GetSensorHistory(deviceID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *Handler) GetRules(c *gin.Context) {
	rules, err := database.DB.Find(&[]models.Rule{}).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rules.Close()

	var result []models.Rule
	for rules.Next() {
		var rule models.Rule
		database.DB.ScanRows(rules, &rule)
		result = append(result, rule)
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) CreateRule(c *gin.Context) {
	var rule models.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	if err := database.CreateRule(&rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, rule)
}

func (h *Handler) UpdateRule(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var rule models.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rule.ID = uint(id)
	rule.UpdatedAt = time.Now()

	if err := database.UpdateRule(&rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rule)
}

func (h *Handler) DeleteRule(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := database.DeleteRule(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Rule deleted"})
}

func (h *Handler) GetScenes(c *gin.Context) {
	scenes, err := database.GetAllScenes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, scenes)
}

func (h *Handler) CreateScene(c *gin.Context) {
	var scene models.Scene
	if err := c.ShouldBindJSON(&scene); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scene.CreatedAt = time.Now()
	scene.UpdatedAt = time.Now()

	if err := database.CreateScene(&scene); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.ruleEngine != nil {
		h.ruleEngine.RefreshScene(scene)
	}
	c.JSON(http.StatusCreated, scene)
}

func (h *Handler) UpdateScene(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var scene models.Scene
	if err := c.ShouldBindJSON(&scene); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	scene.ID = uint(id)
	scene.UpdatedAt = time.Now()

	if err := database.UpdateScene(&scene); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if h.ruleEngine != nil {
		h.ruleEngine.RefreshScene(scene)
	}
	c.JSON(http.StatusOK, scene)
}

func (h *Handler) DeleteScene(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := database.DeleteScene(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Scene deleted"})
}

func (h *Handler) SendCommand(c *gin.Context) {
	deviceID := c.Param("id")
	var command map[string]interface{}
	if err := c.ShouldBindJSON(&command); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := mqttclient.SendCommand(deviceID, command); err != nil {
		database.LogCommand(deviceID, "failed", err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	database.LogCommand(deviceID, "sent", "")
	c.JSON(http.StatusOK, gin.H{"message": "Command sent"})
}

func (h *Handler) GetDashboardStats(c *gin.Context) {
	var deviceCount int64
	var onlineCount int64
	var dataCount int64

	database.DB.Model(&models.Device{}).Count(&deviceCount)
	database.DB.Model(&models.Device{}).Where("online = ?", true).Count(&onlineCount)
	database.DB.Model(&models.SensorData{}).Count(&dataCount)

	c.JSON(http.StatusOK, gin.H{
		"total_devices":   deviceCount,
		"online_devices":  onlineCount,
		"total_data_rows": dataCount,
	})
}

func (h *Handler) TriggerScene(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var scene models.Scene
	if err := database.DB.First(&scene, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Scene not found"})
		return
	}

	if h.ruleEngine != nil {
		h.ruleEngine.ExecuteSceneActions(scene.Actions)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Scene triggered"})
}

func (h *Handler) GetAnomalies(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	anomalies := engine.GetRecentAnomalies(limit)
	c.JSON(http.StatusOK, anomalies)
}

func (h *Handler) GetDiagnostics(c *gin.Context) {
	diagnostics := engine.GetAllDiagnostics()
	c.JSON(http.StatusOK, diagnostics)
}

func (h *Handler) GetDeviceDiagnostic(c *gin.Context) {
	deviceID := c.Param("id")
	diagnostic := engine.GetDeviceDiagnostic(deviceID)
	if diagnostic == nil {
		c.JSON(http.StatusOK, gin.H{
			"device_id": deviceID,
			"status":    "unknown",
			"health_score": 0,
		})
		return
	}
	c.JSON(http.StatusOK, diagnostic)
}

func (h *Handler) GenerateReport(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	report, err := engine.GenerateFarmReport(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, report)
}

func (h *Handler) ExportReport(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	format := c.DefaultQuery("format", "json")

	report, err := engine.GenerateFarmReport(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if format == "csv" {
		csv := engine.ExportReportCSV(report)
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", "attachment; filename=farm_report.csv")
		c.String(http.StatusOK, csv)
		return
	}

	jsonStr, err := engine.ExportReportJSON(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=farm_report.json")
	c.String(http.StatusOK, jsonStr)
}

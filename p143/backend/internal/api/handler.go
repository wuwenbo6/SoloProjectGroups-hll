package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"trace-backend/internal/analyzer"
	"trace-backend/internal/storage"
	"trace-backend/pkg/model"
)

type Handler struct {
	storage         *storage.ElasticsearchStorage
	bufferedStorage *storage.BufferedStorage
	analyzer        *analyzer.TraceAnalyzer
}

func NewHandler(storage *storage.ElasticsearchStorage, bufferedStorage *storage.BufferedStorage, analyzer *analyzer.TraceAnalyzer) *Handler {
	return &Handler{
		storage:         storage,
		bufferedStorage: bufferedStorage,
		analyzer:        analyzer,
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.GET("/trace/:id", h.GetTrace)
		api.GET("/trace/:id/export", h.ExportTrace)
		api.GET("/traces", h.SearchTraces)
		api.GET("/traces/recent", h.GetRecentTraces)
		api.GET("/traces/export", h.ExportTraces)
		api.GET("/services", h.GetServices)
		api.GET("/services/:service/operations", h.GetOperations)
		api.GET("/dependencies", h.GetServiceDependencies)
		api.GET("/health", h.HealthCheck)
		api.GET("/stats", h.GetQueueStats)

		alerts := api.Group("/alerts")
		{
			alerts.GET("", h.GetAlerts)
			alerts.POST("/:id/resolve", h.ResolveAlert)
			alerts.GET("/config", h.GetAlertConfig)
			alerts.PUT("/config", h.UpdateAlertConfig)
		}

		sampling := api.Group("/sampling")
		{
			sampling.GET("/stats", h.GetSamplingStats)
			sampling.GET("/config", h.GetSamplingConfig)
			sampling.PUT("/config", h.UpdateSamplingConfig)
		}
	}
}

func (h *Handler) GetTrace(c *gin.Context) {
	traceID := c.Param("id")
	if traceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trace ID is required"})
		return
	}

	trace, err := h.storage.GetTraceByID(c.Request.Context(), traceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}

	c.JSON(http.StatusOK, trace)
}

func (h *Handler) ExportTrace(c *gin.Context) {
	traceID := c.Param("id")
	format := c.DefaultQuery("format", "json")

	if traceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trace ID is required"})
		return
	}

	trace, err := h.storage.GetTraceByID(c.Request.Context(), traceID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "trace not found"})
		return
	}

	switch format {
	case "json":
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"trace_%s.json\"", traceID))
		c.JSON(http.StatusOK, trace)
	case "csv":
		c.Header("Content-Type", "text/csv")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"trace_%s.csv\"", traceID))
		
		writer := csv.NewWriter(c.Writer)
		defer writer.Flush()

		writer.Write([]string{"Trace ID", "Span ID", "Parent Span ID", "Service Name", "Operation", "Duration (us)", "Start Time", "End Time", "Status"})
		for _, span := range trace.Spans {
			writer.Write([]string{
				span.TraceID,
				span.SpanID,
				span.ParentSpanID,
				span.ServiceName,
				span.Name,
				fmt.Sprintf("%d", span.Duration),
				span.StartTime.Format(time.RFC3339Nano),
				span.EndTime.Format(time.RFC3339Nano),
				span.Status.Code,
			})
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported format, use json or csv"})
	}
}

func (h *Handler) ExportTraces(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	serviceName := c.Query("service")
	operation := c.Query("operation")
	limitStr := c.Query("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	traces, err := h.storage.SearchTraces(c.Request.Context(), serviceName, operation, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	switch format {
	case "json":
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", "attachment; filename=\"traces.json\"")
		c.JSON(http.StatusOK, gin.H{
			"export_time": time.Now().Format(time.RFC3339),
			"count":       len(traces),
			"traces":      traces,
		})
	case "ndjson":
		c.Header("Content-Type", "application/x-ndjson")
		c.Header("Content-Disposition", "attachment; filename=\"traces.ndjson\"")
		for _, trace := range traces {
			jsonBytes, _ := json.Marshal(trace)
			c.Writer.Write(jsonBytes)
			c.Writer.Write([]byte("\n"))
		}
	case "csv":
		c.Header("Content-Type", "text/csv")
		c.Header("Content-Disposition", "attachment; filename=\"traces.csv\"")
		
		writer := csv.NewWriter(c.Writer)
		defer writer.Flush()

		writer.Write([]string{"Trace ID", "Span ID", "Parent Span ID", "Service Name", "Operation", "Duration (us)", "Start Time", "End Time", "Status"})
		for _, trace := range traces {
			for _, span := range trace.Spans {
				writer.Write([]string{
					span.TraceID,
					span.SpanID,
					span.ParentSpanID,
					span.ServiceName,
					span.Name,
					fmt.Sprintf("%d", span.Duration),
					span.StartTime.Format(time.RFC3339Nano),
					span.EndTime.Format(time.RFC3339Nano),
					span.Status.Code,
				})
			}
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported format, use json, ndjson, or csv"})
	}
}

func (h *Handler) SearchTraces(c *gin.Context) {
	serviceName := c.Query("service")
	operation := c.Query("operation")
	limitStr := c.Query("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	traces, err := h.storage.SearchTraces(c.Request.Context(), serviceName, operation, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  traces,
		"total": len(traces),
	})
}

func (h *Handler) GetRecentTraces(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	traces, err := h.storage.GetRecentTraces(c.Request.Context(), limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  traces,
		"total": len(traces),
	})
}

func (h *Handler) GetServices(c *gin.Context) {
	services, err := h.storage.GetServices(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": services,
	})
}

func (h *Handler) GetOperations(c *gin.Context) {
	serviceName := c.Param("service")
	if serviceName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "service name is required"})
		return
	}

	operations, err := h.storage.GetOperations(c.Request.Context(), serviceName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": operations,
	})
}

func (h *Handler) GetServiceDependencies(c *gin.Context) {
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")

	now := time.Now()
	endTime := now
	startTime := now.Add(-24 * time.Hour)

	if startTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, startTimeStr); err == nil {
			startTime = t
		}
	}

	if endTimeStr != "" {
		if t, err := time.Parse(time.RFC3339, endTimeStr); err == nil {
			endTime = t
		}
	}

	dependencies, err := h.storage.GetServiceDependencies(c.Request.Context(), startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": dependencies,
	})
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now().Format(time.RFC3339),
	})
}

func (h *Handler) GetQueueStats(c *gin.Context) {
	if h.bufferedStorage == nil {
		c.JSON(http.StatusOK, gin.H{
			"enabled": false,
			"message": "buffered storage is not enabled",
		})
		return
	}

	stats := h.bufferedStorage.GetStats()
	c.JSON(http.StatusOK, gin.H{
		"enabled": true,
		"stats":   stats,
	})
}

func (h *Handler) GetAlerts(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusOK, gin.H{
			"data":  []model.Alert{},
			"total": 0,
		})
		return
	}

	limitStr := c.Query("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	resolvedStr := c.Query("resolved")
	var resolved *bool
	if resolvedStr != "" {
		r := resolvedStr == "true"
		resolved = &r
	}

	alertType := c.Query("type")

	alerts := h.analyzer.GetAlerts(limit, resolved, alertType)
	c.JSON(http.StatusOK, gin.H{
		"data":  alerts,
		"total": len(alerts),
	})
}

func (h *Handler) ResolveAlert(c *gin.Context) {
	alertID := c.Param("id")
	if alertID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "alert ID is required"})
		return
	}

	if h.analyzer == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "analyzer not available"})
		return
	}

	if h.analyzer.ResolveAlert(alertID) {
		c.JSON(http.StatusOK, gin.H{"message": "alert resolved"})
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error": "alert not found"})
	}
}

func (h *Handler) GetAlertConfig(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusOK, model.AlertConfig{})
		return
	}

	c.JSON(http.StatusOK, h.analyzer.GetAlertConfig())
}

func (h *Handler) UpdateAlertConfig(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "analyzer not available"})
		return
	}

	var config model.AlertConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.analyzer.SetAlertConfig(config)
	c.JSON(http.StatusOK, gin.H{"message": "config updated", "config": config})
}

func (h *Handler) GetSamplingStats(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusOK, gin.H{})
		return
	}

	c.JSON(http.StatusOK, h.analyzer.GetSamplingStats())
}

func (h *Handler) GetSamplingConfig(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusOK, model.SamplingConfig{})
		return
	}

	c.JSON(http.StatusOK, h.analyzer.GetSamplingConfig())
}

func (h *Handler) UpdateSamplingConfig(c *gin.Context) {
	if h.analyzer == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "analyzer not available"})
		return
	}

	var config model.SamplingConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	h.analyzer.SetSamplingConfig(config)
	c.JSON(http.StatusOK, gin.H{"message": "config updated", "config": config})
}

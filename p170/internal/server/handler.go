package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"stun-turn-monitor/internal/alert"
	"stun-turn-monitor/internal/report"
	"stun-turn-monitor/internal/scraper"
	"stun-turn-monitor/internal/store"
	"stun-turn-monitor/internal/timeparser"
)

type Handler struct {
	store    *store.Store
	alertMgr *alert.AlertManager
}

func NewHandler(s *store.Store, alertMgr *alert.AlertManager) *Handler {
	return &Handler{
		store:    s,
		alertMgr: alertMgr,
	}
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

type TimeRange struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

var fixedTimeRanges = map[string]time.Duration{
	"15m": 15 * time.Minute,
	"1h":  1 * time.Hour,
	"6h":  6 * time.Hour,
	"24h": 24 * time.Hour,
	"7d":  7 * 24 * time.Hour,
	"30d": 30 * 24 * time.Hour,
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/servers", h.serversHandler)
	mux.HandleFunc("/api/metrics/latest", h.latestHandler)
	mux.HandleFunc("/api/metrics/history", h.historyHandler)
	mux.HandleFunc("/api/metrics/range", h.rangeHandler)
	mux.HandleFunc("/api/metrics/ip-distribution", h.ipDistributionHandler)
	mux.HandleFunc("/api/time-ranges", h.timeRangesHandler)
	mux.HandleFunc("/api/alerts", h.alertsHandler)
	mux.HandleFunc("/api/alerts/active", h.activeAlertsHandler)
	mux.HandleFunc("/api/alerts/resolve", h.resolveAlertHandler)
	mux.HandleFunc("/api/alerts/summary", h.alertSummaryHandler)
	mux.HandleFunc("/api/report/generate", h.generateReportHandler)
	mux.HandleFunc("/api/report/download", h.downloadReportHandler)
	mux.HandleFunc("/health", h.healthHandler)
	mux.ServeHTTP(w, r)
}

func (h *Handler) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    map[string]string{"status": "ok"},
	})
}

func (h *Handler) serversHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	servers := h.store.ListServers()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    servers,
	})
}

func (h *Handler) timeRangesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ranges := make(map[string]string)
	for key, duration := range fixedTimeRanges {
		ranges[key] = duration.String()
	}
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    ranges,
	})
}

func (h *Handler) latestHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	serverName := r.URL.Query().Get("server")
	if serverName == "" {
		metrics := h.store.GetAllLatest()
		json.NewEncoder(w).Encode(APIResponse{
			Success: true,
			Data:    metrics,
		})
		return
	}

	metrics := h.store.GetLatest(serverName)
	if metrics == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "server not found",
		})
		return
	}

	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    metrics,
	})
}

func (h *Handler) historyHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	serverName := r.URL.Query().Get("server")
	if serverName == "" {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "server parameter is required",
		})
		return
	}

	durationStr := r.URL.Query().Get("duration")
	duration := 1 * time.Hour
	if durationStr != "" {
		if d, ok := fixedTimeRanges[durationStr]; ok {
			duration = d
		} else if d, err := timeparser.ParseDuration(durationStr); err == nil {
			duration = d
		}
	}

	end := time.Now()
	start := end.Add(-duration)

	metrics := h.store.Get(serverName, start, end)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    metrics,
	})
}

func (h *Handler) rangeHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	serverName := r.URL.Query().Get("server")
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	if serverName == "" {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "server parameter is required",
		})
		return
	}

	var start, end time.Time
	var err error

	if startStr != "" {
		start, err = timeparser.Parse(startStr)
		if err != nil {
			json.NewEncoder(w).Encode(APIResponse{
				Success: false,
				Error:   "invalid start time format",
			})
			return
		}
	} else {
		start = time.Now().Add(-1 * time.Hour)
	}

	if endStr != "" {
		end, err = timeparser.Parse(endStr)
		if err != nil {
			json.NewEncoder(w).Encode(APIResponse{
				Success: false,
				Error:   "invalid end time format",
			})
			return
		}
	} else {
		end = time.Now()
	}

	metrics := h.store.Get(serverName, start, end)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data: map[string]interface{}{
			"range": TimeRange{
				Start: start,
				End:   end,
			},
			"metrics": metrics,
		},
	})
}

func (h *Handler) ipDistributionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	serverName := r.URL.Query().Get("server")
	durationStr := r.URL.Query().Get("duration")

	if serverName == "" {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "server parameter is required",
		})
		return
	}

	duration := 1 * time.Hour
	if durationStr != "" {
		if d, ok := fixedTimeRanges[durationStr]; ok {
			duration = d
		} else if d, err := timeparser.ParseDuration(durationStr); err == nil {
			duration = d
		}
	}

	end := time.Now()
	start := end.Add(-duration)

	ipDist := h.store.GetIPDistribution(serverName, start, end)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    ipDist,
	})
}

func (h *Handler) alertsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.alertMgr == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert manager is not enabled",
		})
		return
	}

	severity := r.URL.Query().Get("level")
	limitStr := r.URL.Query().Get("limit")
	limit := 0
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	alerts := h.alertMgr.GetAlerts(alert.AlertLevel(severity), limit)
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    alerts,
	})
}

func (h *Handler) activeAlertsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.alertMgr == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert manager is not enabled",
		})
		return
	}

	alerts := h.alertMgr.GetActiveAlerts()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data:    alerts,
	})
}

func (h *Handler) resolveAlertHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.alertMgr == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert manager is not enabled",
		})
		return
	}

	alertID := r.URL.Query().Get("id")
	if alertID == "" {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert id is required",
		})
		return
	}

	if h.alertMgr.ResolveAlert(alertID) {
		json.NewEncoder(w).Encode(APIResponse{
			Success: true,
			Data:    map[string]string{"message": "alert resolved"},
		})
	} else {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert not found or already resolved",
		})
	}
}

func (h *Handler) alertSummaryHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if h.alertMgr == nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "alert manager is not enabled",
		})
		return
	}

	total, active, warning, errorCount, critical := h.alertMgr.GetAlertCount()
	json.NewEncoder(w).Encode(APIResponse{
		Success: true,
		Data: map[string]int{
			"total":    total,
			"active":   active,
			"warning":  warning,
			"error":    errorCount,
			"critical": critical,
		},
	})
}

func (h *Handler) generateReportHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	durationStr := r.URL.Query().Get("duration")
	duration := 1 * time.Hour
	if durationStr != "" {
		if d, ok := fixedTimeRanges[durationStr]; ok {
			duration = d
		} else if d, err := timeparser.ParseDuration(durationStr); err == nil {
			duration = d
		}
	}

	end := time.Now()
	start := end.Add(-duration)

	servers := h.store.ListServers()
	metricsMap := make(map[string][]*scraper.Metrics)

	for _, server := range servers {
		metricsMap[server] = h.store.Get(server, start, end)
	}

	var alerts []*alert.Alert
	if h.alertMgr != nil {
		alerts = h.alertMgr.GetAllAlerts()
	}

	report := report.GenerateReport(servers, metricsMap, alerts, start, end)

	minify := r.URL.Query().Get("minify")
	var jsonStr string
	var err error
	if minify == "true" {
		jsonStr, err = report.ToMinifiedJSON()
	} else {
		jsonStr, err = report.ToJSON()
	}

	if err != nil {
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "failed to generate report",
		})
		return
	}

	w.Write([]byte(jsonStr))
}

func (h *Handler) downloadReportHandler(w http.ResponseWriter, r *http.Request) {
	durationStr := r.URL.Query().Get("duration")
	duration := 1 * time.Hour
	if durationStr != "" {
		if d, ok := fixedTimeRanges[durationStr]; ok {
			duration = d
		} else if d, err := timeparser.ParseDuration(durationStr); err == nil {
			duration = d
		}
	}

	end := time.Now()
	start := end.Add(-duration)

	servers := h.store.ListServers()
	metricsMap := make(map[string][]*scraper.Metrics)

	for _, server := range servers {
		metricsMap[server] = h.store.Get(server, start, end)
	}

	var alerts []*alert.Alert
	if h.alertMgr != nil {
		alerts = h.alertMgr.GetAllAlerts()
	}

	report := report.GenerateReport(servers, metricsMap, alerts, start, end)

	jsonStr, err := report.ToJSON()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(APIResponse{
			Success: false,
			Error:   "failed to generate report",
		})
		return
	}

	filename := fmt.Sprintf("stun-report-%s.json", end.Format("20060102-150405"))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	w.Write([]byte(jsonStr))
}

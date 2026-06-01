package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"

	"log-analyzer/internal/anomaly"
	"log-analyzer/internal/es"
	"log-analyzer/internal/input"
	"log-analyzer/internal/models"
	"log-analyzer/internal/reporting"
	"log-analyzer/internal/rules"
	"log-analyzer/internal/threatintel"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Server struct {
	port            int
	es              *es.Client
	engine          *rules.RuleEngine
	syslogSrv       *input.SyslogServer
	anomalyDetector *anomaly.AnomalyDetector
	threatIntel     *threatintel.ThreatIntel
	reportGen       *reporting.ReportGenerator
	logger          *zap.Logger
	router          *gin.Engine
	clients         map[*websocket.Conn]bool
	clientsMux      sync.RWMutex
}

func NewServer(port int, esClient *es.Client, engine *rules.RuleEngine, syslogSrv *input.SyslogServer,
	ad *anomaly.AnomalyDetector, ti *threatintel.ThreatIntel, rg *reporting.ReportGenerator, logger *zap.Logger) *Server {
	server := &Server{
		port:            port,
		es:              esClient,
		engine:          engine,
		syslogSrv:       syslogSrv,
		anomalyDetector: ad,
		threatIntel:     ti,
		reportGen:       rg,
		logger:          logger,
		router:          gin.Default(),
		clients:         make(map[*websocket.Conn]bool),
	}

	syslogSrv.SetRuleEngine(engine)

	engine.SetAlertCallback(server.broadcastAlert)
	ad.SetAnomalyCallback(server.broadcastAnomaly)
	ti.SetMatchCallback(server.broadcastIOCMatch)

	server.setupRoutes()
	return server
}

func (s *Server) setupRoutes() {
	s.router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := s.router.Group("/api")
	{
		api.GET("/alerts", s.getAlerts)
		api.GET("/alerts/:id", s.getAlert)
		api.PUT("/alerts/:id/status", s.updateAlertStatus)

		api.GET("/events", s.getEvents)
		api.GET("/events/:id", s.getEvent)

		api.GET("/rules", s.getRules)
		api.GET("/rules/:id", s.getRule)
		api.POST("/rules", s.createRule)
		api.PUT("/rules/:id", s.updateRule)
		api.DELETE("/rules/:id", s.deleteRule)

		api.GET("/logs", s.getLogs)

		api.POST("/simulate/login-failed", s.simulateLoginFailed)
		api.POST("/simulate/login-success", s.simulateLoginSuccess)
		api.POST("/simulate/brute-force", s.simulateBruteForce)

		api.GET("/ws", s.handleWebSocket)

		api.GET("/health", s.healthCheck)

		api.GET("/anomalies", s.getAnomalyStats)
		api.POST("/simulate/ioc-event", s.simulateIOCEvent)

		api.GET("/iocs", s.getIOCs)
		api.POST("/iocs", s.createIOC)
		api.DELETE("/iocs/:id", s.deleteIOC)

		api.GET("/reports/generate", s.generateReport)
		api.GET("/reports/export/:format", s.exportReport)
	}

	s.router.Static("/", "./frontend/dist")
}

func (s *Server) Start() error {
	s.logger.Info("API server starting", zap.Int("port", s.port))
	return s.router.Run(fmt.Sprintf(":%d", s.port))
}

func (s *Server) broadcastAlert(alert *models.Alert) {
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()

	data, _ := json.Marshal(gin.H{
		"type":  "alert",
		"alert": alert,
	})

	for client := range s.clients {
		if err := client.WriteMessage(websocket.TextMessage, data); err != nil {
			s.logger.Warn("Failed to send websocket message", zap.Error(err))
			client.Close()
			delete(s.clients, client)
		}
	}
}

func (s *Server) broadcastAnomaly(anomaly *anomaly.AnomalyEvent) {
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()

	data, _ := json.Marshal(gin.H{
		"type":    "anomaly",
		"anomaly": anomaly,
	})

	for client := range s.clients {
		client.WriteMessage(websocket.TextMessage, data)
	}
}

func (s *Server) broadcastIOCMatch(match *threatintel.IOCMatch) {
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()

	data, _ := json.Marshal(gin.H{
		"type":  "ioc_match",
		"match": match,
	})

	for client := range s.clients {
		client.WriteMessage(websocket.TextMessage, data)
	}
}

func (s *Server) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		s.logger.Error("WebSocket upgrade failed", zap.Error(err))
		return
	}

	s.clientsMux.Lock()
	s.clients[conn] = true
	s.clientsMux.Unlock()

	s.logger.Info("WebSocket client connected")

	defer func() {
		s.clientsMux.Lock()
		delete(s.clients, conn)
		s.clientsMux.Unlock()
		conn.Close()
		s.logger.Info("WebSocket client disconnected")
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) getAlerts(c *gin.Context) {
	query := map[string]interface{}{
		"query": map[string]interface{}{
			"match_all": map[string]interface{}{},
		},
	}

	docs, err := s.es.Search("alerts", query, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": docs})
}

func (s *Server) getAlert(c *gin.Context) {
	id := c.Param("id")
	doc, err := s.es.Get("alerts", id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": doc})
}

func (s *Server) updateAlertStatus(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := s.es.Update("alerts", id, map[string]interface{}{"status": req.Status}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) getEvents(c *gin.Context) {
	query := map[string]interface{}{
		"query": map[string]interface{}{
			"match_all": map[string]interface{}{},
		},
	}

	docs, err := s.es.Search("events", query, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": docs})
}

func (s *Server) getEvent(c *gin.Context) {
	id := c.Param("id")
	doc, err := s.es.Get("events", id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Event not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": doc})
}

func (s *Server) getRules(c *gin.Context) {
	rules := s.engine.GetRules()
	c.JSON(http.StatusOK, gin.H{"data": rules})
}

func (s *Server) getRule(c *gin.Context) {
	id := c.Param("id")
	rule := s.engine.GetRule(id)
	if rule == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rule not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rule})
}

func (s *Server) createRule(c *gin.Context) {
	var rule models.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule.ID = uuid.New().String()
	rule.CreatedAt = time.Now()
	rule.UpdatedAt = time.Now()

	s.engine.AddRule(&rule)
	c.JSON(http.StatusCreated, gin.H{"data": rule})
}

func (s *Server) updateRule(c *gin.Context) {
	id := c.Param("id")
	var rule models.Rule
	if err := c.ShouldBindJSON(&rule); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule.ID = id
	rule.UpdatedAt = time.Now()

	s.engine.AddRule(&rule)
	c.JSON(http.StatusOK, gin.H{"data": rule})
}

func (s *Server) deleteRule(c *gin.Context) {
	id := c.Param("id")
	s.engine.DeleteRule(id)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) getLogs(c *gin.Context) {
	query := map[string]interface{}{
		"query": map[string]interface{}{
			"match_all": map[string]interface{}{},
		},
	}

	docs, err := s.es.Search("logs", query, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": docs})
}

func (s *Server) simulateLoginFailed(c *gin.Context) {
	var req struct {
		Hostname string `json:"hostname"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Hostname = "server01"
		req.Username = "admin"
	}

	s.syslogSrv.SimulateLoginFailure(req.Hostname, req.Username)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) simulateLoginSuccess(c *gin.Context) {
	var req struct {
		Hostname string `json:"hostname"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Hostname = "server01"
		req.Username = "admin"
	}

	s.syslogSrv.SimulateLoginSuccess(req.Hostname, req.Username)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) simulateBruteForce(c *gin.Context) {
	var req struct {
		Hostname string `json:"hostname"`
		Username string `json:"username"`
		Count    int    `json:"count"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Hostname = "server01"
		req.Username = "admin"
		req.Count = 5
	}

	for i := 0; i < req.Count; i++ {
		s.syslogSrv.SimulateLoginFailure(req.Hostname, req.Username)
		time.Sleep(100 * time.Millisecond)
	}

	time.Sleep(200 * time.Millisecond)
	s.syslogSrv.SimulateLoginSuccess(req.Hostname, req.Username)

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": fmt.Sprintf("Simulated %d failed logins followed by success", req.Count)})
}

func (s *Server) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

func (s *Server) getAnomalyStats(c *gin.Context) {
	stats := s.anomalyDetector.GetStats()
	isTraining := s.anomalyDetector.IsTraining()
	c.JSON(http.StatusOK, gin.H{
		"is_training": isTraining,
		"data":        stats,
	})
}

func (s *Server) getIOCs(c *gin.Context) {
	iocs := s.threatIntel.GetAllIOCs()
	c.JSON(http.StatusOK, gin.H{"data": iocs})
}

func (s *Server) createIOC(c *gin.Context) {
	var ioc threatintel.IOCEntry
	if err := c.ShouldBindJSON(&ioc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if ioc.ID == "" {
		ioc.ID = uuid.New().String()
	}
	ioc.CreatedAt = time.Now()
	ioc.Active = true

	if err := s.threatIntel.AddIOC(&ioc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": ioc})
}

func (s *Server) deleteIOC(c *gin.Context) {
	id := c.Param("id")
	s.threatIntel.RemoveIOC(id)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) simulateIOCEvent(c *gin.Context) {
	var req struct {
		Hostname string `json:"hostname"`
		IP       string `json:"ip"`
		Domain   string `json:"domain"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Hostname = "server01"
		req.IP = "192.168.1.100"
		req.Domain = "evil-phish.com"
	}

	s.syslogSrv.SimulateIOCEvent(req.Hostname, req.IP, req.Domain)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) generateReport(c *gin.Context) {
	daysStr := c.DefaultQuery("days", "7")
	days, err := strconv.Atoi(daysStr)
	if err != nil {
		days = 7
	}

	endTime := time.Now()
	startTime := endTime.AddDate(0, 0, -days)

	report, err := s.reportGen.GenerateReport(startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": report})
}

func (s *Server) exportReport(c *gin.Context) {
	format := strings.ToLower(c.Param("format"))
	daysStr := c.DefaultQuery("days", "7")
	days, _ := strconv.Atoi(daysStr)

	endTime := time.Now()
	startTime := endTime.AddDate(0, 0, -days)

	report, err := s.reportGen.GenerateReport(startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var data []byte
	var contentType string
	var filename string

	switch format {
	case "csv":
		data, err = s.reportGen.ExportCSV(report)
		contentType = "text/csv"
		filename = "report.csv"
	case "json":
		data, err = s.reportGen.ExportJSON(report)
		contentType = "application/json"
		filename = "report.json"
	case "html":
		data, err = s.reportGen.ExportHTML(report)
		contentType = "text/html"
		filename = "report.html"
	case "md", "markdown":
		data, err = s.reportGen.ExportMarkdown(report)
		contentType = "text/markdown"
		filename = "report.md"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported format. Use: csv, json, html, md"})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, contentType, data)
}

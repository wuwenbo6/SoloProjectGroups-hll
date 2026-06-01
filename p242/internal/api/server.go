package api

import (
	"alwayson-ag-simulator/internal/ag"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type ListenerStats interface {
	GetConnectionStats() map[string]interface{}
}

type Server struct {
	agManager *ag.AvailabilityGroup
	listener  ListenerStats
	Host      string
	Port      int
	router    *gin.Engine
	server    *http.Server
}

func NewServer(agManager *ag.AvailabilityGroup, host string, port int) *Server {
	gin.SetMode(gin.ReleaseMode)
	s := &Server{
		agManager: agManager,
		Host:      host,
		Port:      port,
		router:    gin.New(),
	}
	s.setupRoutes()
	return s
}

func (s *Server) SetListener(listener ListenerStats) {
	s.listener = listener
}

func (s *Server) setupRoutes() {
	s.router.Use(gin.Logger())
	s.router.Use(gin.Recovery())

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
		api.GET("/status", s.getStatus)
		api.GET("/health", s.getHealth)
		api.POST("/failover/:name", s.failover)
		api.POST("/replica/:name/fail", s.simulateFailure)
		api.POST("/replica/:name/recover", s.simulateRecovery)
		api.GET("/replicas", s.getReplicas)
		api.GET("/replicas/:name", s.getReplica)
		api.GET("/listener/stats", s.getListenerStats)
		api.GET("/replicas/readonly", s.getReadOnlyReplica)
		api.POST("/sync/suspend", s.suspendSync)
		api.POST("/sync/resume", s.resumeSync)
		api.GET("/failover/history", s.getFailoverHistory)
		api.GET("/failover/history/export", s.exportFailoverHistory)
	}
}

func (s *Server) Start() error {
	s.server = &http.Server{
		Addr:         fmt.Sprintf("%s:%d", s.Host, s.Port),
		Handler:      s.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	return s.server.ListenAndServe()
}

func (s *Server) Stop() error {
	if s.server != nil {
		return s.server.Close()
	}
	return nil
}

func (s *Server) getStatus(c *gin.Context) {
	status := s.agManager.GetStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}

func (s *Server) getHealth(c *gin.Context) {
	status := s.agManager.GetStatus()

	healthStatus := "healthy"
	httpStatus := http.StatusOK

	switch status.OverallHealth {
	case "WARNING":
		healthStatus = "warning"
	case "CRITICAL":
		healthStatus = "critical"
		httpStatus = http.StatusServiceUnavailable
	}

	c.JSON(httpStatus, gin.H{
		"success": true,
		"data": gin.H{
			"overall_health": healthStatus,
			"primary":        status.PrimaryReplica,
			"replica_count":  len(status.Replicas),
			"healthy_count":  countHealthy(status.Replicas),
			"failover_count": status.FailoverCount,
		},
	})
}

func countHealthy(replicas []ag.ReplicaStatus) int {
	count := 0
	for _, r := range replicas {
		if r.IsConnected && r.SyncHealth == "HEALTHY" {
			count++
		}
	}
	return count
}

func (s *Server) failover(c *gin.Context) {
	targetName := c.Param("name")

	if err := s.agManager.Failover(targetName); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	status := s.agManager.GetStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Failover completed successfully",
		"data": gin.H{
			"new_primary":     targetName,
			"previous_primary": getPreviousPrimary(status),
			"failover_count":  status.FailoverCount,
		},
	})
}

func getPreviousPrimary(status ag.AGStatus) string {
	for _, r := range status.Replicas {
		if r.Role == ag.Secondary && r.SyncState == ag.Synchronizing {
			return r.Name
		}
	}
	return ""
}

func (s *Server) simulateFailure(c *gin.Context) {
	name := c.Param("name")

	if err := s.agManager.SimulateReplicaFailure(name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Replica failure simulated",
		"data": gin.H{
			"replica": name,
			"status":  "failed",
		},
	})
}

func (s *Server) simulateRecovery(c *gin.Context) {
	name := c.Param("name")

	if err := s.agManager.SimulateReplicaRecovery(name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Replica recovery simulated",
		"data": gin.H{
			"replica": name,
			"status":  "recovering",
		},
	})
}

func (s *Server) getReplicas(c *gin.Context) {
	status := s.agManager.GetStatus()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status.Replicas,
	})
}

func (s *Server) getReplica(c *gin.Context) {
	name := c.Param("name")
	replica, exists := s.agManager.GetReplica(name)

	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Replica not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    replica.GetStatus(),
	})
}

func (s *Server) getListenerStats(c *gin.Context) {
	if s.listener == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "Listener not available",
		})
		return
	}

	stats := s.listener.GetConnectionStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
	})
}

func (s *Server) getReadOnlyReplica(c *gin.Context) {
	replica := s.agManager.SelectReadOnlyReplica()
	if replica == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"success": false,
			"error":   "No readable replica available",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    replica.GetStatus(),
	})
}

func (s *Server) suspendSync(c *gin.Context) {
	var req struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Reason = "manual"
	}

	s.agManager.SuspendSync(req.Reason)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Data synchronization suspended",
		"data": gin.H{
			"suspended": true,
			"reason":    req.Reason,
		},
	})
}

func (s *Server) resumeSync(c *gin.Context) {
	s.agManager.ResumeSync()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Data synchronization resumed",
		"data": gin.H{
			"suspended": false,
		},
	})
}

func (s *Server) getFailoverHistory(c *gin.Context) {
	history := s.agManager.GetFailoverHistory()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    history,
	})
}

func (s *Server) exportFailoverHistory(c *gin.Context) {
	history := s.agManager.GetFailoverHistory()
	format := c.DefaultQuery("format", "csv")

	if format == "json" {
		c.Header("Content-Disposition", "attachment; filename=failover_history.json")
		c.JSON(http.StatusOK, gin.H{
			"export_time": time.Now(),
			"total":       len(history),
			"history":     history,
		})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=failover_history.csv")

	csvData := "ID,Old Primary,New Primary,Timestamp,Reason,Manual\n"
	for _, r := range history {
		csvData += fmt.Sprintf("%d,%s,%s,%s,%s,%v\n",
			r.ID, r.OldPrimary, r.NewPrimary,
			r.Timestamp.Format(time.RFC3339), r.Reason, r.Manual)
	}

	c.String(http.StatusOK, csvData)
}

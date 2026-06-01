package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"radius-coa-server/internal/audit"
	"radius-coa-server/internal/coa"
	"radius-coa-server/internal/session"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type Server struct {
	httpServer *http.Server
	router     *gin.Engine
	sessionMgr *session.Manager
	coaServer  *coa.Server
	addr       string
}

type PolicyUpdateRequest struct {
	UploadSpeed   int64 `json:"upload_speed"`
	DownloadSpeed int64 `json:"download_speed"`
}

func NewServer(addr string, sessionMgr *session.Manager, coaServer *coa.Server) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	s := &Server{
		router:     router,
		sessionMgr: sessionMgr,
		coaServer:  coaServer,
		addr:       addr,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	api := s.router.Group("/api")
	{
		api.GET("/sessions", s.getSessions)
		api.GET("/sessions/:id", s.getSession)
		api.PUT("/sessions/:id/policy", s.updatePolicy)
		api.POST("/sessions/:id/disconnect", s.disconnectSession)
		api.GET("/stats", s.getStats)
		api.GET("/audit/logs", s.getAuditLogs)
	}

	s.router.NoRoute(s.serveStatic)
}

func (s *Server) serveStatic(c *gin.Context) {
	path := c.Request.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	filePath := filepath.Join("./web", path)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		filePath = "./web/index.html"
	}

	c.File(filePath)
}

func (s *Server) Start(ctx context.Context) error {
	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: s.router,
	}

	log.Printf("HTTP API server starting on %s", s.addr)

	errChan := make(chan error, 1)
	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errChan <- fmt.Errorf("http server: %w", err)
		}
	}()

	select {
	case err := <-errChan:
		return err
	case <-ctx.Done():
		return nil
	}
}

func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}

func (s *Server) getSessions(c *gin.Context) {
	status := c.Query("status")

	var sessions []*session.Session
	if status == "online" {
		sessions = s.sessionMgr.GetOnline()
	} else {
		sessions = s.sessionMgr.GetAll()
	}

	if sessions == nil {
		sessions = make([]*session.Session, 0)
	}

	c.JSON(http.StatusOK, gin.H{
		"total":    len(sessions),
		"sessions": sessions,
	})
}

func (s *Server) getSession(c *gin.Context) {
	id := c.Param("id")

	ses, ok := s.sessionMgr.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "Session not found"})
		return
	}

	c.JSON(http.StatusOK, ses)
}

func (s *Server) updatePolicy(c *gin.Context) {
	id := c.Param("id")
	operatorIP := c.ClientIP()

	var req PolicyUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.UploadSpeed <= 0 || req.DownloadSpeed <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Speed must be greater than 0"})
		return
	}

	ses, _ := s.sessionMgr.Get(id)
	oldPolicy := session.Policy{}
	if ses != nil {
		oldPolicy = ses.Policy
	}

	coaReq := coa.CoARequest{
		SessionID:     id,
		UploadSpeed:   req.UploadSpeed,
		DownloadSpeed: req.DownloadSpeed,
	}

	result, err := s.coaServer.SendCoA(coaReq)
	if err != nil {
		if ses != nil {
			audit.GetLogger().LogPolicyUpdate(ses.Username, id, ses.NASIP, operatorIP,
				oldPolicy, session.Policy{UploadSpeed: req.UploadSpeed, DownloadSpeed: req.DownloadSpeed},
				false, err.Error())
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if ses != nil {
		audit.GetLogger().LogPolicyUpdate(ses.Username, id, ses.NASIP, operatorIP,
			oldPolicy, session.Policy{UploadSpeed: req.UploadSpeed, DownloadSpeed: req.DownloadSpeed},
			result.Success, result.Message)
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) disconnectSession(c *gin.Context) {
	id := c.Param("id")
	operatorIP := c.ClientIP()

	ses, _ := s.sessionMgr.Get(id)

	result, err := s.coaServer.SendDisconnect(id)
	if err != nil {
		if ses != nil {
			audit.GetLogger().LogDisconnect(ses.Username, id, ses.NASIP, operatorIP,
				"Web UI manual disconnect", false, err.Error())
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if ses != nil {
		audit.GetLogger().LogDisconnect(ses.Username, id, ses.NASIP, operatorIP,
			"Web UI manual disconnect", result.Success, result.Message)
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) getAuditLogs(c *gin.Context) {
	action := c.Query("action")
	username := c.Query("username")
	limitStr := c.Query("limit")

	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	logs := audit.GetLogger().Query(audit.ActionType(action), username, limit)

	if logs == nil {
		logs = make([]*audit.LogEntry, 0)
	}

	c.JSON(http.StatusOK, gin.H{
		"total": len(logs),
		"logs":  logs,
	})
}

func (s *Server) getStats(c *gin.Context) {
	allSessions := s.sessionMgr.GetAll()
	onlineSessions := s.sessionMgr.GetOnline()

	totalUpload := int64(0)
	totalDownload := int64(0)
	for _, s := range onlineSessions {
		totalUpload += s.Policy.UploadSpeed
		totalDownload += s.Policy.DownloadSpeed
	}

	c.JSON(http.StatusOK, gin.H{
		"total_sessions":   len(allSessions),
		"online_sessions":  len(onlineSessions),
		"offline_sessions": len(allSessions) - len(onlineSessions),
		"total_upload_bw":  totalUpload,
		"total_download_bw": totalDownload,
	})
}

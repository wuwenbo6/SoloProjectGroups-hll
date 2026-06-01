package http

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"coap-gateway/internal/accesslog"
	"coap-gateway/internal/config"
	"coap-gateway/internal/converter"
	"coap-gateway/internal/database"
	"coap-gateway/internal/models"
	coapSvc "coap-gateway/internal/coap"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

type Server struct {
	cfg         *config.Config
	db          *database.Database
	logger      *zap.Logger
	coapServer  *coapSvc.Server
	router      *gin.Engine
	httpServer  *http.Server
}

func NewServer(cfg *config.Config, db *database.Database, coapServer *coapSvc.Server, logger *zap.Logger) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(accesslog.HTTPMiddleware())

	return &Server{
		cfg:        cfg,
		db:         db,
		logger:     logger,
		coapServer: coapServer,
		router:     router,
	}
}

func (s *Server) Start(ctx context.Context) error {
	s.setupRoutes()

	addr := fmt.Sprintf("%s:%d", s.cfg.Server.HTTP.Host, s.cfg.Server.HTTP.Port)
	s.logger.Info("Starting HTTP server", zap.String("addr", addr))

	s.httpServer = &http.Server{
		Addr:    addr,
		Handler: s.router,
	}

	go func() {
		<-ctx.Done()
		s.logger.Info("Stopping HTTP server")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.httpServer.Shutdown(shutdownCtx)
	}()

	go func() {
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			s.logger.Error("HTTP server error", zap.Error(err))
		}
	}()

	return nil
}

func (s *Server) setupRoutes() {
	api := s.router.Group("/api")
	{
		api.GET("/health", s.healthCheck)

		devices := api.Group("/devices")
		{
			devices.GET("", s.listDevices)
			devices.GET("/:id", s.getDevice)
			devices.POST("", s.createDevice)
			devices.PUT("/:id", s.updateDevice)
			devices.DELETE("/:id", s.deleteDevice)
		}

		routes := api.Group("/routes")
		{
			routes.GET("", s.listRoutes)
			routes.GET("/:id", s.getRoute)
			routes.POST("", s.createRoute)
			routes.PUT("/:id", s.updateRoute)
			routes.DELETE("/:id", s.deleteRoute)
		}

		api.GET("/subscriptions", s.listSubscriptions)
		api.GET("/stats", s.getStats)

		sse := api.Group("/sse")
		{
			sse.GET("/devices/:id/*path", s.sseObserve)
		}
	}

	s.router.NoRoute(s.handleDynamicRoute)
}

func (s *Server) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status": "ok",
		"time":   time.Now().UTC(),
	})
}

func (s *Server) listDevices(c *gin.Context) {
	devices, err := s.db.ListDevices()
	if err != nil {
		s.logger.Error("List devices failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list devices"})
		return
	}

	connectedDevices := make(map[string]bool)
	for _, id := range s.coapServer.ListDevices() {
		connectedDevices[id] = true
	}

	for _, device := range devices {
		device.Status = "offline"
		if connectedDevices[device.DeviceID] {
			device.Status = "online"
		}
	}

	c.JSON(http.StatusOK, devices)
}

func (s *Server) getDevice(c *gin.Context) {
	id := c.Param("id")
	device, err := s.db.GetDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		s.logger.Error("Get device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device"})
		return
	}
	c.JSON(http.StatusOK, device)
}

func (s *Server) createDevice(c *gin.Context) {
	var device models.Device
	if err := c.ShouldBindJSON(&device); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if device.DeviceID == "" || device.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id and name are required"})
		return
	}

	if err := s.db.CreateDevice(&device); err != nil {
		s.logger.Error("Create device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create device"})
		return
	}

	c.JSON(http.StatusCreated, device)
}

func (s *Server) updateDevice(c *gin.Context) {
	id := c.Param("id")
	_, err := s.db.GetDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		s.logger.Error("Get device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device"})
		return
	}

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	delete(updates, "id")
	delete(updates, "device_id")
	delete(updates, "created_at")

	if err := s.db.UpdateDevice(id, updates); err != nil {
		s.logger.Error("Update device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device updated successfully"})
}

func (s *Server) deleteDevice(c *gin.Context) {
	id := c.Param("id")

	_, err := s.db.GetDevice(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		s.logger.Error("Get device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device"})
		return
	}

	if err := s.db.DeleteDevice(id); err != nil {
		s.logger.Error("Delete device failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete device"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Device deleted successfully"})
}

func (s *Server) listRoutes(c *gin.Context) {
	routes, err := s.db.ListRoutes()
	if err != nil {
		s.logger.Error("List routes failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list routes"})
		return
	}
	c.JSON(http.StatusOK, routes)
}

func (s *Server) getRoute(c *gin.Context) {
	id := c.Param("id")
	route, err := s.db.GetRoute(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Route not found"})
			return
		}
		s.logger.Error("Get route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get route"})
		return
	}
	c.JSON(http.StatusOK, route)
}

func (s *Server) createRoute(c *gin.Context) {
	var route models.Route
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if route.DeviceID == "" || route.CoAPPath == "" || route.HTTPPath == "" || route.Method == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id, coap_path, http_path, and method are required"})
		return
	}

	if err := s.db.CreateRoute(&route); err != nil {
		s.logger.Error("Create route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create route"})
		return
	}

	c.JSON(http.StatusCreated, route)
}

func (s *Server) updateRoute(c *gin.Context) {
	id := c.Param("id")
	_, err := s.db.GetRoute(id)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Route not found"})
			return
		}
		s.logger.Error("Get route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get route"})
		return
	}

	var updates map[string]interface{}
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	delete(updates, "id")
	delete(updates, "created_at")

	if err := s.db.UpdateRoute(id, updates); err != nil {
		s.logger.Error("Update route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update route"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Route updated successfully"})
}

func (s *Server) deleteRoute(c *gin.Context) {
	id := c.Param("id")
	if err := s.db.DeleteRoute(id); err != nil {
		s.logger.Error("Delete route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete route"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Route deleted"})
}

func (s *Server) listSubscriptions(c *gin.Context) {
	subs, err := s.db.GetActiveSubscriptions()
	if err != nil {
		s.logger.Error("List subscriptions failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list subscriptions"})
		return
	}
	c.JSON(http.StatusOK, subs)
}

func (s *Server) getStats(c *gin.Context) {
	observeMgr := s.coapServer.GetObserveManager()
	stats := gin.H{
		"connected_devices":     len(s.coapServer.ListDevices()),
		"observe_subscriptions": observeMgr.GetSubscriptionCount(),
		"sse_subscribers":       observeMgr.GetSSESubscriberCount(),
	}
	c.JSON(http.StatusOK, stats)
}

func (s *Server) sseObserve(c *gin.Context) {
	deviceID := c.Param("id")
	path := c.Param("path")
	if path == "" {
		path = "/"
	}

	_, err := s.db.GetDevice(deviceID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "Device not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get device"})
		return
	}

	observeMgr := s.coapServer.GetObserveManager()
	subscriber, err := observeMgr.AddSSESubscriber(deviceID, path)
	if err != nil {
		s.logger.Error("Add SSE subscriber failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
		return
	}
	defer observeMgr.RemoveSSESubscriber(subscriber)

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")

	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Flush()

	converter.WriteSSEEvent(c.Writer, &models.SSEEvent{
		Event: "connected",
		Data:  fmt.Sprintf("Subscribed to device %s, path %s", deviceID, path),
	})

	for {
		select {
		case <-c.Request.Context().Done():
			s.logger.Info("SSE client disconnected", zap.String("device_id", deviceID), zap.String("path", path))
			return
		case event, ok := <-subscriber.Events:
			if !ok {
				return
			}
			converter.WriteSSEEvent(c.Writer, event)
		}
	}
}

func (s *Server) handleDynamicRoute(c *gin.Context) {
	httpPath := c.Request.URL.Path
	method := c.Request.Method

	s.logger.Debug("Dynamic route request",
		zap.String("path", httpPath),
		zap.String("method", method),
	)

	if strings.HasPrefix(httpPath, "/api/") {
		c.JSON(http.StatusNotFound, gin.H{"error": "API endpoint not found"})
		return
	}

	route, err := s.db.GetRouteByHTTPPath(httpPath, method)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("No route found for %s %s", method, httpPath),
				"hint":  "Create a route first via POST /api/routes",
			})
			return
		}
		s.logger.Error("Get route failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to lookup route"})
		return
	}

	s.forwardToCoAP(c, route)
}

func (s *Server) forwardToCoAP(c *gin.Context, route *models.Route) {
	deviceID := route.DeviceID
	coapPath := route.CoAPPath

	conn := s.coapServer.GetDeviceConnection(deviceID)
	if conn == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Device is not connected"})
		return
	}

	tokenMgr := s.coapServer.GetTokenManager()
	httpRequestID := c.GetHeader("X-Request-ID")
	if httpRequestID == "" {
		httpRequestID = coapSvc.GenerateHTTPRequestID()
	}
	c.Header("X-Request-ID", httpRequestID)

	coapToken, err := tokenMgr.GenerateToken()
	if err != nil {
		s.logger.Error("Generate CoAP token failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate request token"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(s.cfg.Gateway.Timeout)*time.Second)
	defer cancel()

	coapMsg, err := converter.HTTPRequestToCoAPMessage(ctx, conn, c, coapPath, coapToken)
	if err != nil {
		s.logger.Error("Convert HTTP to CoAP failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to convert request"})
		return
	}
	defer conn.ReleaseMessage(coapMsg)

	tokenStr := coapSvc.TokenToString(coapToken)
	tokenMgr.RegisterMapping(httpRequestID, tokenStr, deviceID, coapPath, time.Duration(s.cfg.Gateway.Timeout)*2*time.Second)

	coapResp, err := conn.Do(coapMsg)
	if err != nil {
		s.logger.Error("Send CoAP request failed", zap.Error(err))
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Device request timeout"})
		return
	}
	defer conn.ReleaseMessage(coapResp)

	tokenMgr.RemoveMapping(tokenStr)

	respToken := coapSvc.TokenToString(coapResp.Token())
	c.Header("X-CoAP-Token", respToken)

	if err := converter.CoAPResponseToHTTPResponse(coapResp, c.Writer); err != nil {
		s.logger.Error("Convert CoAP to HTTP failed", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to convert response"})
		return
	}
}

package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"

	"modbus-gateway/modbus"
	"modbus-gateway/stats"
	"modbus-gateway/system"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.bug.st/serial/enumerator"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Server struct {
	router       *modbus.Router
	forwarder    *modbus.Forwarder
	statsMgr     *stats.Manager
	hub          *Hub
	systemStatus *system.Status
}

type Hub struct {
	clients   map[*websocket.Conn]bool
	broadcast chan []byte
	mu        sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan []byte, 256),
	}
}

func (h *Hub) Run() {
	for {
		msg := <-h.broadcast
		h.mu.RLock()
		for client := range h.clients {
			err := client.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				h.mu.RUnlock()
				h.mu.Lock()
				delete(h.clients, client)
				client.Close()
				h.mu.Unlock()
				h.mu.RLock()
			}
		}
		h.mu.RUnlock()
	}
}

func (h *Hub) BroadcastStats(allStats map[int]stats.RouteStats) {
	data, _ := json.Marshal(allStats)
	select {
	case h.broadcast <- data:
	default:
	}
}

func NewServer(router *modbus.Router, forwarder *modbus.Forwarder, statsMgr *stats.Manager, systemStatus *system.Status) *Server {
	hub := NewHub()
	go hub.Run()
	return &Server{
		router:       router,
		forwarder:    forwarder,
		statsMgr:     statsMgr,
		hub:          hub,
		systemStatus: systemStatus,
	}
}

func (s *Server) SetupRoutes() *gin.Engine {
	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	api := r.Group("/api")
	{
		api.GET("/routes", s.GetRoutes)
		api.POST("/routes", s.CreateRoute)
		api.PUT("/routes/:id", s.UpdateRoute)
		api.DELETE("/routes/:id", s.DeleteRoute)
		api.PATCH("/routes/:id/toggle", s.ToggleRoute)

		api.GET("/stats", s.GetStats)
		api.GET("/stats/:routeId", s.GetRouteStats)
		api.DELETE("/stats/:routeId", s.ResetRouteStats)

		api.POST("/test", s.TestRegister)
		api.GET("/serial-ports", s.GetSerialPorts)
		api.GET("/status", s.GetStatus)
	}

	r.GET("/ws", s.HandleWebSocket)

	return r
}

func (s *Server) GetRoutes(c *gin.Context) {
	routes := s.router.GetAll()
	sysStatus := s.systemStatus.Get()
	routesWithErrors := make([]gin.H, len(routes))
	for i, route := range routes {
		serialError, hasError := sysStatus.SerialErrors[route.ID]
		activePath := s.forwarder.GetActivePath(route.ID)
		routesWithErrors[i] = gin.H{
			"id":         route.ID,
			"ipAddress":  route.IPAddress,
			"serialPort": route.SerialPort,
			"baudRate":   route.BaudRate,
			"dataBits":   route.DataBits,
			"parity":     route.Parity,
			"stopBits":   route.StopBits,
			"slaveId":    route.SlaveID,
			"enabled":    route.Enabled,
			"backup":     route.Backup,
			"activePath": activePath,
			"serialError": serialError,
			"hasError":   hasError,
		}
	}
	c.JSON(http.StatusOK, gin.H{"data": routesWithErrors})
}

func (s *Server) GetStatus(c *gin.Context) {
	status := s.systemStatus.Get()
	c.JSON(http.StatusOK, gin.H{"data": status})
}

func (s *Server) CreateRoute(c *gin.Context) {
	var route modbus.Route
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	route.Enabled = true
	created, err := s.router.Add(&route)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s.statsMgr.InitRoute(created.ID)
	c.JSON(http.StatusCreated, gin.H{"data": created})
}

func (s *Server) UpdateRoute(c *gin.Context) {
	id := parseIntParam(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var route modbus.Route
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, err := s.router.Update(id, &route)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": updated})
}

func (s *Server) DeleteRoute(c *gin.Context) {
	id := parseIntParam(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := s.router.Delete(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	s.statsMgr.Remove(id)
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

func (s *Server) ToggleRoute(c *gin.Context) {
	id := parseIntParam(c.Param("id"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := s.router.ToggleEnabled(id, body.Enabled); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !body.Enabled {
		s.forwarder.RemoveClient(id)
	}
	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

func (s *Server) GetStats(c *gin.Context) {
	allStats := s.statsMgr.GetAll()
	s.hub.BroadcastStats(allStats)
	c.JSON(http.StatusOK, gin.H{"data": allStats})
}

func (s *Server) GetRouteStats(c *gin.Context) {
	id := parseIntParam(c.Param("routeId"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route id"})
		return
	}
	st, ok := s.statsMgr.Get(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": st})
}

func (s *Server) ResetRouteStats(c *gin.Context) {
	id := parseIntParam(c.Param("routeId"))
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid route id"})
		return
	}
	s.statsMgr.Reset(id)
	c.JSON(http.StatusOK, gin.H{"message": "reset"})
}

func (s *Server) TestRegister(c *gin.Context) {
	var req modbus.TestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	route, ok := s.router.Get(req.RouteID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "route not found"})
		return
	}
	result, err := s.forwarder.DirectTest(route, req.FunctionCode, req.Address, req.Quantity, req.Value)
	if err != nil {
		c.JSON(http.StatusOK, modbus.TestResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, modbus.TestResponse{
		Success: true,
		Data:    result,
	})
}

func (s *Server) GetSerialPorts(c *gin.Context) {
	ports, err := listSerialPorts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": ports})
}

func (s *Server) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	s.hub.mu.Lock()
	s.hub.clients[conn] = true
	s.hub.mu.Unlock()

	log.Printf("WebSocket client connected, total: %d", len(s.hub.clients))

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}

	s.hub.mu.Lock()
	delete(s.hub.clients, conn)
	s.hub.mu.Unlock()
	conn.Close()
	log.Printf("WebSocket client disconnected, total: %d", len(s.hub.clients))
}

func parseIntParam(s string) int {
	id, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return id
}

func listSerialPorts() ([]string, error) {
	ports, err := enumerator.GetDetailedPortsList()
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(ports))
	for _, p := range ports {
		names = append(names, p.Name)
	}
	return names, nil
}

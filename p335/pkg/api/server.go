package api

import (
	"mqtt-sn-gateway/pkg/device"
	"mqtt-sn-gateway/pkg/gateway"
	"net/http"

	"github.com/gin-gonic/gin"
)

type Server struct {
	engine  *gin.Engine
	gateway *gateway.Gateway
	addr    string
}

func NewServer(addr string, gw *gateway.Gateway) *Server {
	gin.SetMode(gin.ReleaseMode)
	engine := gin.Default()
	s := &Server{
		engine:  engine,
		gateway: gw,
		addr:    addr,
	}
	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	api := s.engine.Group("/api/v1")
	{
		api.GET("/devices", s.listDevices)
		api.GET("/devices/:id", s.getDevice)
		api.GET("/topics", s.listTopics)
		api.GET("/subscriptions", s.listSubscriptions)
		api.GET("/queues", s.listQueues)
		api.GET("/queues/:id", s.getDeviceQueue)
		api.DELETE("/queues/:id", s.clearDeviceQueue)
		api.GET("/stats", s.getStats)
		api.GET("/stats/detailed", s.getDetailedStats)
		api.DELETE("/stats", s.resetStats)
	}
	s.engine.Static("/ui", "./web")
	s.engine.GET("/", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/ui/")
	})
}

func (s *Server) Run() error {
	return s.engine.Run(s.addr)
}

func (s *Server) listDevices(c *gin.Context) {
	devices := s.gateway.GetDevices()
	c.JSON(http.StatusOK, gin.H{
		"devices": devices,
		"count":   len(devices),
	})
}

func (s *Server) getDevice(c *gin.Context) {
	id := c.Param("id")
	dev := s.gateway.GetDevice(id)
	if dev == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "device not found"})
		return
	}
	c.JSON(http.StatusOK, dev)
}

func (s *Server) listTopics(c *gin.Context) {
	topics := s.gateway.GetDeviceManager().GetAllTopics()
	c.JSON(http.StatusOK, gin.H{
		"topics": topics,
		"count":  len(topics),
	})
}

func (s *Server) listSubscriptions(c *gin.Context) {
	subs := s.gateway.GetDeviceManager().GetAllSubscriptions()
	c.JSON(http.StatusOK, gin.H{
		"subscriptions": subs,
	})
}

func (s *Server) listQueues(c *gin.Context) {
	sizes := s.gateway.GetDeviceManager().GetAllQueueSizes()
	c.JSON(http.StatusOK, gin.H{
		"queues": sizes,
	})
}

func (s *Server) getDeviceQueue(c *gin.Context) {
	id := c.Param("id")
	msgs := s.gateway.GetDeviceManager().GetQueuedMessages(id)
	if msgs == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no queue for device"})
		return
	}
	type queueEntry struct {
		Topic     string `json:"topic"`
		Payload   string `json:"payload"`
		QoS       byte   `json:"qos"`
		Timestamp string `json:"timestamp"`
	}
	entries := make([]queueEntry, 0, len(msgs))
	for _, m := range msgs {
		entries = append(entries, queueEntry{
			Topic:     m.Topic,
			Payload:   string(m.Payload),
			QoS:       m.QoS,
			Timestamp: m.Timestamp.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"client_id":  id,
		"messages":   entries,
		"queue_size": len(entries),
	})
}

func (s *Server) clearDeviceQueue(c *gin.Context) {
	id := c.Param("id")
	s.gateway.GetDeviceManager().ClearQueuedMessages(id)
	c.JSON(http.StatusOK, gin.H{"message": "queue cleared", "client_id": id})
}

func (s *Server) getStats(c *gin.Context) {
	devices := s.gateway.GetDevices()
	topics := s.gateway.GetDeviceManager().GetAllTopics()
	queueSizes := s.gateway.GetDeviceManager().GetAllQueueSizes()
	gwStats := s.gateway.GetStats()

	totalQueued := 0
	for _, sz := range queueSizes {
		totalQueued += sz
	}

	online := 0
	sleeping := 0
	for _, d := range devices {
		if d.Sleeping {
			sleeping++
		} else if d.Connected {
			online++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"gateway_id":         gwStats.GatewayID,
		"devices_total":      len(devices),
		"devices_online":     online,
		"devices_sleeping":   sleeping,
		"topics_count":       len(topics),
		"total_queued":       totalQueued,
		"messages_uplink":    gwStats.Uplink,
		"messages_downlink":  gwStats.Downlink,
		"messages_queued":    gwStats.Queued,
		"messages_delivered": gwStats.Delivered,
		"messages_dropped":   gwStats.Dropped,
		"mqtt_connected":     true,
	})
}

func (s *Server) getDetailedStats(c *gin.Context) {
	stats := s.gateway.GetStats()
	c.JSON(http.StatusOK, stats)
}

func (s *Server) resetStats(c *gin.Context) {
	s.gateway.ResetStats()
	c.JSON(http.StatusOK, gin.H{"message": "stats reset"})
}

func ToJSONTopics(topics []device.TopicInfo) []map[string]interface{} {
	result := make([]map[string]interface{}, 0, len(topics))
	for _, t := range topics {
		result = append(result, map[string]interface{}{
			"topic_id":   t.TopicID,
			"topic_name": t.TopicName,
		})
	}
	return result
}

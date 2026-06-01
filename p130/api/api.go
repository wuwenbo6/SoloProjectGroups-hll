package api

import (
	"net/http"
	"strconv"

	"sip-analyzer/database"
	"sip-analyzer/pcap"

	"github.com/gin-gonic/gin"
)

type Server struct {
	db  *database.Database
	gin *gin.Engine
}

func NewServer(db *database.Database) *Server {
	return &Server{
		db:  db,
		gin: gin.Default(),
	}
}

func (s *Server) SetupRoutes() {
	s.gin.Use(CORSMiddleware())

	api := s.gin.Group("/api")
	{
		api.GET("/calls", s.getRecentCalls)
		api.GET("/calls/search", s.searchCalls)
		api.GET("/calls/:call_id", s.getCallDetail)
		api.GET("/calls/:call_id/messages", s.getCallMessages)
		api.GET("/calls/:call_id/flow", s.getCallFlow)
		api.GET("/calls/:call_id/rtp", s.getCallRTP)
		api.GET("/calls/:call_id/pcap", s.exportCallPCAP)

		api.GET("/alerts", s.getAlerts)
		api.POST("/alerts/:id/acknowledge", s.acknowledgeAlert)

		api.GET("/health", s.healthCheck)
	}
}

func (s *Server) Start(port int) error {
	s.SetupRoutes()
	return s.gin.Run(":" + strconv.Itoa(port))
}

func (s *Server) Gin() *gin.Engine {
	return s.gin
}

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func (s *Server) getRecentCalls(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100
	}

	calls, err := s.db.GetRecentCalls(limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"calls":  calls,
		"limit":  limit,
		"offset": offset,
		"total":  len(calls),
	})
}

func (s *Server) searchCalls(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyword parameter is required"})
		return
	}

	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 100 {
		limit = 100
	}

	calls, err := s.db.SearchCalls(keyword, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"calls":   calls,
		"keyword": keyword,
		"limit":   limit,
		"offset":  offset,
		"total":   len(calls),
	})
}

func (s *Server) getCallDetail(c *gin.Context) {
	callID := c.Param("call_id")

	messages, err := s.db.GetMessagesByCallID(callID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(messages) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "call not found"})
		return
	}

	var fromUser, toUser string
	var startTime, endTime *string
	status := "in_progress"

	for _, msg := range messages {
		if msg.Method == "INVITE" {
			fromUser = msg.FromUser
			toUser = msg.ToUser
			ts := msg.Timestamp.Format("2006-01-02T15:04:05.000Z")
			startTime = &ts
		}
		if msg.Method == "BYE" {
			ts := msg.Timestamp.Format("2006-01-02T15:04:05.000Z")
			endTime = &ts
			status = "completed"
		}
		if msg.StatusCode == 200 && status == "in_progress" {
			status = "answered"
		}
	}

	rtpStreams, _ := s.db.GetRTPStreamsByCallID(callID)
	var avgMOS *float64
	if len(rtpStreams) > 0 {
		totalMOS := 0.0
		count := 0
		for _, stream := range rtpStreams {
			if stream.MOSScore > 0 {
				totalMOS += stream.MOSScore
				count++
			}
		}
		if count > 0 {
			mos := totalMOS / float64(count)
			avgMOS = &mos
		}
	}

	detail := gin.H{
		"call_id":       callID,
		"from_user":     fromUser,
		"to_user":       toUser,
		"start_time":    startTime,
		"end_time":      endTime,
		"status":        status,
		"message_count": len(messages),
		"messages":      messages,
		"rtp_streams":   rtpStreams,
		"avg_mos":       avgMOS,
	}

	c.JSON(http.StatusOK, detail)
}

func (s *Server) getCallMessages(c *gin.Context) {
	callID := c.Param("call_id")

	messages, err := s.db.GetMessagesByCallID(callID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"call_id":  callID,
		"messages": messages,
		"total":    len(messages),
	})
}

func (s *Server) getCallFlow(c *gin.Context) {
	callID := c.Param("call_id")

	messages, err := s.db.GetMessagesByCallID(callID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(messages) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "call not found"})
		return
	}

	participants := make(map[string]string)
	for _, msg := range messages {
		if msg.SourceIP != "" {
			participants[msg.SourceIP] = msg.SourceIP
		}
		if msg.DestIP != "" {
			participants[msg.DestIP] = msg.DestIP
		}
	}

	var participantList []string
	for p := range participants {
		participantList = append(participantList, p)
	}

	type FlowStep struct {
		Index      int    `json:"index"`
		From       string `json:"from"`
		To         string `json:"to"`
		Method     string `json:"method"`
		StatusCode int    `json:"status_code"`
		Summary    string `json:"summary"`
		Timestamp  string `json:"timestamp"`
	}

	var flowSteps []FlowStep
	for i, msg := range messages {
		summary := msg.Method
		if msg.StatusCode > 0 {
			summary = strconv.Itoa(msg.StatusCode)
		}

		flowSteps = append(flowSteps, FlowStep{
			Index:      i,
			From:       msg.SourceIP,
			To:         msg.DestIP,
			Method:     msg.Method,
			StatusCode: msg.StatusCode,
			Summary:    summary,
			Timestamp:  msg.Timestamp.Format("15:04:05.000"),
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"call_id":      callID,
		"participants": participantList,
		"flow":         flowSteps,
		"total":        len(flowSteps),
	})
}

func (s *Server) getCallRTP(c *gin.Context) {
	callID := c.Param("call_id")

	streams, err := s.db.GetRTPStreamsByCallID(callID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"call_id": callID,
		"streams": streams,
		"total":   len(streams),
	})
}

func (s *Server) exportCallPCAP(c *gin.Context) {
	callID := c.Param("call_id")

	messages, err := s.db.GetMessagesByCallID(callID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if len(messages) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "call not found"})
		return
	}

	rtpStreams, _ := s.db.GetRTPStreamsByCallID(callID)

	pcapData, err := pcap.ExportCallToPCAP(callID, messages, rtpStreams)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate PCAP: " + err.Error()})
		return
	}

	filename := callID + ".pcap"
	c.Header("Content-Type", "application/vnd.tcpdump.pcap")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Data(http.StatusOK, "application/vnd.tcpdump.pcap", pcapData)
}

func (s *Server) getAlerts(c *gin.Context) {
	severity := c.DefaultQuery("severity", "all")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	if limit > 200 {
		limit = 200
	}

	alerts, err := s.db.GetAlerts(severity, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"alerts":   alerts,
		"severity": severity,
		"limit":    limit,
		"offset":   offset,
		"total":    len(alerts),
	})
}

func (s *Server) acknowledgeAlert(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	if err := s.db.AcknowledgeAlert(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status": "success",
		"alert_id": id,
	})
}

func (s *Server) healthCheck(c *gin.Context) {
	err := s.db.Ping()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":   "unhealthy",
			"database": "disconnected",
			"error":    err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":   "healthy",
		"database": "connected",
	})
}

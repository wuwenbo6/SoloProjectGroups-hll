package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"sflow-analyzer/internal/anomaly"
	"sflow-analyzer/internal/bgp"
	"sflow-analyzer/internal/report"
	"sflow-analyzer/internal/sflow"
	"sflow-analyzer/internal/storage"
	"sflow-analyzer/internal/stream"
	"sflow-analyzer/pkg/types"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Server struct {
	router     *gin.Engine
	receiver   *sflow.Receiver
	processor  *stream.Processor
	storage    *storage.Storage
	detector   *anomaly.Detector
	bgpLookup  *bgp.BGPLookup
	reportGen  *report.Generator
	clients    map[*websocket.Conn]bool
	clientsMu  sync.Mutex
	broadcast  chan types.WebSocketMessage
	asnFilter  uint32
}

func NewServer(receiver *sflow.Receiver, processor *stream.Processor, storage *storage.Storage,
	detector *anomaly.Detector, bgpLookup *bgp.BGPLookup, reportGen *report.Generator) *Server {
	gin.SetMode(gin.ReleaseMode)
	s := &Server{
		router:    gin.Default(),
		receiver:  receiver,
		processor: processor,
		storage:   storage,
		detector:  detector,
		bgpLookup: bgpLookup,
		reportGen: reportGen,
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan types.WebSocketMessage, 100),
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := s.router.Group("/api")
	{
		api.GET("/stats", s.getStats)
		api.GET("/topn", s.getTopN)
		api.GET("/historical", s.getHistorical)
		api.GET("/historical/topn", s.getHistoricalTopN)
		api.GET("/historical/traffic", s.getHistoricalTraffic)
		api.GET("/asns", s.getASNs)
		api.POST("/filter/asn", s.setASNFilter)
		api.GET("/filter/asn", s.getASNFilter)
		api.POST("/mock", s.sendMockFlow)
		api.GET("/ws", s.handleWebSocket)

		alerts := api.Group("/alerts")
		{
			alerts.GET("", s.getAlerts)
			alerts.GET("/baseline", s.getBaseline)
			alerts.GET("/offenders", s.getTopOffenders)
			alerts.POST("/config", s.updateAlertConfig)
		}

		bgp := api.Group("/bgp")
		{
			bgp.GET("/lookup/:ip", s.bgpLookup)
			bgp.GET("/routes", s.getBGPRoutes)
			bgp.POST("/routes", s.addBGPRoute)
			bgp.DELETE("/routes/:prefix", s.removeBGPRoute)
			bgp.GET("/stats", s.getBGPStats)
			bgp.POST("/import", s.importPrefixes)
		}

		reports := api.Group("/reports")
		{
			reports.GET("/topn", s.generateTopNReport)
			reports.GET("/historical", s.generateHistoricalReport)
			reports.GET("/alerts", s.generateAlertsReport)
			reports.GET("/full", s.generateFullReport)
		}
	}

	s.router.Static("/", "./frontend/dist")
}

func (s *Server) Start(addr string) error {
	go s.broadcastLoop()
	go s.streamToWebSocket()

	log.Printf("API server starting on %s", addr)
	return s.router.Run(addr)
}

func (s *Server) broadcastLoop() {
	for msg := range s.broadcast {
		s.clientsMu.Lock()
		for client := range s.clients {
			err := client.WriteJSON(msg)
			if err != nil {
				client.Close()
				delete(s.clients, client)
			}
		}
		s.clientsMu.Unlock()
	}
}

func (s *Server) streamToWebSocket() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		topN := s.processor.GetCurrentTopN()
		msg := types.WebSocketMessage{
			Type:      "topn",
			Data:      topN,
			Timestamp: time.Now(),
		}

		select {
		case s.broadcast <- msg:
		default:
		}

		stats := s.getStatsData()
		statsMsg := types.WebSocketMessage{
			Type:      "stats",
			Data:      stats,
			Timestamp: time.Now(),
		}

		select {
		case s.broadcast <- statsMsg:
		default:
		}
	}
}

func (s *Server) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) getStats(c *gin.Context) {
	c.JSON(http.StatusOK, s.getStatsData())
}

func (s *Server) getStatsData() map[string]interface{} {
	receiverStats := s.receiver.GetStats()
	totalBytes, totalPackets := s.processor.GetTotalStats()
	storageStats := s.storage.GetStats()

	return map[string]interface{}{
		"receiver": map[string]interface{}{
			"packets_received":     receiverStats.PacketsReceived,
			"packets_dropped":      receiverStats.PacketsDropped,
			"records_parsed":       receiverStats.RecordsParsed,
			"bytes_received":       receiverStats.BytesReceived,
			"last_packet_time":     receiverStats.LastPacketTime,
			"errors":               receiverStats.Errors,
			"kernel_drops":         receiverStats.KernelDrops,
			"estimated_lost_bytes": receiverStats.EstimatedLostBytes,
			"drop_rate":            receiverStats.DropRate,
			"compensated_bytes":    receiverStats.CompensatedBytes,
		},
		"processor": map[string]interface{}{
			"total_bytes":       totalBytes,
			"total_packets":     totalPackets,
			"window_count":      s.processor.GetWindowCount(),
			"last_update_time":  s.processor.GetLastUpdateTime(),
			"flow_rate":         s.processor.GetFlowRate(),
			"asn_filter":        s.processor.GetASNFilter(),
		},
		"storage": storageStats,
		"connected_clients": len(s.clients),
	}
}

func (s *Server) getTopN(c *gin.Context) {
	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}

	topN := s.processor.GetCurrentTopN()
	if len(topN.IPPairs) > limit {
		topN.IPPairs = topN.IPPairs[:limit]
	}
	if len(topN.Apps) > limit {
		topN.Apps = topN.Apps[:limit]
	}

	c.JSON(http.StatusOK, topN)
}

func (s *Server) getHistorical(c *gin.Context) {
	query, err := s.parseHistoricalQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	records, err := s.storage.QueryHistorical(*query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, records)
}

func (s *Server) getHistoricalTopN(c *gin.Context) {
	query, err := s.parseHistoricalQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if query.Limit == 0 {
		query.Limit = 10
	}

	result, err := s.storage.QueryTopNHistorical(*query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) getHistoricalTraffic(c *gin.Context) {
	query, err := s.parseHistoricalQuery(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := s.storage.QueryTrafficOverTime(*query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func (s *Server) parseHistoricalQuery(c *gin.Context) (*types.HistoricalQuery, error) {
	query := &types.HistoricalQuery{
		EndTime: time.Now(),
	}

	if start := c.Query("start"); start != "" {
		if t, err := time.Parse(time.RFC3339, start); err == nil {
			query.StartTime = t
		}
	}
	if query.StartTime.IsZero() {
		query.StartTime = time.Now().Add(-1 * time.Hour)
	}

	if end := c.Query("end"); end != "" {
		if t, err := time.Parse(time.RFC3339, end); err == nil {
			query.EndTime = t
		}
	}

	if asn := c.Query("asn"); asn != "" {
		if a, err := strconv.ParseUint(asn, 10, 32); err == nil {
			query.ASNFilter = uint32(a)
		}
	}

	if limit := c.Query("limit"); limit != "" {
		if l, err := strconv.Atoi(limit); err == nil {
			query.Limit = l
		}
	}

	return query, nil
}

func (s *Server) getASNs(c *gin.Context) {
	asns := s.storage.GetASNResolver().GetAllASNs()
	c.JSON(http.StatusOK, asns)
}

func (s *Server) setASNFilter(c *gin.Context) {
	var req struct {
		ASN uint32 `json:"asn"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.processor.SetASNFilter(req.ASN)
	s.asnFilter = req.ASN

	c.JSON(http.StatusOK, gin.H{
		"asn_filter": req.ASN,
		"asn_name":   s.storage.GetASNResolver().GetASNName(req.ASN),
	})
}

func (s *Server) getASNFilter(c *gin.Context) {
	asn := s.processor.GetASNFilter()
	c.JSON(http.StatusOK, gin.H{
		"asn_filter": asn,
		"asn_name":   s.storage.GetASNResolver().GetASNName(asn),
	})
}

func (s *Server) sendMockFlow(c *gin.Context) {
	var req struct {
		SrcIP    string `json:"src_ip"`
		DstIP    string `json:"dst_ip"`
		SrcPort  uint16 `json:"src_port"`
		DstPort  uint16 `json:"dst_port"`
		Protocol uint8  `json:"protocol"`
		Bytes    uint64 `json:"bytes"`
		Count    int    `json:"count"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.SrcIP == "" {
		req.SrcIP = "192.168.1.100"
	}
	if req.DstIP == "" {
		req.DstIP = "8.8.8.8"
	}
	if req.DstPort == 0 {
		req.DstPort = 443
	}
	if req.Protocol == 0 {
		req.Protocol = 6
	}
	if req.Bytes == 0 {
		req.Bytes = 1500
	}
	if req.Count == 0 {
		req.Count = 1
	}

	for i := 0; i < req.Count; i++ {
		s.receiver.SendMockFlow(req.SrcIP, req.DstIP, req.SrcPort, req.DstPort, req.Protocol, req.Bytes)
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "mock flow sent",
		"count":   req.Count,
	})
}

func (s *Server) StartMockGenerator() {
	go func() {
		mockFlows := []struct {
			SrcIP    string
			DstIP    string
			SrcPort  uint16
			DstPort  uint16
			Protocol uint8
			Weight   int
		}{
			{"192.168.1.100", "8.8.8.8", 12345, 443, 6, 30},
			{"192.168.1.101", "1.1.1.1", 54321, 80, 6, 20},
			{"192.168.1.100", "142.250.72.46", 23456, 443, 6, 25},
			{"192.168.1.102", "151.101.1.69", 34567, 443, 6, 15},
			{"192.168.1.100", "52.84.13.101", 45678, 443, 6, 18},
			{"192.168.1.101", "104.16.81.102", 56789, 443, 6, 22},
			{"192.168.1.103", "20.189.173.1", 13579, 443, 6, 12},
			{"192.168.1.100", "157.240.23.35", 24680, 443, 6, 16},
			{"192.168.1.102", "185.199.108.153", 11223, 443, 6, 10},
			{"192.168.1.101", "54.239.28.85", 33445, 443, 6, 14},
			{"192.168.1.100", "223.5.5.5", 55667, 53, 17, 8},
			{"192.168.1.103", "119.29.29.29", 77889, 53, 17, 6},
			{"10.0.0.50", "192.168.1.1", 99000, 22, 6, 5},
			{"172.16.0.10", "192.168.1.100", 11111, 3306, 6, 7},
			{"192.168.1.100", "192.168.1.200", 22222, 6379, 6, 9},
		}

		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for range ticker.C {
			for _, flow := range mockFlows {
				for i := 0; i < flow.Weight/5+1; i++ {
					bytes := uint64(100 + flow.Weight*50)
					s.receiver.SendMockFlow(
						flow.SrcIP,
						flow.DstIP,
						flow.SrcPort,
						flow.DstPort,
						flow.Protocol,
						bytes,
					)
				}
			}
		}
	}()

	log.Println("Mock flow generator started")
}

func (s *Server) getAlerts(c *gin.Context) {
	status := c.Query("status")
	alerts := s.detector.GetAlerts(status)
	c.JSON(http.StatusOK, gin.H{"alerts": alerts, "count": len(alerts)})
}

func (s *Server) getBaseline(c *gin.Context) {
	baseline := s.detector.GetBaseline()
	c.JSON(http.StatusOK, baseline)
}

func (s *Server) getTopOffenders(c *gin.Context) {
	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	offenders := s.detector.GetTopOffenders(limit)
	c.JSON(http.StatusOK, offenders)
}

func (s *Server) updateAlertConfig(c *gin.Context) {
	var config struct {
		SYNThreshold  uint64 `json:"syn_threshold"`
		UDPThreshold  uint64 `json:"udp_threshold"`
		ICMPThreshold uint64 `json:"icmp_threshold"`
		SpikeMultiplier float64 `json:"spike_multiplier"`
	}

	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentConfig := anomaly.DefaultConfig()
	if config.SYNThreshold > 0 {
		currentConfig.SYNThreshold = config.SYNThreshold
	}
	if config.UDPThreshold > 0 {
		currentConfig.UDPThreshold = config.UDPThreshold
	}
	if config.ICMPThreshold > 0 {
		currentConfig.ICMPThreshold = config.ICMPThreshold
	}
	if config.SpikeMultiplier > 0 {
		currentConfig.SpikeMultiplier = config.SpikeMultiplier
	}

	s.detector.UpdateConfig(currentConfig)

	c.JSON(http.StatusOK, gin.H{"status": "updated", "config": currentConfig})
}

func (s *Server) bgpLookup(c *gin.Context) {
	ip := c.Param("ip")
	info, found := s.bgpLookup.LookupIP(ip)

	if !found {
		c.JSON(http.StatusOK, gin.H{
			"found": false,
			"ip":    ip,
			"info":  nil,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"found": true,
		"ip":    ip,
		"info":  info,
	})
}

func (s *Server) getBGPRoutes(c *gin.Context) {
	routes := s.bgpLookup.GetRoutes()
	c.JSON(http.StatusOK, gin.H{"routes": routes, "count": len(routes)})
}

func (s *Server) addBGPRoute(c *gin.Context) {
	var route bgp.BGPRoute
	if err := c.ShouldBindJSON(&route); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	s.bgpLookup.AddRoute(&route)
	c.JSON(http.StatusOK, gin.H{"status": "added", "route": route})
}

func (s *Server) removeBGPRoute(c *gin.Context) {
	prefix := c.Param("prefix")
	s.bgpLookup.RemoveRoute(prefix)
	c.JSON(http.StatusOK, gin.H{"status": "removed", "prefix": prefix})
}

func (s *Server) getBGPStats(c *gin.Context) {
	stats := s.bgpLookup.GetPrefixStats()
	c.JSON(http.StatusOK, stats)
}

func (s *Server) importPrefixes(c *gin.Context) {
	var request struct {
		Prefixes []*bgp.BGPPrefixInfo `json:"prefixes"`
	}

	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	count := s.bgpLookup.BatchInsert(request.Prefixes)
	c.JSON(http.StatusOK, gin.H{"imported": count, "total": len(request.Prefixes)})
}

func (s *Server) generateTopNReport(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	topN := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			topN = n
		}
	}

	topNData := s.processor.GetCurrentTopN()
	if len(topNData.IPPairs) > topN {
		topNData.IPPairs = topNData.IPPairs[:topN]
	}
	if len(topNData.Apps) > topN {
		topNData.Apps = topNData.Apps[:topN]
	}

	config := report.ReportConfig{
		Type:      report.ReportTypeTopN,
		Format:    report.ReportFormat(format),
		StartTime: time.Now().Add(-1 * time.Hour),
		EndTime:   time.Now(),
		TopN:      topN,
		Title:     "Top N Traffic Report",
	}

	filename, data, err := s.reportGen.GenerateTopNReport(&topNData, config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.reportGen.SaveReport(filename, data)

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", getContentType(format))
	c.Data(http.StatusOK, getContentType(format), data)
}

func (s *Server) generateHistoricalReport(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	startTime := time.Now().Add(-1 * time.Hour)
	endTime := time.Now()

	if start := c.Query("start"); start != "" {
		if t, err := time.Parse(time.RFC3339, start); err == nil {
			startTime = t
		}
	}
	if end := c.Query("end"); end != "" {
		if t, err := time.Parse(time.RFC3339, end); err == nil {
			endTime = t
		}
	}

	query := types.HistoricalQuery{
		StartTime: startTime,
		EndTime:   endTime,
	}

	if asn := c.Query("asn"); asn != "" {
		if a, err := strconv.ParseUint(asn, 10, 32); err == nil {
			query.ASNFilter = uint32(a)
		}
	}

	records, err := s.storage.QueryHistorical(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	config := report.ReportConfig{
		Type:      report.ReportTypeHistorical,
		Format:    report.ReportFormat(format),
		StartTime: startTime,
		EndTime:   endTime,
		Title:     "Historical Traffic Report",
	}

	filename, data, err := s.reportGen.GenerateHistoricalReport(records, config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.reportGen.SaveReport(filename, data)

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", getContentType(format))
	c.Data(http.StatusOK, getContentType(format), data)
}

func (s *Server) generateAlertsReport(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	status := c.Query("status")

	alerts := s.detector.GetAlerts(status)

	alertInterfaces := make([]interface{}, len(alerts))
	for i, a := range alerts {
		alertInterfaces[i] = a
	}

	config := report.ReportConfig{
		Type:      report.ReportTypeAlerts,
		Format:    report.ReportFormat(format),
		StartTime: time.Now().Add(-24 * time.Hour),
		EndTime:   time.Now(),
		Title:     "Security Alerts Report",
	}

	filename, data, err := s.reportGen.GenerateAlertsReport(alertInterfaces, config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.reportGen.SaveReport(filename, data)

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", getContentType(format))
	c.Data(http.StatusOK, getContentType(format), data)
}

func (s *Server) generateFullReport(c *gin.Context) {
	format := c.DefaultQuery("format", "json")
	startTime := time.Now().Add(-1 * time.Hour)
	endTime := time.Now()

	if start := c.Query("start"); start != "" {
		if t, err := time.Parse(time.RFC3339, start); err == nil {
			startTime = t
		}
	}
	if end := c.Query("end"); end != "" {
		if t, err := time.Parse(time.RFC3339, end); err == nil {
			endTime = t
		}
	}

	topNData := s.processor.GetCurrentTopN()

	query := types.HistoricalQuery{
		StartTime: startTime,
		EndTime:   endTime,
	}
	records, _ := s.storage.QueryHistorical(query)

	alerts := s.detector.GetAlerts("")
	alertInterfaces := make([]interface{}, len(alerts))
	for i, a := range alerts {
		alertInterfaces[i] = a
	}

	config := report.ReportConfig{
		Type:      report.ReportTypeFull,
		Format:    report.ReportFormat(format),
		StartTime: startTime,
		EndTime:   endTime,
		Title:     "Full Traffic Analysis Report",
	}

	filename, data, err := s.reportGen.GenerateFullReport(&topNData, records, alertInterfaces, config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	s.reportGen.SaveReport(filename, data)

	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Content-Type", getContentType(format))
	c.Data(http.StatusOK, getContentType(format), data)
}

func getContentType(format string) string {
	switch format {
	case "csv":
		return "text/csv; charset=utf-8"
	case "txt":
		return "text/plain; charset=utf-8"
	default:
		return "application/json; charset=utf-8"
	}
}

func init() {
	_ = json.Marshal
}

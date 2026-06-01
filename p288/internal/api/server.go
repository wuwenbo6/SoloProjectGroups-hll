package api

import (
	"net/http"
	"strconv"

	"twamp-reflector/internal/twamp"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type Server struct {
	router      *gin.Engine
	twampServer *twamp.Server
	httpAddr    string
}

func NewAPIServer(twampServer *twamp.Server, httpPort int) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	s := &Server{
		router:      router,
		twampServer: twampServer,
		httpAddr:    ":" + strconv.Itoa(httpPort),
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	api := s.router.Group("/api")
	{
		api.GET("/results", s.getResults)
		api.GET("/results/latest", s.getLatestResults)
		api.DELETE("/results", s.clearResults)
		api.GET("/stats", s.getStats)
		api.GET("/health", s.healthCheck)

		api.GET("/sessions", s.getSessions)
		api.POST("/sessions", s.addSession)
		api.DELETE("/sessions/:id", s.removeSession)
		api.GET("/sessions/stats", s.getAllSessionStats)
		api.GET("/sessions/:id/results", s.getSessionResults)

		api.GET("/histogram", s.getHistogram)
		api.GET("/histograms", s.getAllHistograms)
		api.GET("/sessions/:id/histogram", s.getSessionHistogram)
	}

	s.router.Static("/", "./web")
}

func (s *Server) getResults(c *gin.Context) {
	results := s.twampServer.GetResults()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    results,
		"total":   len(results),
	})
}

func (s *Server) getLatestResults(c *gin.Context) {
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	results := s.twampServer.GetLatestResults(limit)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    results,
		"total":   len(results),
	})
}

func (s *Server) clearResults(c *gin.Context) {
	s.twampServer.ClearResults()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Results cleared",
	})
}

func (s *Server) getStats(c *gin.Context) {
	results := s.twampServer.GetResults()

	if len(results) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"stats": gin.H{
				"total_packets": 0,
				"rtt_min":       0,
				"rtt_max":       0,
				"rtt_avg":       0,
				"jitter_avg":    0,
			},
		})
		return
	}

	var rttMin, rttMax, rttSum, jitterSum float64
	rttMin = results[0].RTT
	rttMax = results[0].RTT

	for _, r := range results {
		rttSum += r.RTT
		jitterSum += r.Jitter
		if r.RTT < rttMin {
			rttMin = r.RTT
		}
		if r.RTT > rttMax {
			rttMax = r.RTT
		}
	}

	count := float64(len(results))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"stats": gin.H{
			"total_packets": len(results),
			"rtt_min":       round(rttMin, 3),
			"rtt_max":       round(rttMax, 3),
			"rtt_avg":       round(rttSum/count, 3),
			"jitter_avg":    round(jitterSum/count, 3),
		},
	})
}

func (s *Server) healthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "TWAMP Reflector",
	})
}

func (s *Server) getSessions(c *gin.Context) {
	sessions := s.twampServer.GetSessions()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    sessions,
		"total":   len(sessions),
	})
}

func (s *Server) addSession(c *gin.Context) {
	var config twamp.SessionConfig
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	config.Active = true
	err := s.twampServer.AddSession(&config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    config,
	})
}

func (s *Server) removeSession(c *gin.Context) {
	sessionID := c.Param("id")
	s.twampServer.RemoveSession(sessionID)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Session removed",
	})
}

func (s *Server) getAllSessionStats(c *gin.Context) {
	stats := s.twampServer.GetAllSessionStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    stats,
		"total":   len(stats),
	})
}

func (s *Server) getSessionResults(c *gin.Context) {
	sessionID := c.Param("id")
	results := s.twampServer.GetSessionResults(sessionID)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    results,
		"total":   len(results),
	})
}

func (s *Server) getHistogram(c *gin.Context) {
	sessionID := c.Query("session")
	bins := 10
	if binsStr := c.Query("bins"); binsStr != "" {
		if parsed, err := strconv.Atoi(binsStr); err == nil && parsed > 0 {
			bins = parsed
		}
	}

	if sessionID == "" {
		sessions := s.twampServer.GetSessions()
		if len(sessions) > 0 {
			sessionID = sessions[0].ID
		}
	}

	histogram := s.twampServer.GetHistogram(sessionID, bins)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    histogram,
	})
}

func (s *Server) getAllHistograms(c *gin.Context) {
	bins := 10
	if binsStr := c.Query("bins"); binsStr != "" {
		if parsed, err := strconv.Atoi(binsStr); err == nil && parsed > 0 {
			bins = parsed
		}
	}

	histograms := s.twampServer.GetAllHistograms(bins)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    histograms,
		"total":   len(histograms),
	})
}

func (s *Server) getSessionHistogram(c *gin.Context) {
	sessionID := c.Param("id")
	bins := 10
	if binsStr := c.Query("bins"); binsStr != "" {
		if parsed, err := strconv.Atoi(binsStr); err == nil && parsed > 0 {
			bins = parsed
		}
	}

	histogram := s.twampServer.GetHistogram(sessionID, bins)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    histogram,
	})
}

func (s *Server) Start() error {
	return s.router.Run(s.httpAddr)
}

func round(val float64, precision int) float64 {
	multiplier := 1.0
	for i := 0; i < precision; i++ {
		multiplier *= 10
	}
	return float64(int(val*multiplier+0.5)) / multiplier
}

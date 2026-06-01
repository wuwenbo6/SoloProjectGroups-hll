package api

import (
	"net"
	"net/http"
	"net/netip"
	"time"

	"github.com/gin-gonic/gin"
	"gtp-simulator/internal/gtpv1"
	"gtp-simulator/internal/network"
	"gtp-simulator/internal/pdp"
)

type Server struct {
	SGSN *network.SGSN
	GGSN *network.GGSN
}

func NewServer(sgsn *network.SGSN, ggsn *network.GGSN) *Server {
	return &Server{
		SGSN: sgsn,
		GGSN: ggsn,
	}
}

type CreatePDPRequest struct {
	IMSI    string `json:"imsi" binding:"required"`
	MSISDN  string `json:"msisdn"`
	NSAPI   uint8  `json:"nsapi" binding:"required,min=5,max=15"`
	APN     string `json:"apn" binding:"required"`
	PDPType uint8  `json:"pdpType" binding:"required"`
	MSIP    string `json:"msip"`
	GGSNIP  string `json:"ggsnip" binding:"required"`
	QCI     uint8  `json:"qci"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

func (s *Server) SetupRoutes(r *gin.Engine) {
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	apiGroup := r.Group("/api")
	{
		apiGroup.GET("/health", s.HealthCheck)

		pdpGroup := apiGroup.Group("/pdp")
		{
			pdpGroup.POST("", s.CreatePDPContext)
			pdpGroup.GET("", s.ListPDPContexts)
			pdpGroup.GET("/export", s.ExportPDPContexts)
			pdpGroup.GET("/:id", s.GetPDPContext)
			pdpGroup.DELETE("/:id", s.DeletePDPContext)
			pdpGroup.POST("/:id/send-uplink", s.SendUplinkData)
			pdpGroup.POST("/:id/send-downlink", s.SendDownlinkData)
		}

		statsGroup := r.Group("/api/stats")
	{
		statsGroup.GET("/sgsn", s.GetSGSNStats)
		statsGroup.GET("/ggsn", s.GetGGSNStats)
		statsGroup.GET("/tunnel", s.GetTunnelStats)
		statsGroup.GET("/teid-pools", s.GetTEIDPoolStats)
		statsGroup.GET("/sequence-manager", s.GetSequenceManagerStats)
	}

		apiGroup.GET("/network/info", s.GetNetworkInfo)
	}

	r.StaticFile("/", "./web/index.html")
	r.Static("/static", "./web")
}

func (s *Server) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"status": "running",
			"sgsn":   s.SGSN.IP.String(),
			"ggsn":   s.GGSN.IP.String(),
		},
	})
}

func (s *Server) CreatePDPContext(c *gin.Context) {
	var req CreatePDPRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	ggsnIP, err := netip.ParseAddr(req.GGSNIP)
	if err != nil {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success: false,
			Message: "Invalid GGSN IP",
		})
		return
	}

	var msIP netip.Addr
	if req.MSIP != "" {
		msIP, err = netip.ParseAddr(req.MSIP)
		if err != nil {
			c.JSON(http.StatusBadRequest, APIResponse{
				Success: false,
				Message: "Invalid MS IP",
			})
			return
		}
	}

	pdpReq := pdp.CreatePDPRequest{
		IMSI:    req.IMSI,
		MSISDN:  req.MSISDN,
		NSAPI:   req.NSAPI,
		APN:     req.APN,
		PDPType: req.PDPType,
		GGSNIP:  net.IP(ggsnIP.AsSlice()),
		QCI:     req.QCI,
		QoSProfile: gtpv1.QoSProfile{
			AllocationRetentionPriority: 1,
			TrafficClass:                3,
			TransferDelay:               10,
			Reliability:                 3,
			PeakThroughput:              9,
			Precedence:                  2,
			MeanThroughput:              31,
		},
	}

	if msIP.IsValid() {
		pdpReq.MSIP = net.IP(msIP.AsSlice())
	}

	pdpCtx, err := s.SGSN.CreatePDPContext(pdpReq)
	if err != nil {
		c.JSON(http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, APIResponse{
		Success: true,
		Message: "PDP context created successfully",
		Data:    pdpCtx.ToDTO(),
	})
}

func (s *Server) ListPDPContexts(c *gin.Context) {
	pdps := s.SGSN.PDPManager.GetAllPDPs()
	dtos := make([]pdp.PDPContextDTO, len(pdps))
	for i, p := range pdps {
		dtos[i] = p.ToDTO()
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    dtos,
	})
}

func (s *Server) ExportPDPContexts(c *gin.Context) {
	pdps := s.SGSN.PDPManager.GetAllPDPs()
	dtos := make([]pdp.PDPContextDTO, len(pdps))
	for i, p := range pdps {
		dtos[i] = p.ToDTO()
	}

	exportData := gin.H{
		"exportedAt": time.Now().Format(time.RFC3339),
		"count":      len(dtos),
		"pdpContexts": dtos,
	}

	format := c.Query("format")
	if format == "download" {
		c.Header("Content-Disposition", "attachment; filename=pdp-contexts.json")
		c.Header("Content-Type", "application/json")
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    exportData,
	})
}

func (s *Server) GetPDPContext(c *gin.Context) {
	id := c.Param("id")
	pdpCtx, exists := s.SGSN.PDPManager.GetPDP(id)
	if !exists {
		c.JSON(http.StatusNotFound, APIResponse{
			Success: false,
			Message: "PDP context not found",
		})
		return
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    pdpCtx.ToDTO(),
	})
}

func (s *Server) DeletePDPContext(c *gin.Context) {
	id := c.Param("id")
	err := s.SGSN.DeletePDPContext(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Message: "PDP context deleted successfully",
	})
}

type SendDataRequest struct {
	Payload string `json:"payload"`
	Size    int    `json:"size"`
}

func (s *Server) SendUplinkData(c *gin.Context) {
	id := c.Param("id")
	var req SendDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Size = 100
	}

	pdpCtx, exists := s.SGSN.PDPManager.GetPDP(id)
	if !exists {
		c.JSON(http.StatusNotFound, APIResponse{
			Success: false,
			Message: "PDP context not found",
		})
		return
	}

	var payload []byte
	if req.Payload != "" {
		payload = []byte(req.Payload)
	} else {
		if req.Size <= 0 {
			req.Size = 100
		}
		payload = network.GenerateTestPayload(req.Size)
	}

	dstIP := net.ParseIP("8.8.8.8")
	ipPacket := network.BuildTestPacket(pdpCtx.MSIP, dstIP, payload)

	err := s.SGSN.SendUplinkData(id, ipPacket)
	if err != nil {
		c.JSON(http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Message: "Uplink data sent successfully",
		Data: gin.H{
			"packetSize": len(ipPacket),
			"srcIP":      pdpCtx.MSIP.String(),
			"dstIP":      dstIP.String(),
		},
	})
}

func (s *Server) SendDownlinkData(c *gin.Context) {
	id := c.Param("id")
	var req SendDataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Size = 100
	}

	pdpCtx, exists := s.GGSN.PDPManager.GetPDP(id)
	if !exists {
		c.JSON(http.StatusNotFound, APIResponse{
			Success: false,
			Message: "PDP context not found",
		})
		return
	}

	var payload []byte
	if req.Payload != "" {
		payload = []byte(req.Payload)
	} else {
		if req.Size <= 0 {
			req.Size = 100
		}
		payload = network.GenerateTestPayload(req.Size)
	}

	srcIP := net.ParseIP("8.8.8.8")
	ipPacket := network.BuildTestPacket(srcIP, pdpCtx.MSIP, payload)

	err := s.GGSN.SendTestDownlinkData(id, ipPacket)
	if err != nil {
		c.JSON(http.StatusInternalServerError, APIResponse{
			Success: false,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Message: "Downlink data sent successfully",
		Data: gin.H{
			"packetSize": len(ipPacket),
			"srcIP":      srcIP.String(),
			"dstIP":      pdpCtx.MSIP.String(),
		},
	})
}

func (s *Server) GetSGSNStats(c *gin.Context) {
	pdps := s.SGSN.PDPManager.GetAllPDPs()
	var totalUplinkPackets, totalDownlinkPackets uint64
	var totalUplinkBytes, totalDownlinkBytes uint64

	for _, p := range pdps {
		totalUplinkPackets += p.Stats.UplinkPackets.Load()
		totalDownlinkPackets += p.Stats.DownlinkPackets.Load()
		totalUplinkBytes += p.Stats.UplinkBytes.Load()
		totalDownlinkBytes += p.Stats.DownlinkBytes.Load()
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"activeContexts":       len(pdps),
			"totalUplinkPackets":   totalUplinkPackets,
			"totalDownlinkPackets": totalDownlinkPackets,
			"totalUplinkBytes":     totalUplinkBytes,
			"totalDownlinkBytes":   totalDownlinkBytes,
			"ip":                   s.SGSN.IP.String(),
		},
	})
}

func (s *Server) GetGGSNStats(c *gin.Context) {
	pdps := s.GGSN.PDPManager.GetAllPDPs()
	var totalUplinkPackets, totalDownlinkPackets uint64
	var totalUplinkBytes, totalDownlinkBytes uint64

	for _, p := range pdps {
		totalUplinkPackets += p.Stats.UplinkPackets.Load()
		totalDownlinkPackets += p.Stats.DownlinkPackets.Load()
		totalUplinkBytes += p.Stats.UplinkBytes.Load()
		totalDownlinkBytes += p.Stats.DownlinkBytes.Load()
	}

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"activeContexts":       len(pdps),
			"totalUplinkPackets":   totalUplinkPackets,
			"totalDownlinkPackets": totalDownlinkPackets,
			"totalUplinkBytes":     totalUplinkBytes,
			"totalDownlinkBytes":   totalDownlinkBytes,
			"ip":                   s.GGSN.IP.String(),
		},
	})
}

func (s *Server) GetTunnelStats(c *gin.Context) {
	sgsnPdps := s.SGSN.PDPManager.GetAllPDPs()
	ggsnPdps := s.GGSN.PDPManager.GetAllPDPs()

	tunnels := make([]gin.H, 0)
	for _, sgsnPdp := range sgsnPdps {
		ggsnPdp, _ := s.GGSN.PDPManager.GetPDP(sgsnPdp.ID)
		ggsnTeidUser := uint32(0)
		if ggsnPdp != nil {
			ggsnTeidUser = ggsnPdp.TEIDUser
		}

		tunnels = append(tunnels, gin.H{
			"id":              sgsnPdp.ID,
			"imsi":            sgsnPdp.IMSI,
			"msip":            sgsnPdp.MSIP.String(),
			"sgsnTeidControl": sgsnPdp.TEIDControl,
			"sgsnTeidUser":    sgsnPdp.TEIDUser,
			"ggsnTeidUser":    ggsnTeidUser,
			"uplinkPackets":   sgsnPdp.Stats.UplinkPackets.Load(),
			"downlinkPackets": sgsnPdp.Stats.DownlinkPackets.Load(),
			"uplinkBytes":     sgsnPdp.Stats.UplinkBytes.Load(),
			"downlinkBytes":   sgsnPdp.Stats.DownlinkBytes.Load(),
		})
	}

	_ = ggsnPdps

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"tunnels": tunnels,
		},
	})
}

func (s *Server) GetTEIDPoolStats(c *gin.Context) {
	sgsnControlPool := s.SGSN.PDPManager.GetControlTEIDPool()
	sgsnUserPool := s.SGSN.PDPManager.GetUserTEIDPool()
	ggsnControlPool := s.GGSN.PDPManager.GetControlTEIDPool()
	ggsnUserPool := s.GGSN.PDPManager.GetUserTEIDPool()

	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"sgsn": gin.H{
				"control": gin.H{
					"allocated": sgsnControlPool.Size(),
					"free":      sgsnControlPool.FreeCount(),
					"mappings":  sgsnControlPool.GetAllMappings(),
				},
				"user": gin.H{
					"allocated": sgsnUserPool.Size(),
					"free":      sgsnUserPool.FreeCount(),
					"mappings":  sgsnUserPool.GetAllMappings(),
				},
			},
			"ggsn": gin.H{
				"control": gin.H{
					"allocated": ggsnControlPool.Size(),
					"free":      ggsnControlPool.FreeCount(),
					"mappings":  ggsnControlPool.GetAllMappings(),
				},
				"user": gin.H{
					"allocated": ggsnUserPool.Size(),
					"free":      ggsnUserPool.FreeCount(),
					"mappings":  ggsnUserPool.GetAllMappings(),
				},
			},
		},
	})
}

func (s *Server) GetSequenceManagerStats(c *gin.Context) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"sgsn": gin.H{
				"enabled": s.SGSN.IsSequenceOrderEnabled(),
				"stats":   s.SGSN.GetSequenceManager().GetAllStats(),
			},
			"ggsn": gin.H{
				"enabled": s.GGSN.IsSequenceOrderEnabled(),
				"stats":   s.GGSN.GetSequenceManager().GetAllStats(),
			},
		},
	})
}

func (s *Server) GetNetworkInfo(c *gin.Context) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data: gin.H{
			"sgsn": gin.H{
				"ip":          s.SGSN.IP.String(),
				"controlPort": s.SGSN.ControlPort,
				"userPort":    s.SGSN.UserPort,
			},
			"ggsn": gin.H{
				"ip":          s.GGSN.IP.String(),
				"controlPort": s.GGSN.ControlPort,
				"userPort":    s.GGSN.UserPort,
			},
			"protocol":     "GTPv1",
			"controlPlane": "GTP-C (UDP)",
			"userPlane":    "GTP-U (UDP)",
			"features": gin.H{
				"teidPool":        true,
				"sequenceManager": true,
			},
		},
	})
}

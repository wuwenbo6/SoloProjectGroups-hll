package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"pcep-server/pkg/cspf"
	"pcep-server/pkg/pcep"
	"pcep-server/pkg/topology"
)

func main() {
	topo := topology.NewTopology()

	if err := topo.LoadFromFile("config/topology.json"); err != nil {
		log.Printf("Warning: Could not load topology file, using default topology: %v", err)
		loadDefaultTopology(topo)
	}

	os.MkdirAll("logs", 0755)

	pcepServer := pcep.NewServer(":4189", topo)
	if err := pcepServer.Start(); err != nil {
		log.Fatalf("Failed to start PCEP server: %v", err)
	}
	log.Println("PCEP server started on port 4189")

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Static("/static", "./web/static")
	r.GET("/", func(c *gin.Context) {
		c.File("./web/static/index.html")
	})

	api := r.Group("/api")
	{
		api.GET("/topology", func(c *gin.Context) {
			nodes := topo.GetNodes()
			links := topo.GetLinks()

			nodeList := make([]*topology.Node, 0, len(nodes))
			for _, node := range nodes {
				nodeList = append(nodeList, node)
			}

			linkList := make([]*topology.Link, 0, len(links))
			for _, link := range links {
				linkList = append(linkList, link)
			}

			c.JSON(http.StatusOK, gin.H{
				"nodes": nodeList,
				"links": linkList,
			})
		})

		api.POST("/compute-path", func(c *gin.Context) {
			var req struct {
				Source           string  `json:"source" binding:"required"`
				Target           string  `json:"target" binding:"required"`
				Bandwidth        float64 `json:"bandwidth"`
				IncludeAny       uint32  `json:"include_any"`
				IncludeAll       uint32  `json:"include_all"`
				Exclude          uint32  `json:"exclude"`
				MetricWeight     float64 `json:"metric_weight"`
				LatencyWeight    float64 `json:"latency_weight"`
				BandwidthWeight  float64 `json:"bandwidth_weight"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "Invalid request: " + err.Error(),
				})
				return
			}

			affinity := cspf.Affinity{
				IncludeAny: req.IncludeAny,
				IncludeAll: req.IncludeAll,
				Exclude:    req.Exclude,
			}

			weights := cspf.WeightConfig{
				MetricWeight:    req.MetricWeight,
				LatencyWeight:   req.LatencyWeight,
				BandwidthWeight: req.BandwidthWeight,
			}

			if weights.MetricWeight == 0 && weights.LatencyWeight == 0 && weights.BandwidthWeight == 0 {
				weights = cspf.DefaultWeightConfig()
			}

			result, err := pcepServer.ComputePathREST(req.Source, req.Target, req.Bandwidth, affinity, weights)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, result)
		})

		api.POST("/reserve-bandwidth", func(c *gin.Context) {
			var req struct {
				Links     []string `json:"links" binding:"required"`
				Bandwidth float64  `json:"bandwidth" binding:"required"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "Invalid request",
				})
				return
			}

			success := topo.ReserveBandwidth(req.Links, req.Bandwidth)
			c.JSON(http.StatusOK, gin.H{
				"success": success,
			})
		})

		api.GET("/stats", func(c *gin.Context) {
			nodes := topo.GetNodes()
			links := topo.GetLinks()

			var totalBW, reservedBW float64
			for _, link := range links {
				totalBW += link.Bandwidth
				reservedBW += link.ReservedBW
			}

			lspMgr := pcepServer.GetLSPManager()
			allLSPs := lspMgr.GetAllLSPs()

			c.JSON(http.StatusOK, gin.H{
				"nodes":              len(nodes),
				"links":              len(links),
				"total_bandwidth":    totalBW,
				"reserved_bandwidth": reservedBW,
				"utilization":        reservedBW / totalBW * 100,
				"active_lsps":        len(allLSPs),
			})
		})

		// LSP management APIs
		api.POST("/lsp", func(c *gin.Context) {
			var req struct {
				Name             string  `json:"name" binding:"required"`
				Source           string  `json:"source" binding:"required"`
				Target           string  `json:"target" binding:"required"`
				Bandwidth        float64 `json:"bandwidth"`
				IncludeAny       uint32  `json:"include_any"`
				IncludeAll       uint32  `json:"include_all"`
				Exclude          uint32  `json:"exclude"`
				MetricWeight     float64 `json:"metric_weight"`
				LatencyWeight    float64 `json:"latency_weight"`
				BandwidthWeight  float64 `json:"bandwidth_weight"`
			}

			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "Invalid request: " + err.Error(),
				})
				return
			}

			affinity := cspf.Affinity{
				IncludeAny: req.IncludeAny,
				IncludeAll: req.IncludeAll,
				Exclude:    req.Exclude,
			}

			weights := cspf.WeightConfig{
				MetricWeight:    req.MetricWeight,
				LatencyWeight:   req.LatencyWeight,
				BandwidthWeight: req.BandwidthWeight,
			}

			if weights.MetricWeight == 0 && weights.LatencyWeight == 0 && weights.BandwidthWeight == 0 {
				weights = cspf.DefaultWeightConfig()
			}

			lsp, err := pcepServer.CreateLSPREST(req.Name, req.Source, req.Target, req.Bandwidth, affinity, weights)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"lsp":     lsp,
			})
		})

		api.GET("/lsp", func(c *gin.Context) {
			lspMgr := pcepServer.GetLSPManager()
			allLSPs := lspMgr.GetAllLSPs()
			c.JSON(http.StatusOK, gin.H{
				"lsps": allLSPs,
			})
		})

		api.GET("/lsp/:id", func(c *gin.Context) {
			id := c.Param("id")
			lspMgr := pcepServer.GetLSPManager()
			lsp := lspMgr.GetLSP(id)
			if lsp == nil {
				c.JSON(http.StatusNotFound, gin.H{
					"success": false,
					"message": "LSP not found",
				})
				return
			}
			c.JSON(http.StatusOK, lsp)
		})

		api.DELETE("/lsp/:id", func(c *gin.Context) {
			id := c.Param("id")
			err := pcepServer.DeleteLSPREST(id)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "LSP deleted",
			})
		})

		// Global reoptimization
		api.POST("/reoptimize", func(c *gin.Context) {
			result, err := pcepServer.ReoptimizeAll()
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"message": err.Error(),
				})
				return
			}
			c.JSON(http.StatusOK, result)
		})

		// Computation log APIs
		api.GET("/logs", func(c *gin.Context) {
			lspMgr := pcepServer.GetLSPManager()

			limit := 100
			if l := c.Query("limit"); l != "" {
				if v, err := strconv.Atoi(l); err == nil && v > 0 {
					limit = v
				}
			}

			logType := pcep.LogType(c.Query("type"))
			if logType != "" && logType != "compute" && logType != "reserve" && logType != "release" &&
				logType != "reoptimize" && logType != "lsp_create" && logType != "lsp_delete" && logType != "lsp_update" {
				logType = ""
			}

			logs := lspMgr.GetLogs(limit, logType)
			c.JSON(http.StatusOK, gin.H{
				"logs":  logs,
				"count": len(logs),
			})
		})

		api.GET("/logs/export", func(c *gin.Context) {
			lspMgr := pcepServer.GetLSPManager()

			format := c.DefaultQuery("format", "json")
			switch format {
			case "json":
				data, err := lspMgr.ExportLogsJSON()
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{
						"success": false,
						"message": "Export failed",
					})
					return
				}
				c.Header("Content-Disposition", "attachment; filename=pcep-logs.json")
				c.Data(http.StatusOK, "application/json", data)
			case "csv":
				logs := lspMgr.GetLogs(0, "")
				csvData := generateCSV(logs)
				c.Header("Content-Disposition", "attachment; filename=pcep-logs.csv")
				c.Data(http.StatusOK, "text/csv", []byte(csvData))
			default:
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"message": "Unsupported format, use json or csv",
				})
			}
		})

		api.DELETE("/logs", func(c *gin.Context) {
			lspMgr := pcepServer.GetLSPManager()
			lspMgr.ClearLogs()
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "Logs cleared",
			})
		})
	}

	go func() {
		log.Println("Web server starting on port 9090...")
		if err := r.Run(":9090"); err != nil {
			log.Fatalf("Failed to start web server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down servers...")
	pcepServer.Stop()
	log.Println("Servers stopped")
}

func generateCSV(logs []pcep.ComputeLog) string {
	csv := "id,timestamp,type,source,target,bandwidth,success,nodes,links,metric,cost,message,lsp_id,duration\n"
	for _, l := range logs {
		nodes := strings.Join(l.Nodes, "|")
		links := strings.Join(l.Links, "|")
		msg := strings.ReplaceAll(l.Message, "\"", "\"\"")
		csv += fmt.Sprintf("%d,%s,%s,%s,%s,%.0f,%t,\"%s\",\"%s\",%d,%.2f,\"%s\",%s,%s\n",
			l.ID, l.Timestamp.Format(time.RFC3339), l.Type, l.Source, l.Target,
			l.Bandwidth, l.Success, nodes, links, l.Metric, l.Cost, msg, l.LSPID, l.Duration)
	}
	return csv
}

func loadDefaultTopology(topo *topology.Topology) {
	nodes := []*topology.Node{
		{ID: "R1", Name: "R1", IP: "10.0.0.1", X: 20, Y: 50},
		{ID: "R2", Name: "R2", IP: "10.0.0.2", X: 40, Y: 20},
		{ID: "R3", Name: "R3", IP: "10.0.0.3", X: 40, Y: 80},
		{ID: "R4", Name: "R4", IP: "10.0.0.4", X: 60, Y: 50},
		{ID: "R5", Name: "R5", IP: "10.0.0.5", X: 80, Y: 20},
		{ID: "R6", Name: "R6", IP: "10.0.0.6", X: 80, Y: 80},
	}

	for _, node := range nodes {
		topo.AddNode(node)
	}

	links := []*topology.Link{
		{ID: "L1", Source: "R1", Target: "R2", Bandwidth: 1000, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x01},
		{ID: "L2", Source: "R1", Target: "R3", Bandwidth: 1000, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x11},
		{ID: "L3", Source: "R2", Target: "R4", Bandwidth: 500, ReservedBW: 0, Metric: 20, Latency: 10, Affinity: 0x02},
		{ID: "L4", Source: "R3", Target: "R4", Bandwidth: 1000, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x11},
		{ID: "L5", Source: "R2", Target: "R5", Bandwidth: 1000, ReservedBW: 0, Metric: 15, Latency: 8, Affinity: 0x01},
		{ID: "L6", Source: "R4", Target: "R5", Bandwidth: 500, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x08},
		{ID: "L7", Source: "R4", Target: "R6", Bandwidth: 1000, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x11},
		{ID: "L8", Source: "R3", Target: "R6", Bandwidth: 500, ReservedBW: 0, Metric: 15, Latency: 8, Affinity: 0x04},
		{ID: "L9", Source: "R5", Target: "R6", Bandwidth: 1000, ReservedBW: 0, Metric: 10, Latency: 5, Affinity: 0x01},
	}

	for _, link := range links {
		topo.AddLink(link)
	}
}

package api

import (
	"swarm-manager/internal/docker"
	"swarm-manager/internal/failover"
	"swarm-manager/internal/health"
	"swarm-manager/internal/report"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func SetupRouter(hm *health.Manager, fm *failover.Manager, dc *docker.Client, rg *report.Generator) *gin.Engine {
	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	r.Use(cors.New(config))

	handler := NewHandler(hm, fm, dc, rg)

	api := r.Group("/api/v1")
	{
		api.GET("/health", handler.HealthCheck)

		nodes := api.Group("/nodes")
		{
			nodes.POST("/register", handler.RegisterNode)
			nodes.POST("/heartbeat", handler.Heartbeat)
			nodes.GET("", handler.GetNodes)
			nodes.GET("/:id", handler.GetNode)
			nodes.GET("/:id/history", handler.GetNodeHistory)
			nodes.DELETE("/:id", handler.DeleteNode)
		}

		services := api.Group("/services")
		{
			services.POST("", handler.CreateService)
			services.GET("", handler.GetServices)
			services.GET("/:id", handler.GetService)
			services.DELETE("/:id", handler.DeleteService)
		}

		api.POST("/sync", handler.SyncSwarm)
		api.GET("/deployments/history", handler.GetDeploymentHistory)
		api.POST("/failover/:node_id", handler.TriggerFailover)

		report := api.Group("/report")
		{
			report.GET("", handler.GetClusterReport)
			report.GET("/export", handler.ExportClusterReport)
		}
	}

	return r
}

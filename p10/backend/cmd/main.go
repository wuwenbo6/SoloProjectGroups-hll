package main

import (
	"context"
	"iot-system/internal/api"
	"iot-system/internal/config"
	"iot-system/internal/engine"
	"iot-system/pkg/database"
	"iot-system/pkg/mqttclient"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	if err := database.Init(cfg.DB.Path); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	engine.InitAnomalyDetection()

	ruleEngine := engine.NewRuleEngine()
	ruleEngine.Start()
	defer ruleEngine.Stop()

	if err := mqttclient.Init(&cfg.MQTT, func(msg *mqttclient.SensorMessage) {
		ruleEngine.ProcessSensorData(msg)
	}); err != nil {
		log.Fatalf("Failed to initialize MQTT client: %v", err)
	}
	defer mqttclient.Disconnect()

	handler := api.NewHandler(ruleEngine)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	apiGroup := r.Group("/api")
	{
		apiGroup.GET("/dashboard/stats", handler.GetDashboardStats)

		apiGroup.GET("/devices", handler.GetDevices)
		apiGroup.GET("/devices/:id", handler.GetDevice)
		apiGroup.PUT("/devices/:id", handler.UpdateDevice)
		apiGroup.GET("/devices/:id/history", handler.GetSensorHistory)
		apiGroup.POST("/devices/:id/command", handler.SendCommand)
		apiGroup.GET("/devices/:id/diagnostic", handler.GetDeviceDiagnostic)

		apiGroup.GET("/rules", handler.GetRules)
		apiGroup.POST("/rules", handler.CreateRule)
		apiGroup.PUT("/rules/:id", handler.UpdateRule)
		apiGroup.DELETE("/rules/:id", handler.DeleteRule)

		apiGroup.GET("/scenes", handler.GetScenes)
		apiGroup.POST("/scenes", handler.CreateScene)
		apiGroup.PUT("/scenes/:id", handler.UpdateScene)
		apiGroup.DELETE("/scenes/:id", handler.DeleteScene)
		apiGroup.POST("/scenes/:id/trigger", handler.TriggerScene)

		apiGroup.GET("/anomalies", handler.GetAnomalies)
		apiGroup.GET("/diagnostics", handler.GetDiagnostics)
		apiGroup.GET("/report", handler.GenerateReport)
		apiGroup.GET("/report/export", handler.ExportReport)
	}

	srv := &http.Server{
		Addr:    ":" + cfg.Server.Port,
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.Server.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}

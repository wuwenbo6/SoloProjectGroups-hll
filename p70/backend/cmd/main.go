package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"swarm-manager/internal/api"
	"swarm-manager/internal/docker"
	"swarm-manager/internal/failover"
	"swarm-manager/internal/health"
	"swarm-manager/internal/models"
	"swarm-manager/internal/report"
	"swarm-manager/pkg/config"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()

	db, err := gorm.Open(sqlite.Open(cfg.DatabasePath), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := models.MigrateDB(db); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	dockerClient, err := docker.NewClient()
	if err != nil {
		log.Printf("Warning: Failed to create Docker client: %v", err)
		log.Println("Running without Docker integration...")
	}

	healthManager := health.NewManager(db, dockerClient, cfg)
	failoverManager := failover.NewManager(db, dockerClient, healthManager, cfg)
	reportGenerator := report.NewGenerator(db)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go healthManager.StartHealthCheck(ctx)
	go failoverManager.StartFailoverMonitor(ctx)

	if dockerClient != nil {
		if err := healthManager.SyncSwarmNodes(ctx); err != nil {
			log.Printf("Warning: Failed to sync swarm nodes: %v", err)
		}
		if err := failoverManager.SyncServices(ctx); err != nil {
			log.Printf("Warning: Failed to sync services: %v", err)
		}
	}

	router := api.SetupRouter(healthManager, failoverManager, dockerClient, reportGenerator)

	go func() {
		addr := fmt.Sprintf(":%d", cfg.Port)
		log.Printf("Server starting on %s", addr)
		if err := router.Run(addr); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down gracefully...")
	cancel()

	if dockerClient != nil {
		dockerClient.Close()
	}

	log.Println("Server stopped")
}

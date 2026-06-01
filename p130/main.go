package main

import (
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	"sip-analyzer/api"
	"sip-analyzer/capture"
	"sip-analyzer/config"
	"sip-analyzer/database"

	"github.com/gin-gonic/gin"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting SIP Analyzer...")

	cfg := config.Load()

	log.Printf("Configuration:")
	log.Printf("  Database: %s", cfg.DatabasePath)
	log.Printf("  HEP UDP Port: %d", cfg.HEPUDPPort)
	log.Printf("  HEP TCP Port: %d", cfg.HEPTCPPort)
	log.Printf("  API Port: %d", cfg.APIPort)

	db, err := database.New(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()
	log.Println("Database initialized successfully")

	captureServer := capture.NewServer(db)
	if err := captureServer.Start(cfg.HEPUDPPort, cfg.HEPTCPPort); err != nil {
		log.Fatalf("Failed to start capture server: %v", err)
	}
	defer captureServer.Stop()

	apiServer := api.NewServer(db)
	apiServer.SetupRoutes()

	webDir, _ := filepath.Abs(cfg.WebDir)
	if _, err := os.Stat(webDir); err == nil {
		apiServer.Gin().Static("/static", webDir)
		apiServer.Gin().GET("/", func(c *gin.Context) {
			c.File(filepath.Join(webDir, "index.html"))
		})
		log.Printf("Web interface served from: %s", webDir)
	}

	go func() {
		log.Printf("API server starting on port %d...", cfg.APIPort)
		if err := apiServer.Gin().Run(":" + strconv.Itoa(cfg.APIPort)); err != nil {
			log.Fatalf("API server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down gracefully...")
}

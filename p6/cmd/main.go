package main

import (
	"leakage-monitor/internal/api"
	"leakage-monitor/internal/config"
	"leakage-monitor/internal/database"
	"leakage-monitor/internal/modbus"
	"leakage-monitor/internal/websocket"
	"log"
)

func main() {
	if err := config.Load(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	if err := database.Init(); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}
	defer database.Close()

	go websocket.StartHub()

	go modbus.StartServer()

	router := api.SetupRoutes()
	router.Run(":" + config.App.Server.HTTPPort)
}

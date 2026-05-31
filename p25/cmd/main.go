package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/robfig/cron/v3"

	"pv-monitor/internal/api"
	"pv-monitor/internal/config"
	"pv-monitor/internal/database"
	"pv-monitor/internal/modbus"
	"pv-monitor/internal/mqtt"
	"pv-monitor/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.New(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Database connected successfully")

	mqttClient, err := mqtt.New(&cfg.MQTT, db)
	if err != nil {
		log.Fatalf("Failed to create MQTT client: %v", err)
	}
	defer mqttClient.Close()
	log.Println("MQTT client connected")

	plantService := service.NewPlantService(db, cfg)
	alarmService := service.NewAlarmService(db, &cfg.Alarm)
	cleaningService := service.NewCleaningService(db)
	forecastService := service.NewForecastService(db, "")
	reportService := service.NewReportService(db)

	invIDs := make([]string, len(cfg.Inverters))
	for i, inv := range cfg.Inverters {
		invIDs[i] = inv.ID
	}
	initCtx := context.Background()
	cleaningService.InitDefaultStrategies(initCtx, invIDs)

	if err := mqttClient.Subscribe(nil); err != nil {
		log.Fatalf("Failed to subscribe to MQTT: %v", err)
	}

	simulator, err := modbus.NewSimulator(cfg, cfg.MQTT.Broker)
	if err != nil {
		log.Printf("Warning: Failed to create Modbus simulator: %v", err)
	} else {
		simulator.Start()
		defer simulator.Stop()
	}

	c := cron.New()
	c.AddFunc("@every 5s", func() {
		if err := plantService.AggregateData(); err != nil {
			log.Printf("Failed to aggregate data: %v", err)
		}
	})
	c.AddFunc(fmt.Sprintf("@every %ds", cfg.Alarm.CheckInterval), func() {
		if err := alarmService.CheckAlarms(); err != nil {
			log.Printf("Failed to check alarms: %v", err)
		}
	})
	c.AddFunc("@every 1h", func() {
		if err := cleaningService.ProcessDroneInspections(); err != nil {
			log.Printf("Failed to process drone inspections: %v", err)
		}
	})
	c.AddFunc("@every 6h", func() {
		if err := forecastService.GenerateForecast(48); err != nil {
			log.Printf("Failed to generate forecast: %v", err)
		}
	})
	c.AddFunc("@every 30m", func() {
		forecastService.FetchWeatherData()
	})
	c.Start()
	defer c.Stop()

	go func() {
		time.Sleep(3 * time.Second)
		forecastService.FetchWeatherData()
		forecastService.GenerateForecast(24)
		cleaningService.SimulateDroneInspection("INV001")
		cleaningService.SimulateDroneInspection("INV002")
		cleaningService.SimulateDroneInspection("INV003")
	}()

	handler := api.NewHandler(plantService, alarmService, cleaningService, forecastService, reportService, db, cfg)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()
	handler.RegisterRoutes(r)

	go func() {
		addr := fmt.Sprintf(":%d", cfg.Server.Port)
		log.Printf("HTTP server starting on %s", addr)
		if err := r.Run(addr); err != nil {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = ctx

	log.Println("Shutdown complete")
}

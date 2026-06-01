package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"coap-gateway/internal/accesslog"
	"coap-gateway/internal/config"
	"coap-gateway/internal/database"
	coapSvc "coap-gateway/internal/coap"
	httpSvc "coap-gateway/internal/http"
	"coap-gateway/internal/mqtt"
	"coap-gateway/pkg/utils"

	"go.uber.org/zap"
)

func itoa(i int) string {
	return strconv.Itoa(i)
}

func main() {
	configPath := flag.String("config", "config.yaml", "Path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		panic("Failed to load config: " + err.Error())
	}

	logger, err := utils.NewLogger(cfg.Log.Level, cfg.Log.Format)
	if err != nil {
		panic("Failed to create logger: " + err.Error())
	}
	defer logger.Sync()

	accessLogger := accesslog.NewLogger(&cfg.AccessLog, logger)
	defer accessLogger.Close()

	logger.Info("Starting CoAP Gateway",
		zap.String("coap_tcp", cfg.Server.CoAP.TCP.Host+":"+itoa(cfg.Server.CoAP.TCP.Port)),
		zap.String("http", cfg.Server.HTTP.Host+":"+itoa(cfg.Server.HTTP.Port)),
		zap.Bool("dtls_enabled", cfg.Server.CoAP.DTLS.Enabled),
		zap.Bool("mqtt_enabled", cfg.MQTT.Enabled),
		zap.Bool("access_log_enabled", cfg.AccessLog.Enabled),
	)

	db, err := database.New(cfg.Database.Path)
	if err != nil {
		logger.Fatal("Failed to open database", zap.Error(err))
	}
	defer db.Close()
	logger.Info("Database initialized", zap.String("path", cfg.Database.Path))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	coapServer := coapSvc.NewServer(cfg, db, logger)
	if err := coapServer.Start(ctx); err != nil {
		logger.Fatal("Failed to start CoAP server", zap.Error(err))
	}

	if err := coapServer.StartDTLS(ctx); err != nil {
		logger.Fatal("Failed to start DTLS server", zap.Error(err))
	}

	mqttBridge := mqtt.NewBridge(cfg, logger, coapServer)
	if err := mqttBridge.Start(); err != nil {
		logger.Fatal("Failed to start MQTT bridge", zap.Error(err))
	}
	defer mqttBridge.Stop()

	httpServer := httpSvc.NewServer(cfg, db, coapServer, logger)
	if err := httpServer.Start(ctx); err != nil {
		logger.Fatal("Failed to start HTTP server", zap.Error(err))
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	sig := <-sigChan

	logger.Info("Received signal, shutting down", zap.String("signal", sig.String()))
	cancel()

	logger.Info("Gateway stopped")
}

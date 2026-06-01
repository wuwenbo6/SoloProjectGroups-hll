package main

import (
	"os"
	"os/signal"
	"syscall"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"

	"log-analyzer/internal/anomaly"
	"log-analyzer/internal/api"
	"log-analyzer/internal/config"
	"log-analyzer/internal/es"
	"log-analyzer/internal/input"
	"log-analyzer/internal/reporting"
	"log-analyzer/internal/rules"
	"log-analyzer/internal/threatintel"
)

func main() {
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	cfg, err := config.Load("config.yaml")
	if err != nil {
		logger.Fatal("Failed to load config", zap.Error(err))
	}

	logLevel := zap.InfoLevel
	if cfg.Logging.Level == "debug" {
		logLevel = zap.DebugLevel
	}
	cfgLog := zap.Config{
		Level:       zap.NewAtomicLevelAt(logLevel),
		Development: false,
		Sampling: &zap.SamplingConfig{
			Initial:    100,
			Thereafter: 100,
		},
		Encoding:         "json",
		EncoderConfig:    zap.NewProductionEncoderConfig(),
		OutputPaths:      []string{"stderr"},
		ErrorOutputPaths: []string{"stderr"},
	}
	cfgLog.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	logger, _ = cfgLog.Build()

	logger.Info("Starting Log Analyzer Server")

	esClient, err := es.NewClient(cfg.Elasticsearch.URL, cfg.Elasticsearch.IndexPrefix, logger)
	if err != nil {
		logger.Fatal("Failed to connect to Elasticsearch", zap.Error(err))
	}
	logger.Info("Connected to Elasticsearch")

	ruleEngine := rules.NewRuleEngine(esClient, cfg.Rules.EventWindowSeconds, logger)
	if err := ruleEngine.LoadRules(); err != nil {
		logger.Error("Failed to load rules", zap.Error(err))
	}

	anomalyDetector := anomaly.NewAnomalyDetector(logger)
	threatIntel := threatintel.NewThreatIntel(logger)
	reportGen := reporting.NewReportGenerator(esClient)

	syslogServer := input.NewSyslogServer(cfg.Server.SyslogPort, esClient, logger)
	syslogServer.SetAnomalyDetector(anomalyDetector)
	syslogServer.SetThreatIntel(threatIntel)
	if err := syslogServer.Start(); err != nil {
		logger.Fatal("Failed to start syslog server", zap.Error(err))
	}

	winlogServer := input.NewWinlogServer(cfg.Server.WinlogPort, esClient, logger)
	if err := winlogServer.Start(); err != nil {
		logger.Error("Failed to start winlog server", zap.Error(err))
	}

	apiServer := api.NewServer(cfg.Server.HTTPPort, esClient, ruleEngine, syslogServer, anomalyDetector, threatIntel, reportGen, logger)
	go func() {
		if err := apiServer.Start(); err != nil {
			logger.Fatal("Failed to start API server", zap.Error(err))
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	logger.Info("Shutting down...")
	syslogServer.Stop()
	logger.Info("Server stopped")
}

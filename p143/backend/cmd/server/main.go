package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/cors"
	"trace-backend/internal/analyzer"
	"trace-backend/internal/api"
	"trace-backend/internal/collector"
	"trace-backend/internal/storage"
)

func main() {
	esURLs := getEnv("ELASTICSEARCH_URLS", "http://localhost:9200")
	urls := strings.Split(esURLs, ",")

	esStorage, err := storage.NewElasticsearchStorage(urls)
	if err != nil {
		log.Fatalf("Failed to connect to Elasticsearch: %v", err)
	}
	log.Println("Connected to Elasticsearch successfully")

	queueSize, _ := strconv.Atoi(getEnv("QUEUE_SIZE", "100000"))
	workerCount, _ := strconv.Atoi(getEnv("WORKER_COUNT", "10"))
	batchSize, _ := strconv.Atoi(getEnv("BATCH_SIZE", "500"))
	flushIntervalSec, _ := strconv.Atoi(getEnv("FLUSH_INTERVAL_SEC", "5"))

	bufferedConfig := &storage.BufferedStorageConfig{
		QueueSize:     queueSize,
		WorkerCount:   workerCount,
		BatchSize:     batchSize,
		FlushInterval: time.Duration(flushIntervalSec) * time.Second,
	}

	bufferedStorage := storage.NewBufferedStorage(esStorage, bufferedConfig)
	bufferedStorage.Start()
	log.Println("Buffered storage started successfully")

	traceAnalyzer := analyzer.NewTraceAnalyzer(esStorage)
	traceAnalyzer.StartCleanupRoutine()
	log.Println("Trace analyzer started successfully")

	otlpCollector := collector.NewOTLPTraceCollector(bufferedStorage, esStorage, traceAnalyzer)
	apiHandler := api.NewHandler(esStorage, bufferedStorage, traceAnalyzer)

	r := gin.Default()

	corsConfig := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})
	r.Use(func(c *gin.Context) {
		corsConfig.HandlerFunc(c.Writer, c.Request)
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/v1/traces", gin.WrapH(http.HandlerFunc(otlpCollector.HandleOTLP)))

	apiHandler.RegisterRoutes(r)

	r.Static("/static", "./static")
	r.StaticFile("/", "./static/index.html")

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			stats := bufferedStorage.GetStats()
			log.Printf("Queue stats - size: %d/%d, queued: %d, processed: %d, dropped: %d, errors: %d",
				stats.QueueSize, stats.QueueCapacity,
				stats.TotalQueued, stats.TotalProcessed,
				stats.TotalDropped, stats.TotalErrors)
		}
	}()

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("Received signal %v, shutting down...", sig)

		bufferedStorage.Stop()

		os.Exit(0)
	}()

	port := getEnv("PORT", "8080")
	log.Printf("Server starting on port %s...", port)
	log.Printf("Configuration - QueueSize: %d, WorkerCount: %d, BatchSize: %d, FlushInterval: %ds",
		queueSize, workerCount, batchSize, flushIntervalSec)

	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

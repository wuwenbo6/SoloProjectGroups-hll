package main

import (
	"context"
	"log"
	"marketdata/internal/database"
	"marketdata/internal/market"
	"marketdata/internal/rabbitmq"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not found: %v", err)
	}

	rabbitmqURL := os.Getenv("RABBITMQ_URL")
	if rabbitmqURL == "" {
		rabbitmqURL = "amqp://admin:admin123@localhost:5672/"
	}

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = "postgres://trader:trader123@localhost:5432/market_data?sslmode=disable"
	}

	port := os.Getenv("MARKET_FEED_PORT")
	if port == "" {
		port = "8080"
	}

	exportDir := os.Getenv("EXPORT_DIR")
	if exportDir == "" {
		exportDir = "./exports"
	}

	rmq, err := rabbitmq.NewConnection(rabbitmqURL)
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer rmq.Close()

	db, err := database.NewDB(dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer db.Close()

	simulator := market.NewSimulator(rmq, db, exportDir)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	simulator.Start(ctx)

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.GET("/api/symbols", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"symbols": market.GetSymbols()})
	})

	r.GET("/api/orderbook/:symbol", func(c *gin.Context) {
		symbol := c.Param("symbol")
		ob := simulator.GetOrderBook(symbol)
		if ob == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "symbol not found"})
			return
		}
		c.JSON(http.StatusOK, ob)
	})

	r.GET("/api/snapshot/:symbol", func(c *gin.Context) {
		symbol := c.Param("symbol")
		snap := simulator.GetSnapshot(symbol)
		if snap == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "symbol not found"})
			return
		}
		c.JSON(http.StatusOK, snap)
	})

	r.GET("/api/snapshots", func(c *gin.Context) {
		symbols := market.GetSymbols()
		snapshots := make(map[string]interface{})
		for _, symbol := range symbols {
			snapshots[symbol] = simulator.GetSnapshot(symbol)
		}
		c.JSON(http.StatusOK, gin.H{"data": snapshots})
	})

	r.POST("/api/export/trades", func(c *gin.Context) {
		var req struct {
			Symbol    string `json:"symbol" binding:"required"`
			Format    string `json:"format" binding:"required,oneof=csv json"`
			StartTime int64  `json:"startTime"`
			EndTime   int64  `json:"endTime"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		filePath, count, err := simulator.ExportTrades(ctx, req.Symbol, req.Format, req.StartTime, req.EndTime)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":  true,
			"filePath": filePath,
			"format":   req.Format,
			"count":    count,
		})
	})

	r.GET("/api/export/download/:filename", func(c *gin.Context) {
		filename := c.Param("filename")
		c.FileAttachment(exportDir+"/"+filename, filename)
	})

	go func() {
		log.Printf("Market feed service starting on port %s...", port)
		if err := r.Run(":" + port); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	log.Println("Market feed service started")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down market feed service...")
}

func parseInt64(s string, def int64) int64 {
	if v, err := strconv.ParseInt(s, 10, 64); err == nil {
		return v
	}
	return def
}

package main

import (
	"flag"
	"log"
	"marketdata/internal/database"
	"marketdata/internal/gateway"
	"marketdata/internal/rabbitmq"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	portFlag := flag.String("port", "", "Port to run the gateway on")
	instanceFlag := flag.String("instance", "1", "Instance ID")
	flag.Parse()

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

	port := *portFlag
	if port == "" {
		port = os.Getenv("WS_GATEWAY_PORT")
		if port == "" {
			port = "8081"
		}
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

	instanceID := *instanceFlag
	wsGateway := gateway.NewGateway(rmq, db, instanceID)

	if err := wsGateway.Start(); err != nil {
		log.Fatalf("Failed to start gateway: %v", err)
	}

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
		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"instance": instanceID,
		})
	})

	r.GET("/ws", func(c *gin.Context) {
		wsGateway.HandleWebSocket(c.Writer, c.Request)
	})

	r.GET("/api/symbols", func(c *gin.Context) {
		symbols := []string{"BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT"}
		c.JSON(http.StatusOK, gin.H{"symbols": symbols})
	})

	r.GET("/api/klines/:symbol", func(c *gin.Context) {
		symbol := c.Param("symbol")
		interval := c.DefaultQuery("interval", "1m")
		limit := 100

		klines, err := db.GetKlines(c.Request.Context(), symbol, interval, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": klines})
	})

	go func() {
		log.Printf("WebSocket Gateway instance %s starting on port %s...", instanceID, port)
		if err := r.Run(":" + port); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down gateway...")
}

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"gtp-simulator/internal/api"
	"gtp-simulator/internal/network"
)

func main() {
	fmt.Println(`
	╔══════════════════════════════════════════════════════════════╗
	║              GTPv1 隧道模拟器 - SGSN ↔ GGSN                  ║
	║    GPRS Tunneling Protocol v1 Simulation System              ║
	╚══════════════════════════════════════════════════════════════╝
	`)

	gin.SetMode(gin.ReleaseMode)

	sgsn, err := network.NewSGSN("127.0.0.1", 2123, 2152, "127.0.0.1", 3123, 3152)
	if err != nil {
		log.Fatalf("Failed to create SGSN: %v", err)
	}

	ggsn, err := network.NewGGSN("127.0.0.1", 3123, 3152)
	if err != nil {
		log.Fatalf("Failed to create GGSN: %v", err)
	}

	if err := sgsn.Start(); err != nil {
		log.Fatalf("Failed to start SGSN: %v", err)
	}
	fmt.Println("[OK] SGSN started successfully")
	fmt.Printf("     Control Plane: %s:%d (GTP-C)\n", sgsn.IP, sgsn.ControlPort)
	fmt.Printf("     User Plane:    %s:%d (GTP-U)\n", sgsn.IP, sgsn.UserPort)

	if err := ggsn.Start(); err != nil {
		log.Fatalf("Failed to start GGSN: %v", err)
	}
	fmt.Println("[OK] GGSN started successfully")
	fmt.Printf("     Control Plane: %s:%d (GTP-C)\n", ggsn.IP, ggsn.ControlPort)
	fmt.Printf("     User Plane:    %s:%d (GTP-U)\n", ggsn.IP, ggsn.UserPort)

	r := gin.Default()

	apiServer := api.NewServer(sgsn, ggsn)
	apiServer.SetupRoutes(r)

	httpServer := &http.Server{
		Addr:    ":8080",
		Handler: r,
	}

	go func() {
		fmt.Println("\n[OK] HTTP API server starting on :8080")
		fmt.Println("     Web UI:    http://localhost:8080/")
		fmt.Println("     API Docs:  http://localhost:8080/api/health")
		fmt.Println("\n══════════════════════════════════════════════════════════════")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start HTTP server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("\n\n[INFO] Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server forced to shutdown: %v", err)
	}

	sgsn.Stop()
	ggsn.Stop()

	fmt.Println("[OK] All services stopped successfully")
	fmt.Println("[OK] Goodbye!")
}

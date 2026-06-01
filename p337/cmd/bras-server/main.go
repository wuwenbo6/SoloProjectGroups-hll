package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"bras-simulator/internal/api"
	"bras-simulator/internal/bras"
)

func main() {
	port := 8080
	if len(os.Args) > 1 {
		port = api.ParsePort(os.Args[1])
	}

	bras := bras.NewBRAS()
	if err := bras.Start(); err != nil {
		log.Fatalf("Failed to start BRAS: %v", err)
	}
	defer bras.Stop()

	apiServer := api.NewAPIServer(bras, port)

	go func() {
		if err := apiServer.Start(); err != nil {
			log.Printf("API server stopped: %v", err)
		}
	}()
	defer apiServer.Stop()

	fmt.Println("========================================")
	fmt.Println("  BRAS Simulator Started Successfully")
	fmt.Println("========================================")
	fmt.Printf("  API Server:   http://localhost:%d\n", port)
	fmt.Printf("  Web UI:       http://localhost:%d/\n", port)
	fmt.Println("========================================")
	fmt.Println("  Default Users:")
	fmt.Println("    user001 / password001")
	fmt.Println("    user002 / password002")
	fmt.Println("    user003 / password003")
	fmt.Println("    admin / admin123")
	fmt.Println("    testuser / test123")
	fmt.Println("========================================")
	fmt.Println("  Press Ctrl+C to stop")
	fmt.Println("========================================")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down BRAS Simulator...")
}

package main

import (
	"log"

	"gptp-simulator/internal/ptp"
	"gptp-simulator/internal/server"
)

func main() {
	config := ptp.DefaultSimulatorConfig()
	simulator := ptp.NewSimulator(config)

	srv := server.NewServer(simulator)

	log.Println("gPTP Simulator starting...")
	log.Println("Open http://localhost:8081 to view the dashboard")

	if err := srv.Start(":8081"); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

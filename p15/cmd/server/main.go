package main

import (
	"log"
	"fpga-compiler-service/pkg/api"
	"fpga-compiler-service/pkg/database"
	"fpga-compiler-service/pkg/scheduler"
)

func main() {
	if err := database.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.CloseDB()

	if err := scheduler.InitScheduler(); err != nil {
		log.Printf("Warning: Failed to initialize Kubernetes scheduler: %v", err)
		log.Println("Running in local mode without Kubernetes")
	}

	router := api.SetupRouter()

	log.Println("FPGA Compiler Service starting on :8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

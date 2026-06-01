package main

import (
	"log"
	"time"

	"modbus-gateway/api"
	"modbus-gateway/modbus"
	"modbus-gateway/stats"
	"modbus-gateway/system"
)

func main() {
	sysStatus := system.NewStatus()
	sysStatus.StartupTime = time.Now().Format(time.RFC3339)

	router := modbus.NewRouter()
	statsMgr := stats.NewManager()
	forwarder := modbus.NewForwarder(router, statsMgr, sysStatus)

	modbusPort, err := forwarder.StartTCPServer(502, 50)
	if err != nil {
		log.Printf("Warning: %v", err)
		log.Println("Falling back to port 1502...")
		modbusPort, err = forwarder.StartTCPServer(1502, 50)
		if err != nil {
			log.Fatalf("Failed to start Modbus TCP server on any port: %v", err)
		}
	}

	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			allStats := statsMgr.GetAll()
			_ = allStats
		}
	}()

	server := api.NewServer(router, forwarder, statsMgr, sysStatus)
	engine := server.SetupRoutes()

	sysStatus.SetHTTPPort(8080)
	sysStatus.SetHTTPRunning(true)

	log.Printf("API server listening on :8080")
	log.Printf("WebSocket available at ws://localhost:8080/ws")
	log.Printf("Modbus TCP server listening on :%d", modbusPort)
	log.Println("Frontend should be served separately and connect to :8080")

	if err := engine.Run(":8080"); err != nil {
		sysStatus.SetHTTPRunning(false)
		log.Fatalf("API server failed: %v", err)
	}
}

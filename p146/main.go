package main

import (
	"fmt"
	"log"
	"modbus-simulator/backend"
	"modbus-simulator/web"
)

func main() {
	fmt.Println("=== Modbus Slave Simulator ===")

	config := &backend.SimulatorConfig{
		Slaves: []backend.SlaveConfig{
			{ID: 1, Port: 5021, Name: "PLC-A"},
			{ID: 2, Port: 5022, Name: "PLC-B"},
			{ID: 3, Port: 5023, Name: "PLC-C"},
		},
	}

	simulator := backend.NewModbusSimulator(config)
	if err := simulator.Start(); err != nil {
		log.Fatalf("Failed to start simulator: %v", err)
	}

	apiServer := web.NewAPIServer(simulator)
	go func() {
		if err := apiServer.Start(":8080"); err != nil {
			log.Fatalf("API Server error: %v", err)
		}
	}()

	fmt.Println("Modbus Simulators running on ports: 5021, 5022, 5023")
	fmt.Println("Web Interface: http://localhost:8080")
	fmt.Println("Press Ctrl+C to stop...")

	select {}
}

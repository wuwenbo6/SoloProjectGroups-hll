package main

import (
	"fmt"
	"log"
	"mqtt-attr-broker/internal/api"
	"mqtt-attr-broker/internal/broker"
	"mqtt-attr-broker/internal/router"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	attrRouter := router.NewAttributeRouter()

	mqttBroker := broker.NewMQTTBroker(attrRouter, ":1883")

	httpAPI := api.NewAPI(attrRouter, mqttBroker, ":8080")

	go func() {
		if err := httpAPI.Start(); err != nil {
			log.Printf("HTTP API stopped: %v", err)
		}
	}()

	go func() {
		if err := mqttBroker.Start(); err != nil {
			log.Printf("MQTT Broker stopped: %v", err)
		}
	}()

	fmt.Println("==================================================")
	fmt.Println("MQTT v5 Attribute Router Broker")
	fmt.Println("==================================================")
	fmt.Println("MQTT Port: :1883")
	fmt.Println("HTTP API Port: :8080")
	fmt.Println("Web Dashboard: http://localhost:8080/")
	fmt.Println("==================================================")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\nShutting down...")
	mqttBroker.Stop()
	httpAPI.Stop()
}
